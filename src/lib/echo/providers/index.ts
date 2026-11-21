/**
 * ECHO — Catalogue router.
 *
 * Real sources by default (client-side, attributed):
 *   anime  → AniList  (graphql.anilist.co)
 *          → Kitsu    (kitsu.io JSON:API)
 *   series → TVMaze   (api.tvmaze.com)
 *          → IMDb suggestions + Cinemeta details (v3-cinemeta.strem.io)
 *   movies → IMDb suggestions + Cinemeta details (v3-cinemeta.strem.io)
 *   games  → RAWG      (api.rawg.io — built-in key, live out of the box)
 *   books  → Open Library (openlibrary.org — keyless)
 *
 * The labelled demo catalogue is an OFFLINE FALLBACK only: it is used when
 * the network is unavailable so the app stays functional, and every result
 * it produces is tagged "Sample" in the UI.
 */

import { DemoProvider } from "./demo";
import { AniListProvider } from "./anilist";
import { TvMazeProvider } from "./tvmaze";
import { ImdbProvider, ImdbSeriesProvider, cinemetaCatalog, cinemetaTop } from "./imdb";
import { KitsuProvider } from "./kitsu";
import { RawgProvider, rawgByGenre, rawgTop, rawgUpcoming, rawgKeyConfigured } from "./rawg";
import {
  OpenLibraryProvider,
  openLibrarySubject,
  openLibraryTrending,
  openLibraryArabicShelf,
} from "./openlibrary";
import type { CatalogueProvider, ProviderSearchResult, SearchFilters } from "./types";
import { genreDisplay } from "./types";
import type { ContentVisibility, MediaItem, MediaType } from "../types";
import { vocabLabel } from "../data/vocab";
import { cached, TTLCache } from "./cache";

export const demoProvider = new DemoProvider();
export const anilistProvider = new AniListProvider();
export const kitsuProvider = new KitsuProvider();
export const tvmazeProvider = new TvMazeProvider();
export const imdbProvider = new ImdbProvider();
export const imdbSeriesProvider = new ImdbSeriesProvider();
export const rawgProvider = new RawgProvider();
export const openLibraryProvider = new OpenLibraryProvider();

// re-exported for status display (the key itself is built in — no user wiring)
export { rawgKeyConfigured };

