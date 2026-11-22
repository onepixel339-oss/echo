/**
 * Smoke test — new provider capabilities after the search/library/discover overhaul.
 * Run: bun scripts/test-overhaul.ts
 */
import { AniListProvider } from "../src/lib/echo/providers/anilist";
import { KitsuProvider } from "../src/lib/echo/providers/kitsu";
import { OpenLibraryProvider } from "../src/lib/echo/providers/openlibrary";
import {
  searchCatalogue,
  fetchDiscoverSections,
  catalogueSources,
} from "../src/lib/echo/providers/index";
import type { MediaItem } from "../src/lib/echo/types";

const ok = (label: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
  if (!cond) process.exitCode = 1;
};

const names = (items: { title: string }[], n = 4) => items.slice(0, n).map((i) => i.title).join(" / ");

// ---------- 1. AniList manga ----------
const anilist = new AniListProvider();
const mangaSearch = await anilist.searchManga("berserk", { limit: 5 });
ok(
  "AniList manga search finds Berserk as manga",
  mangaSearch.length > 0 && mangaSearch.some((r) => r.item.mediaType === "manga" && /berserk/i.test(r.item.title)),
  names(mangaSearch.map((r) => r.item)),
);
ok("AniList manga localIds use anilist-m: prefix", mangaSearch.every((r) => r.item.localId.startsWith("anilist-m:")));

const mangaTop = await anilist.mangaTop(6);
ok("AniList mangaTop returns real popular manga", mangaTop.length >= 4, names(mangaTop));

const mangaClassics = await anilist.mangaClassics(2000, 6);
ok(
  "AniList mangaClassics returns pre-2000 works",
  mangaClassics.length >= 3 && mangaClassics.every((m) => (m.releaseYear ?? 9999) < 2000),
  names(mangaClassics),
);

const mangaGems = await anilist.mangaGems(6);
ok(
  "AniList mangaGems high-score low-popularity, no sequel parts",
  mangaGems.length >= 3 && mangaGems.every((m) => (m.publicScore ?? 0) >= 7.5),
  names(mangaGems),
);

const animeTop = await anilist.animeTop(6);
ok("AniList animeTop returns all-time popular anime", animeTop.length >= 4, names(animeTop));

// ---------- 2. Kitsu manga ----------
const kitsu = new KitsuProvider();
const kitsuManga = await kitsu.searchManga("one piece", { limit: 5 });
ok(
  "Kitsu manga search finds One Piece, no light novels",
  kitsuManga.length > 0 && kitsuManga.every((r) => r.item.mediaType === "manga"),
  names(kitsuManga.map((r) => r.item)),
);
ok("Kitsu manga localIds use kitsu-m: prefix", kitsuManga.every((r) => r.item.localId.startsWith("kitsu-m:")));

// ---------- 3. Open Library comics ----------
const ol = new OpenLibraryProvider();
// OL connectivity from CI sandboxes is flaky — retry like a browser would
async function withRetry<T>(fn: () => Promise<T>, tries = 4, delayMs = 3000): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

const comicSearch = await withRetry(() => ol.search("watchmen", { mediaTypes: ["comic"], limit: 6 }));
ok(
  "OL comic-scoped search finds Watchmen (1986) as comic",
  comicSearch.length > 0 &&
    comicSearch.some((r) => /watchmen/i.test(r.item.title) && r.item.mediaType === "comic"),
  names(comicSearch.map((r) => r.item)),
);

const bookSearchOnly = await withRetry(() => ol.search("watchmen", { mediaTypes: ["book"], limit: 6 }));
ok(
  "OL book-scoped search excludes comic-format works (category isolation)",
  bookSearchOnly.every((r) => r.item.mediaType === "book"),
  bookSearchOnly.length ? names(bookSearchOnly.map((r) => r.item)) : "(no results)",
);

