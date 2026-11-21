/**
 * ECHO — Manual-title matching tests (pure logic, no network).
 * Run: bun test src/lib/echo/__tests__
 */

import { describe, expect, test } from "bun:test";
import type { MediaItem } from "../types";
import { AUTO_LINK_THRESHOLD, matchCandidates, scoreMatch } from "../providers/match";

function manual(over: Partial<MediaItem> & { title: string }): MediaItem {
  return {
    localId: `manual:test-${over.title.toLowerCase().replace(/\s+/g, "-")}`,
    provider: "manual",
    providerId: over.title,
    mediaType: "movie",
    format: "film",
    genres: [],
    tags: [],
    ...over,
  };
}

function provider(over: Partial<MediaItem> & { title: string }): MediaItem {
  return {
    localId: `imdb:tt${Math.abs(over.title.length * 7919)}`,
    provider: "imdb",
    providerId: "tt0000001",
    mediaType: "movie",
    format: "film",
    genres: [],
    tags: [],
    ...over,
  };
}

describe("manual matching", () => {
  test("exact title + same year is a confident auto-link", () => {
    const m = manual({ title: "Inception", releaseYear: 2010 });
    const c = provider({ title: "Inception", releaseYear: 2010 });
    const s = scoreMatch(m, c);
    expect(s).toBeGreaterThanOrEqual(AUTO_LINK_THRESHOLD);
  });

  test("type mismatch never matches", () => {
    const m = manual({ title: "Inception", mediaType: "movie", format: "film" });
    const c = provider({ title: "Inception", mediaType: "series", format: "series" });
    expect(scoreMatch(m, c)).toBe(0);
  });

  test("unrelated titles never match", () => {
    const m = manual({ title: "That Obscure 90s OVA" });
    const c = provider({ title: "Titanic" });
    expect(scoreMatch(m, c)).toBe(0);
  });

  test("year mismatch lowers confidence below auto-link", () => {
    const m = manual({ title: "Inception", releaseYear: 1999 });
    const c = provider({ title: "Inception", releaseYear: 2010 });
    expect(scoreMatch(m, c)).toBeLessThan(AUTO_LINK_THRESHOLD);
  });

  test("unknown year on one side is neutral, not penalized", () => {
    const m = manual({ title: "Inception" });
    const c = provider({ title: "Inception", releaseYear: 2010 });
    const known = scoreMatch(manual({ title: "Inception", releaseYear: 2010 }), c);
    const unknown = scoreMatch(m, c);
    expect(unknown).toBeGreaterThan(0);
    expect(unknown).toBeLessThan(known);
  });

  test("matchCandidates ranks the right hit first", () => {
    const m = manual({ title: "Breaking Bad", releaseYear: 2008, mediaType: "series", format: "series" });
    const good = provider({ title: "Breaking Bad", releaseYear: 2008, mediaType: "series", format: "series", localId: "tvmaze:1" });
    const weak = provider({ title: "Breaking In", releaseYear: 2011, mediaType: "series", format: "series", localId: "tvmaze:2" });
    const ranked = matchCandidates(m, [weak, good]);
    expect(ranked[0].item.localId).toBe(good.localId);
    expect(ranked.length).toBeGreaterThan(0);
  });

  test("normalization ignores case, punctuation and accents", () => {
    const m = manual({ title: "Amélie  " });
    const c = provider({ title: "amelie" });
    const s = scoreMatch(m, c);
    expect(s).toBeGreaterThanOrEqual(AUTO_LINK_THRESHOLD);
  });
});
