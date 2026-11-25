/**
 * ECHO — AniList anime+manga job split regression (A1 e2e finding).
 * ALL network access is mocked: globalThis.fetch is stubbed — no live calls.
 *
 * The federated router splits AniList into an anime job and a manga job when
 * a search covers both categories. The engine identified jobs by
 * `registryId:providerId`, so BOTH AniList jobs computed the same key and the
 * manga job silently overwrote the anime job's state and results — every
 * "All" search (the Add dialog's default tab) showed zero live anime
 * results. Found by the A1 e2e suite; fixed by the explicit job key
 * (router.ts ResolvedProviderJob.key + engine.ts jobKey).
 */

import "fake-indexeddb/auto";
import { describe, expect, test } from "bun:test";
import type { MediaItem } from "../types";
import { runFederatedSearch } from "../federated/engine";

describe("AniList anime + manga job split (jobKey collision regression)", () => {
  test("searching anime AND manga together keeps BOTH result sets — the manga job no longer overwrites the anime job", async () => {
    const seen: string[] = [];
    // give the anime and manga paths distinguishable answers by watching
    // the query text — this test drives the real router + engine split
    const realFetch2 = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.includes("graphql.anilist.co")) return new Response("{}", { status: 500 });
      const body = String(init?.body ?? "");
      const isManga = body.includes("type: MANGA");
      seen.push(isManga ? "MANGA" : "ANIME");
      const media = isManga
        ? [{ id: 100, title: { romaji: "Yotsuba to!", english: "Yotsuba&!" }, startDate: { year: 2003 }, genres: ["Comedy"], format: "MANGA", volumes: 15, chapters: 110, status: "RELEASING", isAdult: false }]
        : [
            { id: 1, title: { romaji: "Cowboy Bebop", english: "Cowboy Bebop" }, startDate: { year: 1998 }, genres: ["Action"], format: "TV", episodes: 26, isAdult: false, countryOfOrigin: "JP" },
            { id: 2, title: { romaji: "Samurai Champloo", english: "Samurai Champloo" }, startDate: { year: 2004 }, genres: ["Action"], format: "TV", episodes: 26, isAdult: false, countryOfOrigin: "JP" },
          ];
      return new Response(JSON.stringify({ data: { Page: { media } } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const snap = await runFederatedSearch("split regression", {
        categories: ["anime", "manga"],
        limitPerProvider: 8,
        includeLocal: false,
      });
      // both graphql paths fired
      expect(seen).toContain("ANIME");
      expect(seen).toContain("MANGA");
      // both provider states exist and are separate (the bug: the manga
      // state overwrote the anime state under the shared anilist:anilist key)
      const anilistStates = snap.providers.filter((p) => p.id === "anilist");
      expect(anilistStates.length).toBe(2);
      expect(anilistStates.map((s) => s.categories.join(",")).sort()).toEqual(["anime", "manga"]);
      // and both result sets survive into the hits
      const titles = snap.hits.map((h) => h.item.title);
      expect(titles).toContain("Cowboy Bebop");
      expect(titles).toContain("Samurai Champloo");
      expect(titles).toContain("Yotsuba&!");
    } finally {
      globalThis.fetch = realFetch2;
    }
  });
});
