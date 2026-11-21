/**
 * ECHO — Manual-title matching.
 *
 * Manual entries have no artwork or rich metadata. This module matches them
 * against the real catalogue providers so any title the user adds can carry
 * its REAL poster, genres and synopsis on the map.
 *
 * Matching is deterministic and conservative: exact (normalized) title +
 * compatible year + same media type. No fuzzy "probably" links.
 */

import type { MediaItem } from "../types";
import { searchCatalogue } from ".";

export interface ScoredMatch {
  item: MediaItem;
  score: number; // 0..1
  reason: "exact" | "contains" | "tokens";
}

function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(normalizeTitle(s).split(" ").filter((w) => w.length > 1));
}

/** 1 = same title, 0 = unrelated. */
function titleScore(a: string, b: string): { score: number; how: ScoredMatch["reason"] } {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return { score: 0, how: "tokens" };
  if (na === nb) return { score: 1, how: "exact" };
  if (na.includes(nb) || nb.includes(na)) return { score: 0.85, how: "contains" };
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return { score: 0, how: "tokens" };
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  const overlap = shared / Math.min(ta.size, tb.size);
  return { score: overlap >= 1 ? 0.85 : overlap, how: "tokens" };
}

/** 1 = same year, 0.6 = unknown year (neutral), penalties for mismatches. */
function yearScore(a?: number, b?: number): number {
  if (!a || !b) return 0.6; // one side unknown — neutral, not penalized
  if (a === b) return 1;
  if (Math.abs(a - b) <= 1) return 0.85;
  if (Math.abs(a - b) <= 3) return 0.4;
  return 0;
}

/**
 * Confidence that `candidate` is the same work as `manual`.
 * Media type must be compatible; year and title are weighted.
 */
export function scoreMatch(manual: MediaItem, candidate: MediaItem): number {
  if (manual.mediaType !== candidate.mediaType) return 0;
  const ts = titleScore(manual.title, candidate.title);
  if (ts.score < 0.6) return 0;
  const ys = yearScore(manual.releaseYear, candidate.releaseYear);
  // title carries more weight than year (providers mis-date first/last seasons)
  return ts.score * 0.72 + ys * 0.28;
}

/** Minimum confidence to auto-link without asking the user. */
export const AUTO_LINK_THRESHOLD = 0.82;

/** Candidates worth showing in the manual "link to source" picker. */
export function matchCandidates(
  manual: MediaItem,
  candidates: MediaItem[],
  min = 0.55,
): ScoredMatch[] {
  return candidates
    .map((item) => {
      const s = scoreMatch(manual, item);
      const ts = titleScore(manual.title, item.title);
      return { item, score: s, reason: ts.how } satisfies ScoredMatch;
    })
    .filter((m) => m.score >= min)
    .sort((a, b) => b.score - a.score || (a.item.localId < b.item.localId ? -1 : 1))
    .slice(0, 6);
}

/**
 * Search the live catalogue for the best match of a manual entry.
 * Returns the provider item when confidently matched, else null.
 */
export async function findBestMatch(
  manual: MediaItem,
): Promise<{ item: MediaItem; score: number } | null> {
  if (manual.provider !== "manual") return null;
  try {
    const outcome = await searchCatalogue(manual.title, {
      mediaTypes: [manual.mediaType],
      limit: 6,
    });
    if (outcome.usedFallback || !outcome.results.length) return null;
    const scored = matchCandidates(
      manual,
      outcome.results.map((r) => r.item),
      0.6,
    );
    if (!scored.length) return null;
    const best = scored[0];
    return best.score >= AUTO_LINK_THRESHOLD ? { item: best.item, score: best.score } : null;
  } catch {
    return null;
  }
}