export interface CatalogueSearchOutcome {
  results: ProviderSearchResult[];
  /** providers that actually answered */
  sources: string[];
  /** true when we fell back to the offline sample catalogue */
  usedFallback: boolean;
  /** provider ids that failed (for a soft notice) */
  failed: string[];
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Search every relevant real source in parallel; fall back only if offline.
 *  Cached 5 min per (query, types, limit): identical queries from the search
 *  box, onboarding, related-titles, and the server AI route all share one
 *  upstream call set. Only live, non-empty results are cached. */
const searchCache = new TTLCache<CatalogueSearchOutcome>(5 * 60_000);

export async function searchCatalogue(
  query: string,
  filters?: SearchFilters,
): Promise<CatalogueSearchOutcome> {
  const q = query.trim();
  const types = filters?.mediaTypes ?? ["anime", "movie", "series", "game", "book"];
  const limit = filters?.limit ?? 8;
  if (!q) return { results: [], sources: [], usedFallback: false, failed: [] };
  const key = `${q}|${[...types].sort().join(",")}|${limit}`;
  return cached(
    searchCache,
    key,
    () => runCatalogueSearch(q, types, limit),
    (outcome) => !outcome.results.length || outcome.usedFallback,
  );
}

async function runCatalogueSearch(
  q: string,
  types: MediaType[],
  limit: number,
): Promise<CatalogueSearchOutcome> {
  const jobs: { provider: CatalogueProvider; run: () => Promise<ProviderSearchResult[]> }[] = [];

  if (types.includes("anime")) {
    jobs.push({ provider: anilistProvider, run: () => anilistProvider.search(q, { limit }) });
    jobs.push({ provider: kitsuProvider, run: () => kitsuProvider.search(q, { limit }) });
  }
  if (types.includes("movie")) {
    jobs.push({ provider: imdbProvider, run: () => imdbProvider.search(q, { limit }) });
  }
  if (types.includes("series")) {
    jobs.push({ provider: tvmazeProvider, run: () => tvmazeProvider.search(q, { limit }) });
    jobs.push({ provider: imdbSeriesProvider, run: () => imdbSeriesProvider.search(q, { limit }) });
  }
  if (types.includes("game") && rawgProvider.isConfigured()) {
    jobs.push({ provider: rawgProvider, run: () => rawgProvider.search(q, { limit }) });
  }
  if (types.includes("book")) {
    jobs.push({ provider: openLibraryProvider, run: () => openLibraryProvider.search(q, { limit }) });
  }

  const settled = await Promise.allSettled(jobs.map((j) => j.run()));
  const results: ProviderSearchResult[] = [];
  const sources: string[] = [];
  const failed: string[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.length) {
      results.push(...r.value);
      sources.push(jobs[i].provider.label);
    } else if (r.status === "rejected") {
      failed.push(jobs[i].provider.label);
    }
  });

  if (!results.length && isOffline()) {
    // Offline: keep the app usable with the clearly-labelled sample data.
    const fallback = await demoProvider.search(q, { mediaTypes: types, limit });
    return { results: fallback, sources: ["Sample"], usedFallback: true, failed: [] };
  }

  // dedupe near-identical hits across providers of the same medium
  // (AniList↔Kitsu anime, TVMaze↔IMDb series) keeping the first-seen order
  const seenTitle = new Map<string, string>();
  const deduped: ProviderSearchResult[] = [];
  for (const r of results) {
    const key = `${r.item.mediaType}|${r.item.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")}|${r.item.releaseYear ?? ""}`;
    const owner = seenTitle.get(key);
    if (owner && owner !== r.sourceLabel) continue; // cross-provider duplicate
    if (!owner) seenTitle.set(key, r.sourceLabel);
    deduped.push(r);
  }

  // interleave by source so no single provider dominates the list
  const bySource = new Map<string, ProviderSearchResult[]>();
  for (const r of deduped) {
    const list = bySource.get(r.sourceLabel) ?? [];
    list.push(r);
    bySource.set(r.sourceLabel, list);
  }
  const order = [...bySource.keys()];
  const merged: ProviderSearchResult[] = [];
  let i = 0;
  while (merged.length < deduped.length) {
    for (const src of order) {
      const item = bySource.get(src)?.[i];
      if (item) merged.push(item);
    }
    i++;
  }

  // exact/near-exact title matches float to the top — typing "breaking bad"
  // must surface the series itself, not fuzzy games and books first
  const qNorm = q.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  if (qNorm.length >= 2) {
    const exact = merged.filter((r) =>
      r.item.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "") === qNorm,
    );
    const starts = merged.filter((r) => {
      const t = r.item.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
      return t !== qNorm && (t.startsWith(qNorm) || t.includes(qNorm));
    });
    if (exact.length || starts.length) {
      const rest = merged.filter((r) => !exact.includes(r) && !starts.includes(r));
      return { results: [...exact, ...starts, ...rest], sources, usedFallback: false, failed };
    }
  }
  return { results: merged, sources, usedFallback: false, failed };
}

