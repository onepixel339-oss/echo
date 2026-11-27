/**
 * ECHO — e2e fixtures (A1): provider mocks + shared flow helpers.
 *
 * EVERY external provider is intercepted at the network layer — no live
 * API call is ever made from the e2e suite. Mocks return realistic
 * response shapes (matching each adapter's parser) with clearly synthetic
 * data. Providers we do not need for a flow get valid EMPTY responses so
 * they degrade gracefully instead of erroring.
 */

import { expect, type Page } from "@playwright/test";

/* ------------------------------- fixture data -------------------------------- */

const anilistAnime = [
  {
    id: 1,
    idMal: 1,
    title: { romaji: "Cowboy Bebop", english: "Cowboy Bebop", native: "カウボーイビバップ" },
    description: "A bounty hunter crew travels the solar system. Test synopsis.",
    startDate: { year: 1998 },
    genres: ["Action", "Adventure", "Sci-Fi"],
    tags: [{ name: "Space", rank: 90, isGeneralSpoiler: false }],
    averageScore: 86,
    episodes: 26,
    format: "TV",
    status: "FINISHED",
    coverImage: { extraLarge: "https://img.example.test/anilist/cb.jpg" },
    siteUrl: "https://anilist.co/anime/1",
    isAdult: false,
    countryOfOrigin: "JP",
  },
  {
    id: 2,
    idMal: 2,
    title: { romaji: "Samurai Champloo", english: "Samurai Champloo", native: "サムライチャンプルー" },
    description: "Edo-era wanderers with a modern beat. Test synopsis.",
    startDate: { year: 2004 },
    genres: ["Action", "Adventure"],
    tags: [],
    averageScore: 83,
    episodes: 26,
    format: "TV",
    status: "FINISHED",
    coverImage: { extraLarge: "https://img.example.test/anilist/sc.jpg" },
    siteUrl: "https://anilist.co/anime/2",
    isAdult: false,
    countryOfOrigin: "JP",
  },
];

const anilistManga = [
  {
    id: 100,
    idMal: 100,
    title: { romaji: "Yotsuba to!", english: "Yotsuba&!", native: "よつばと！" },
    description: "Everyday adventures of a cheerful child. Test synopsis.",
    startDate: { year: 2003 },
    genres: ["Comedy", "Slice of Life"],
    tags: [],
    averageScore: 88,
    volumes: 15,
    chapters: 110,
    format: "MANGA",
    status: "RELEASING",
    coverImage: { extraLarge: "https://img.example.test/anilist/yotsuba.jpg" },
    siteUrl: "https://anilist.co/manga/100",
    isAdult: false,
    countryOfOrigin: "JP",
  },
];

const tvmazeShows = [
  {
    score: 0.95,
    show: {
      id: 169,
      name: "Breaking Bad",
      type: "Scripted",
      language: "English",
      genres: ["Drama", "Crime", "Thriller"],
      status: "Ended",
      averageRuntime: 45,
      premiered: "2008-01-20",
      ended: "2013-09-29",
      rating: { average: 9.2 },
      image: { medium: "https://img.example.test/tvmaze/bb.jpg", original: "https://img.example.test/tvmaze/bb.jpg" },
      summary: "<p>A chemistry teacher turns to meth. Test synopsis.</p>",
      url: "https://www.tvmaze.com/shows/169/breaking-bad",
    },
  },
  {
    score: 0.7,
    show: {
      id: 170,
      name: "The Wire",
      type: "Scripted",
      language: "English",
      genres: ["Drama", "Crime"],
      status: "Ended",
      averageRuntime: 60,
      premiered: "2002-06-02",
      ended: "2008-03-09",
      rating: { average: 8.9 },
      image: { medium: "https://img.example.test/tvmaze/wire.jpg", original: "https://img.example.test/tvmaze/wire.jpg" },
      summary: "<p>Baltimore institutions, one season each. Test synopsis.</p>",
      url: "https://www.tvmaze.com/shows/170/the-wire",
    },
  },
];

