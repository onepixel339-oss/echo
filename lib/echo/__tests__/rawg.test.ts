/**
 * ECHO — RAWG adapter provenance stamping regression (audit G4, A0).
 * ALL network access is mocked: globalThis.fetch is stubbed per test.
 *
 * RAWG records must carry the uniform v2 catalog fields exactly like every
 * other adapter — before A0 they were missing, degrading dedupe/auto-linking
 * to weaker title/year evidence:
 *  - a stable canonical workId
 *  - externalIds.rawg (the adapter's own namespace)
 *  - field-level provenance for every core field the adapter supplies
 *  - providerRef (license status + terms, read from the registry)
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  RawgProvider,
  rawgApiKey,
  rawgKeyConfigured,
  rawgByGenre,
  rawgTop,
  rawgUpcoming,
} from "../providers/rawg";
import { workIdFor } from "../ids";

/* ------------------------------ fixtures ---------------------------------- */

const rawgGame = {
  id: 3498,
  slug: "grand-theft-auto-v",
  name: "Grand Theft Auto V",
  released: "2013-09-17",
  background_image: "https://media.rawg.io/games/630/63098c/gtav.jpg",
  description_raw: "An open world action-adventure game.",
  genres: [{ id: 4, name: "Action", slug: "action" }],
  tags: [{ id: 31, name: "Singleplayer", slug: "singleplayer" }],
  parent_platforms: [{ platform: { id: 1, name: "PC", slug: "pc" } }],
  developers: [{ id: 5, name: "Rockstar North", slug: "rockstar-north" }],
  esrb_rating: { id: 4, name: "Mature", slug: "mature" },
  playtime: 74,
  metacritic: 92,
  rating: 4.47,
  ratings_count: 10523,
  added: 14323,
};

const listResponse = { count: 1, results: [rawgGame] };

/* ------------------------------ fetch stubbing ----------------------------- */

const realFetch = globalThis.fetch;

beforeEach(() => {
  process.env.NEXT_PUBLIC_RAWG_API_KEY = "test-key-regression";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/games?")) return jsonResponse(listResponse);
    if (url.includes(`/games/${rawgGame.id}`)) return jsonResponse(rawgGame);
    return jsonResponse({}, 404);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.NEXT_PUBLIC_RAWG_API_KEY;
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/* ------------------------------ the stamps --------------------------------- */

function assertV2Stamps(item: ReturnType<typeof Object>) {
  expect(item.workId).toBe(workIdFor("rawg", String(rawgGame.id)));
  expect(item.externalIds).toMatchObject({ rawg: String(rawgGame.id) });
  // field-level provenance: every core field the adapter supplies names rawg
  expect(item.provenance).toMatchObject({
    title: "rawg",
    mediaType: "rawg",
    format: "rawg",
    genres: "rawg",
    tags: "rawg",
    releaseYear: "rawg",
    synopsis: "rawg",
    posterUrl: "rawg",
    publicScore: "rawg",
  });
  // providerRef: license + terms from the registry
  expect(item.providerRef).toMatchObject({
    providerId: "rawg",
    licenseStatus: "restricted",
    termsUrl: "https://rawg.io/apidocs",
  });
}

describe("RAWG provenance stamping (G4 regression)", () => {
  test("search results carry workId, externalIds.rawg, provenance and providerRef", async () => {
    const provider = new RawgProvider();
    const results = await provider.search("grand theft auto");
    expect(results.length).toBeGreaterThan(0);
    assertV2Stamps(results[0].item);
    expect(results[0].item.localId).toBe(`rawg:${rawgGame.id}`);
    expect(results[0].item.provider).toBe("rawg");
    expect(results[0].item.providerId).toBe(String(rawgGame.id));
  });

  test("getTitle stamps the same v2 fields on detail fetches", async () => {
    const provider = new RawgProvider();
    const item = await provider.getTitle(String(rawgGame.id));
    expect(item).not.toBeNull();
    assertV2Stamps(item!);
  });

  test("Discover pools (genre, top, upcoming) are stamped like every other adapter", async () => {
    // genre pool + top pool both list the fixture; the upcoming pool filters
    // released titles out, so it is exercised via its empty-result contract
    const [genre, top] = await Promise.all([
      rawgByGenre("action", 5, "all"),
      rawgTop(5, "all"),
    ]);
    expect(genre.length).toBeGreaterThan(0);
    expect(top.length).toBeGreaterThan(0);
    assertV2Stamps(genre[0]);
    assertV2Stamps(top[0]);
    const upcoming = await rawgUpcoming(5, "all");
    expect(Array.isArray(upcoming)).toBe(true);
  });

  test("the key is read lazily from the environment (no frozen module constant)", () => {
    expect(rawgKeyConfigured()).toBe(true);
    expect(rawgApiKey()).toBe("test-key-regression");
    delete process.env.NEXT_PUBLIC_RAWG_API_KEY;
    expect(rawgKeyConfigured()).toBe(false);
    expect(rawgApiKey()).toBe("");
    process.env.NEXT_PUBLIC_RAWG_API_KEY = "test-key-regression"; // restore for afterEach symmetry
  });
});