/** Refresh metadata for a stored title, routed by its localId prefix. */
export async function getTitleByLocalId(localId: string): Promise<MediaItem | null> {
  const [prefix, ...rest] = localId.split(":");
  const id = rest.join(":");
  try {
    switch (prefix) {
      case "anilist":
        return await anilistProvider.getTitle(id);
      case "kitsu":
        return await kitsuProvider.getTitle(id);
      case "tvmaze":
        return await tvmazeProvider.getTitle(id);
      case "imdb":
        return await imdbProvider.getTitle(id);
      case "imdb-series":
        return await imdbSeriesProvider.getTitle(id);
      case "rawg":
        return await rawgProvider.getTitle(id);
      case "openlib":
        return await openLibraryProvider.getTitle(id);
      case "echo-demo":
        return await demoProvider.getTitle(id);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export interface CandidatePool {
  pool: MediaItem[];
  sources: string[];
  errors: string[];
}

/**
 * Build a REAL candidate pool for Discover from the user's top genres —
 * now across every catalogue medium:
 *  - anime  → AniList genre-ranked, Kitsu genre-ranked, Kitsu trending
 *  - movies → Cinemeta genre catalogues + Cinemeta all-time top
 *  - series → Cinemeta genre catalogues + Cinemeta all-time top
 *  - games  → RAWG genre/tag pools + RAWG most-added
 *  - books  → Open Library subject shelves + weekly trending
 */
export async function fetchCandidatePool(opts: {
  genres: string[]; // canonical slugs, best first
  mediaTypes: MediaType[];
  includeMature?: boolean;
  visibility?: ContentVisibility;
  limitPerSource?: number;
  /** Arabic-interface users get an Arabic-literature book shelf added. */
  arabicShelf?: boolean;
}): Promise<CandidatePool> {
  const limit = opts.limitPerSource ?? 20;
  const jobs: Promise<{ items: MediaItem[]; source: string }>[] = [];
  const genres = opts.genres.slice(0, 3);
  // RAWG pools are ESRB-gated by the SAME visibility setting (safe/moderate/all)
  const visibility = opts.visibility ?? (opts.includeMature ? "all" : "moderate");

  if (opts.mediaTypes.includes("anime")) {
    jobs.push(
      anilistProvider
        .byGenres(genres, limit, opts.includeMature ?? false)
        .then((items) => ({ items, source: "AniList" })),
      kitsuProvider
        .byGenres(genres, limit, opts.includeMature ?? false)
        .then((items) => ({ items, source: "Kitsu" })),
      kitsuProvider
        .trending(Math.ceil(limit / 2))
        .then((items) => ({ items, source: "Kitsu" })),
    );
  }
  for (const g of genres.slice(0, 2)) {
    const display = genreDisplay(g, vocabLabel(g, "en"));
    if (opts.mediaTypes.includes("movie")) {
      jobs.push(
        cinemetaCatalog("movie", display, limit).then((items) => ({ items, source: "IMDb" })),
      );
    }
    if (opts.mediaTypes.includes("series")) {
      jobs.push(
        cinemetaCatalog("series", display, limit).then((items) => ({ items, source: "IMDb" })),
      );
    }
    if (opts.mediaTypes.includes("game") && rawgProvider.isConfigured()) {
      jobs.push(rawgByGenre(g, limit, visibility).then((items) => ({ items, source: "RAWG" })));
    }
    if (opts.mediaTypes.includes("book")) {
      jobs.push(
        openLibrarySubject(g, limit).then((items) => ({ items, source: "Open Library" })),
      );
    }
  }
  // broad, community-ranked pools so shelves stay rich even for thin taste
  if (opts.mediaTypes.includes("movie")) {
    jobs.push(cinemetaTop("movie", limit).then((items) => ({ items, source: "IMDb" })));
  }
  if (opts.mediaTypes.includes("series")) {
    jobs.push(cinemetaTop("series", limit).then((items) => ({ items, source: "IMDb" })));
  }
  if (opts.mediaTypes.includes("game") && rawgProvider.isConfigured()) {
    jobs.push(rawgTop(limit, visibility).then((items) => ({ items, source: "RAWG" })));
  }
  if (opts.mediaTypes.includes("book")) {
    jobs.push(openLibraryTrending(limit).then((items) => ({ items, source: "Open Library" })));
    if (opts.arabicShelf) {
      jobs.push(openLibraryArabicShelf(16).then((items) => ({ items, source: "Open Library" })));
    }
  }

  const settled = await Promise.allSettled(jobs.map((j) => j));
  const sources: string[] = [];
  const errors: string[] = [];
  const bySource = new Map<string, MediaItem[]>();
  const seen = new Set<string>();
  const seenTitles = new Set<string>();
  for (const r of settled) {
    if (r.status === "fulfilled") {
      sources.push(r.value.source);
      for (const item of r.value.items) {
        if (seen.has(item.localId)) continue;
        // catalogue junk guard: skip unreleased / mis-dated titles
        if (item.releaseYear && item.releaseYear > new Date().getFullYear() + 1) continue;
        // cross-source dedupe by normalized title+year (IMDb vs TVMaze overlap)
        const key = `${item.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")}|${item.releaseYear ?? ""}`;
        if (seenTitles.has(key)) continue;
        seen.add(item.localId);
        seenTitles.add(key);
        const list = bySource.get(r.value.source) ?? [];
        list.push(item);
        bySource.set(r.value.source, list);
      }
    } else {
      errors.push(String((r.reason as Error)?.message ?? r.reason));
    }
  }
  // interleave sources so no single provider dominates the recommendation order
  const order = [...bySource.keys()];
  const pool: MediaItem[] = [];
  let i = 0;
  while (pool.length < seen.size) {
    let pushed = false;
    for (const src of order) {
      const item = bySource.get(src)?.[i];
      if (item) {
        pool.push(item);
        pushed = true;
      }
    }
    if (!pushed) break;
    i++;
  }
  return { pool, sources: [...new Set(sources)], errors };
}

export interface ComingSoonShelf {
  /** unreleased games from today forward (RAWG, community anticipation) */
  games: MediaItem[];
  /** anime airing right now (AniList, trending first) */
  airingAnime: MediaItem[];
}

/**
 * The "coming soon" shelf — upcoming games and currently-airing anime,
 * independent of the user's taste (a calendar, not a recommendation).
 * Both halves are cached upstream (60/30 min) and filtered by the SAME
 * content-visibility setting as everything else.
 */
export async function fetchComingSoon(opts: {
  mediaTypes: MediaType[];
  visibility?: ContentVisibility;
  includeMature?: boolean;
  limitPerShelf?: number;
}): Promise<ComingSoonShelf> {
  const visibility = opts.visibility ?? (opts.includeMature ? "all" : "moderate");
  const includeMature = visibility === "all";
  const limit = opts.limitPerShelf ?? 12;
  const jobs: Promise<MediaItem[]>[] = [];
  const wantGames = opts.mediaTypes.includes("game") && rawgProvider.isConfigured();
  const wantAnime = opts.mediaTypes.includes("anime");

  if (wantGames) jobs.push(rawgUpcoming(limit, visibility));
  else jobs.push(Promise.resolve([]));
  if (wantAnime) jobs.push(anilistProvider.airingNow(limit, includeMature));
  else jobs.push(Promise.resolve([]));

  const [games, airingAnime] = await Promise.all(
    jobs.map((p) => p.catch(() => [] as MediaItem[])),
  );
  return { games, airingAnime };
}

/** Registry shown in Settings → Data sources. */
export function catalogueSources(): {
  id: string;
  label: string;
  serves: string;
  notice: string;
  canonical: string;
}[] {
  return [
    {
      id: "anilist",
      label: "AniList",
      serves: "Anime",
      notice: anilistProvider.getAttribution().notice ?? "",
      canonical: "https://anilist.co/",
    },
    {
      id: "kitsu",
      label: "Kitsu",
      serves: "Anime",
      notice: kitsuProvider.getAttribution().notice ?? "",
      canonical: "https://kitsu.app/",
    },
    {
      id: "tvmaze",
      label: "TVMaze",
      serves: "Series",
      notice: tvmazeProvider.getAttribution().notice ?? "",
      canonical: "https://www.tvmaze.com/",
    },
    {
      id: "imdb",
      label: "IMDb · Cinemeta",
      serves: "Movies & Series",
      notice: imdbProvider.getAttribution().notice ?? "",
      canonical: "https://www.imdb.com/",
    },
    {
      id: "rawg",
      label: "RAWG",
      serves: "Games",
      notice: rawgProvider.getAttribution().notice ?? "",
      canonical: "https://rawg.io/",
    },
    {
      id: "openlib",
      label: "Open Library",
      serves: "Books",
      notice: openLibraryProvider.getAttribution().notice ?? "",
      canonical: "https://openlibrary.org/",
    },
  ];
}

export function allProviders(): CatalogueProvider[] {
  return [
    anilistProvider,
    kitsuProvider,
    tvmazeProvider,
    imdbProvider,
    imdbSeriesProvider,
    rawgProvider,
    openLibraryProvider,
    demoProvider,
  ];
}