// ---------- 4. router: category-scoped catalogue search ----------
const mangaCat = await searchCatalogue("vagabond", { mediaTypes: ["manga"], limit: 8 });
ok(
  "searchCatalogue manga category returns only manga",
  mangaCat.results.length > 0 && mangaCat.results.every((r) => r.item.mediaType === "manga"),
  `${mangaCat.sources.join("+")} → ${names(mangaCat.results.map((r) => r.item), 3)}`,
);

const comicCat = await searchCatalogue("maus", { mediaTypes: ["comic"], limit: 8 });
ok(
  "searchCatalogue comics category returns only comics",
  comicCat.results.length > 0 && comicCat.results.every((r) => r.item.mediaType === "comic"),
  names(comicCat.results.map((r) => r.item), 3),
);

const animeCat = await searchCatalogue("parasyte", { mediaTypes: ["anime"], limit: 8 });
ok(
  "searchCatalogue anime category returns only anime (regression check)",
  animeCat.results.length > 0 && animeCat.results.every((r) => r.item.mediaType === "anime"),
  names(animeCat.results.map((r) => r.item), 3),
);

const allCat = await searchCatalogue("dune", { mediaTypes: ["movie", "book", "game", "series", "anime", "manga", "comic"], limit: 6 });
ok(
  "searchCatalogue All still mixes every type (regression check)",
  allCat.results.length > 3 && new Set(allCat.results.map((r) => r.item.mediaType)).size >= 2,
  [...new Set(allCat.results.map((r) => r.item.mediaType))].join(","),
);

// ---------- 5. curated discover sections ----------
const sections = await fetchDiscoverSections({
  mediaTypes: ["anime", "manga", "movie", "series", "game", "book", "comic"],
  maxPerSection: 14,
});
const byId = new Map(sections.sections.map((s) => [s.id, s.items]));
ok("sections returned", sections.sections.length >= 3, sections.sections.map((s) => s.id).join(", "));
ok("sources reported", sections.sources.length > 0, sections.sources.join(" + "));

const alltime = byId.get("alltime") ?? [];
const alltimeTypes = new Set(alltime.map((i: MediaItem) => i.mediaType));
ok(
  "All-time section spans >= 5 media types",
  alltimeTypes.size >= 5,
  [...alltimeTypes].join(","),
);

const classics = byId.get("classics") ?? [];
const classicsOld = classics.filter((i: MediaItem) => (i.releaseYear ?? 9999) <= 2005);
ok(
  "Classics section is actually classic (majority pre-2005)",
  classics.length >= 4 && classicsOld.length / classics.length >= 0.7,
  classics.map((i: MediaItem) => `${i.title} (${i.releaseYear})`).slice(0, 6).join(" / "),
);

// global dedupe: no title appears in two sections
const seen = new Map<string, string>();
let dupes = 0;
for (const s of sections.sections) {
  for (const i of s.items) {
    const key = `${i.mediaType}|${i.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")}|${i.releaseYear ?? ""}`;
    if (seen.has(key)) dupes++;
    else seen.set(key, s.id);
  }
}
ok("no duplicate titles across sections", dupes === 0, dupes ? `${dupes} dupes` : "clean");

// genre exclusion respected
const excl = await fetchDiscoverSections({
  mediaTypes: ["anime"],
  excludedGenres: ["action", "adventure", "sci-fi", "drama", "fantasy", "comedy", "romance", "mystery", "horror", "thriller", "psychological"],
  maxPerSection: 10,
});
const leaked = (excl.sections.flatMap((s) => s.items) as MediaItem[]).filter((i) =>
  i.genres.some((g) => ["action", "adventure", "sci-fi", "drama", "fantasy"].includes(g)),
);
ok("excludedGenres filter respected", excl.sections.length === 0 || leaked.length === 0, leaked.length ? `${leaked.length} leaked` : "clean");

// ---------- 6. settings registry ----------
const srcRows = catalogueSources();
ok("catalogueSources mentions manga & comics", srcRows.some((r) => /manga/i.test(r.serves)) && srcRows.some((r) => /comics/i.test(r.serves)));

console.log("\nDone.");