const openlibDocs = [
  {
    key: "/works/OL893415W",
    title: "The Little Prince",
    author_name: ["Antoine de Saint-Exupéry"],
    first_publish_year: 1943,
    cover_i: 832789,
    subject: ["Science fiction", "Children's stories", "French fiction"],
    language: ["eng"],
  },
];

/** 1×1 transparent PNG for poster URLs so images never break the layout. */
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

function json(payload: unknown, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(payload) };
}

/* ------------------------------ provider mocks -------------------------------- */

/**
 * Intercept every external provider domain. The four routing-relevant
 * sources (AniList, TVMaze, Open Library, Wikidata) return fixture data;
 * everything else returns a valid empty response (graceful degradation).
 */
export async function mockProviders(page: Page): Promise<void> {
  await page.route("**/graphql.anilist.co/*", (route) => {
    const body = route.request().postDataJSON() as { query?: string } | null;
    const isManga = body?.query?.includes("type: MANGA") ?? false;
    const media = isManga ? anilistManga : anilistAnime;
    return route.fulfill(json({ data: { Page: { media } } }));
  });

  await page.route("**/api.tvmaze.com/search/shows*", (route) =>
    route.fulfill(json(tvmazeShows)),
  );
  await page.route("**/api.tvmaze.com/shows/*", (route) =>
    route.fulfill(json(tvmazeShows[0].show)),
  );

  await page.route("**/openlibrary.org/search.json*", (route) =>
    route.fulfill(json({ docs: openlibDocs, numFound: openlibDocs.length })),
  );

  // Wikidata: valid empty answers (no entity graph to fabricate).
  // NOTE: the glob must name the FULL host — `**/wikidata.org/**` does not
  // match `www.wikidata.org` (Playwright globs match hosts exactly after a `/`).
  await page.route("**/www.wikidata.org/**", (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("action") === "wbgetentities") {
      return route.fulfill(json({ entities: {} }));
    }
    return route.fulfill(json({ search: [] }));
  });

  // secondary sources: valid empty responses (inventaire's real host is
  // inventaire.io — NOT api.inventaire.io — that's its docs domain)
  await page.route("**/mediaarts-db.artmuseums.go.jp/sparql*", (route) =>
    route.fulfill(json({ results: { bindings: [] } })),
  );
  await page.route("**/inventaire.io/**", (route) =>
    route.fulfill(json({ results: [] })),
  );
  await page.route("**/catalogue.bnf.fr/api/SRU*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/xml",
      body: '<?xml version="1.0"?><searchRetrieveResponse><numberOfRecords>0</numberOfRecords><records></records></searchRetrieveResponse>',
    }),
  );

  // poster/artwork hosts → tiny PNG
  await page.route("**/img.example.test/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: PNG_1PX }),
  );
}

/* --------------------------------- app helpers -------------------------------- */

/** The onboarding welcome heading. */
export const WELCOME_TITLE = "Everything you watch, play & read — on one map.";

/** Wait until the app shell is mounted (either welcome or main interface). */
export async function waitForApp(page: Page): Promise<void> {
  await expect(page.locator("body")).toContainText("ECHO", { timeout: 20_000 });
}

/** Fresh context → welcome screen is showing. */
export async function expectWelcome(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: WELCOME_TITLE })).toBeVisible();
}

/**
 * Skip onboarding the fast way: start → pick the first interest → continue →
 * skip the seed step entirely → enter the (empty) map.
 */
export async function skipOnboarding(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Start my map" }).click();
  await page.getByRole("button", { name: "Anime" }).first().click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip — start empty" }).click();
  await page.getByRole("button", { name: "Enter my map" }).click();
  await expect(page.getByRole("heading", { name: "A blank sheet" })).toBeVisible();
}

/** Open the Add-title dialog from the empty map screen. */
export async function openAddDialog(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Add first title" }).click();
}

/**
 * Type a query into the open Add dialog and wait for the debounced search
 * (350 ms debounce + provider round-trip) to render results.
 */
export async function searchCatalogueFor(page: Page, query: string): Promise<void> {
  const input = page.getByPlaceholder("Search the catalogue…");
  await input.fill(query);
  // debounce + fetch + render; poll until a result row (or the explicit
  // no-results note) appears inside the dialog list
  await expect
    .poll(
      async () => {
        const rows = await page.locator("dialog li, [role='dialog'] li").count();
        if (rows > 0) return rows;
        const none = await page.getByText("Try fewer words, or add it manually.").count();
        return none > 0 ? -1 : 0;
      },
      { timeout: 15_000 },
    )
    .not.toBe(0);
}

/** Add the titled search result from inside the open dialog. */
export async function addTitleFromSearch(page: Page, title: string): Promise<void> {
  const row = page
    .locator("dialog li, [role='dialog'] li")
    .filter({ hasText: title })
    .first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Add", exact: true }).click();
  await expect(row.getByRole("button", { name: "In library" })).toBeVisible();
}

/**
 * Close a radix dialog/sheet via its Close button — Escape is unreliable
 * here because radix marks the background app aria-hidden.
 */
export async function closeDialog(page: Page): Promise<void> {
  await page
    .locator("dialog button, [data-slot='dialog-content'] button, [data-slot='sheet-content'] button")
    .filter({ hasText: "Close" })
    .first()
    .click();
}

/* ------------------------- direct IndexedDB seeding --------------------------- */

export interface SeedItem {
  localId: string;
  provider: string;
  providerId: string;
  title: string;
  mediaType: "anime" | "movie" | "series" | "game" | "book" | "manga" | "comics";
  format: "film" | "series" | "game" | "book";
  genres: string[];
  tags?: string[];
  releaseYear?: number;
  rating?: number;
}

/**
 * Seed the library directly into IndexedDB (the app's own persistence —
 * DB `echo-universe`, stores `media` / `entries` / `kv`), then reload so
 * hydration picks it up. Used by flows that need a library WITHOUT driving
 * the full search UI first (offline, export/import).
 */
export async function seedIndexedDB(page: Page, items: SeedItem[]): Promise<void> {
  await page.evaluate(async (seed) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("echo-universe");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = () => {
        // if the app has not created its stores yet, create what we need
        const d = req.result;
        for (const name of ["kv", "media", "entries", "feedback", "mapLayout", "demoEntries", "demoMedia", "works", "workLinks", "catalog"]) {
          if (!d.objectStoreNames.contains(name)) d.createObjectStore(name);
        }
      };
    });
    const now = new Date().toISOString();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(["media", "entries"], "readwrite");
      for (const item of seed) {
        t.objectStore("media").put(
          {
            localId: item.localId,
            provider: item.provider,
            providerId: item.providerId,
            mediaType: item.mediaType,
            format: item.format,
            title: item.title,
            genres: item.genres,
            tags: item.tags ?? [],
            releaseYear: item.releaseYear,
          },
          item.localId,
        );
        t.objectStore("entries").put(
          {
            id: `entry_${item.localId.replace(/[^a-z0-9]/gi, "")}`,
            mediaLocalId: item.localId,
            status: "completed",
            rating: item.rating ?? 4,
            isFavourite: false,
            userTags: [],
            addedAt: now,
            updatedAt: now,
            completedAt: now,
          },
          `entry_${item.localId.replace(/[^a-z0-9]/gi, "")}`,
        );
      }
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
    // settings: mark onboarded so the app boots into the map
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(["kv"], "readwrite");
      t.objectStore("kv").put(
        {
          language: "en",
          theme: "dark",
          interests: ["anime", "movie", "series", "game", "book", "manga", "comics"],
          onboarded: true,
          onboardedAt: now,
          demoMode: false,
          contentVisibility: "moderate",
          recencyWeight: true,
          mapLabels: true,
          animations: true,
          excludedGenres: [],
          dismissedInsights: [],
          schemaVersion: 3,
        },
        "settings",
      );
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
    db.close();
  }, items);
  await page.reload();
  await waitForApp(page);
}
