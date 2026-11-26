/**
 * ECHO — API route tests (A1): the six dynamic routes.
 *
 * Every upstream and every AI provider is mocked: no live provider call, no
 * real LLM. The suite pins the operational contract of each route:
 *  - translate: validation, Arabic passthrough, upstream translation
 *  - IGDB / Trakt proxies: unconfigured → { configured:false }, gated by the
 *    registry, credential-safe relay, typed error envelopes
 *  - ask / companion / weekly (AI): validation, rate limits, and the
 *    designed graceful `ai_unavailable` degradation when no provider has
 *    credentials (the platform SDK is mocked to fail exactly as it does on
 *    any external deployment).
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import type { NextResponse } from "next/server";

// The platform AI must behave exactly as it does outside its originating
// sandbox: no credentials → a caught runtime error → ai_unavailable.
mock.module("z-ai-web-dev-sdk", () => ({
  default: {
    create: async () => {
      throw new Error("no platform credentials in this environment");
    },
  },
}));

import { POST as translatePost } from "../../../app/api/echo/translate/route";
import { GET as igdbGet } from "../../../app/api/echo/providers/igdb/route";
import { GET as traktGet } from "../../../app/api/echo/providers/trakt/route";
import { POST as askPost } from "../../../app/api/echo/ai/ask/route";
import { POST as companionPost } from "../../../app/api/echo/ai/companion/route";
import { POST as weeklyPost } from "../../../app/api/echo/ai/weekly/route";
import { setProviderToggles } from "../providers/registry";

/* ------------------------------ helpers ------------------------------------ */

const realFetch = globalThis.fetch;
let fetchResponder: ((url: string, init?: RequestInit) => unknown | null) = () => null;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  fetchResponder = () => null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const out = fetchResponder(String(input), init);
    if (out === null) return jsonResponse({}, 500); // unmocked upstream → "down"
    if (out instanceof Response) return out;
    return jsonResponse(out);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.GEMINI_API_KEY;
  delete process.env.IGDB_CLIENT_ID;
  delete process.env.IGDB_CLIENT_SECRET;
  delete process.env.TRAKT_CLIENT_ID;
  setProviderToggles(null);
});

let ipCounter = 0;
/** Unique IP per request so in-memory per-IP rate limits never bleed between tests. */
function freshIp(): string {
  ipCounter += 1;
  return `10.0.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
}

function jsonRequest(
  url: string,
  body: unknown,
  method: "POST" | "GET" = "POST",
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json", "x-forwarded-for": freshIp() },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

function emptyRequest(url: string): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": freshIp() },
  });
}

async function body(res: NextResponse): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

/* ------------------------------ translate ---------------------------------- */

describe("POST /api/echo/translate", () => {
  test("non-JSON body → 400 bad_body", async () => {
    const req = emptyRequest("http://localhost/api/echo/translate");
    const res = await translatePost(req);
    expect(res.status).toBe(400);
    expect((await body(res)).error).toBe("bad_body");
  });

  test("empty texts array → 400 bad_body", async () => {
    const res = await translatePost(jsonRequest("http://localhost/api/echo/translate", { texts: [] }));
    expect(res.status).toBe(400);
  });

  test("more than 8 texts → 400 (batch clamp)", async () => {
    const res = await translatePost(
      jsonRequest("http://localhost/api/echo/translate", { texts: Array(9).fill("hello") }),
    );
    expect(res.status).toBe(400);
  });

  test("already-Arabic text passes through untouched with zero upstream calls", async () => {
    let upstreamCalls = 0;
    fetchResponder = () => {
      upstreamCalls += 1;
      return null;
    };
    const res = await translatePost(
      jsonRequest("http://localhost/api/echo/translate", { texts: ["ملخص بالعربية"] }),
    );
    expect(res.status).toBe(200);
    const data = await body(res);
    expect(data.ok).toBe(true);
    expect(data.translations).toEqual(["ملخص بالعربية"]);
    expect(upstreamCalls).toBe(0);
  });

  test("English text is translated via the mocked free upstream", async () => {
    fetchResponder = (url) => {
      if (url.includes("translate.googleapis.com")) {
        // Google gtx shape: [[["]]
        return [[["ترجمة تجريبية", "A test synopsis", null, null, 10]], null, "en"];
      }
      return null;
    };
    const res = await translatePost(
      jsonRequest("http://localhost/api/echo/translate", { texts: ["A unique test synopsis for the route suite"] }),
    );
    expect(res.status).toBe(200);
    const data = await body(res);
    expect(data.ok).toBe(true);
    expect(data.translations).toEqual(["ترجمة تجريبية"]);
  });
});

/* ------------------------------ IGDB proxy --------------------------------- */

describe("GET /api/echo/providers/igdb", () => {
  test("no credentials → { configured: false } and no upstream call", async () => {
    let upstream = 0;
    fetchResponder = () => {
      upstream += 1;
      return null;
    };
    const res = await igdbGet(new NextRequest("http://localhost/api/echo/providers/igdb?q=hollow+knight"));
    expect(res.status).toBe(200);
    const data = await body(res);
    expect(data.configured).toBe(false);
    expect(data.results).toEqual([]);
    expect(upstream).toBe(0);
  });

  test("registry-gated off (user toggle) → configured:false even with credentials", async () => {
    setProviderToggles({ igdb: false });
    process.env.IGDB_CLIENT_ID = "test-client-id";
    process.env.IGDB_CLIENT_SECRET = "test-client-secret";
    const res = await igdbGet(new NextRequest("http://localhost/api/echo/providers/igdb?q=hollow+knight"));
    expect(res.status).toBe(200);
    expect((await body(res)).configured).toBe(false);
  });

  test("configured + mocked upstream → normalized results with igdb: localIds", async () => {
    process.env.IGDB_CLIENT_ID = "test-client-id";
    process.env.IGDB_CLIENT_SECRET = "test-client-secret";
    fetchResponder = (url) => {
      if (url.includes("id.twitch.tv/oauth2/token")) return { access_token: "tok", expires_in: 3600 };
      if (url.includes("api.igdb.com/v4/games")) {
        return [
          {
            id: 10320,
            name: "Hollow Knight",
            slug: "hollow-knight",
            summary: "A 2D metroidvania.",
            first_release_date: 1489276800,
            genres: [{ id: 8, name: "Platform" }],
            platforms: [{ abbreviation: "PC" }],
            cover: { image_id: "co1r7a" },
          },
        ];
      }
      return null;
    };
    const res = await igdbGet(new NextRequest("http://localhost/api/echo/providers/igdb?q=hollow+knight+unique"));
    expect(res.status).toBe(200);
    const data = await body(res);
    expect(data.configured).toBe(true);
    const results = data.results as { localId: string; title: string }[];
    expect(results.length).toBe(1);
    expect(results[0].localId).toBe("igdb:10320");
    expect(results[0].title).toBe("Hollow Knight");
  });

  test("configured + upstream failure → typed error envelope, HTTP 200", async () => {
    process.env.IGDB_CLIENT_ID = "test-client-id";
    process.env.IGDB_CLIENT_SECRET = "test-client-secret";
    fetchResponder = () => null; // everything "down"
    const res = await igdbGet(new NextRequest("http://localhost/api/echo/providers/igdb?q=failing+query"));
    expect(res.status).toBe(200);
    const data = await body(res);
    expect(data.configured).toBe(true);
    expect(data.results).toEqual([]);
    expect(data.error).toBe("unavailable");
  });
});

/* ------------------------------ Trakt proxy -------------------------------- */

describe("GET /api/echo/providers/trakt", () => {
  test("no TRAKT_CLIENT_ID → { configured: false } and no upstream call", async () => {
    let upstream = 0;
    fetchResponder = () => {
      upstream += 1;
      return null;
    };
    const res = await traktGet(new NextRequest("http://localhost/api/echo/providers/trakt?q=arrival"));
    expect(res.status).toBe(200);
    const data = await body(res);
    expect(data.configured).toBe(false);
    expect(upstream).toBe(0);
  });

  test("configured + mocked search → normalized results with trakt:movie/<id> localIds", async () => {
    process.env.TRAKT_CLIENT_ID = "test-trakt-client";
    fetchResponder = (url) => {
      if (url.includes("api.trakt.tv/search/movie")) {
        return [
          {
            type: "movie",
            score: 26.019499,
            movie: {
              title: "Arrival",
              year: 2016,
              ids: { trakt: 193426, slug: "arrival-2016", imdb: "tt2543164" },
            },
          },
        ];
      }
      return null;
    };
    const res = await traktGet(new NextRequest("http://localhost/api/echo/providers/trakt?q=arrival+2016"));
    expect(res.status).toBe(200);
    const data = await body(res);
    expect(data.configured).toBe(true);
    const results = data.results as { localId: string; title: string; releaseYear: number }[];
    expect(results.length).toBe(1);
    expect(results[0].localId).toBe("trakt:movie/193426");
    expect(results[0].title).toBe("Arrival");
    expect(results[0].releaseYear).toBe(2016);
  });

  test("details refresh: ?id=movie/193426 resolves via the trakt id search endpoint", async () => {
    process.env.TRAKT_CLIENT_ID = "test-trakt-client";
    fetchResponder = (url) => {
      if (url.includes("api.trakt.tv/search/trakt/193426")) {
        return [
          {
            type: "movie",
            score: 1,
            movie: {
              title: "Arrival",
              year: 2016,
              overview: "A linguist contacts aliens.",
              ids: { trakt: 193426, slug: "arrival-2016", imdb: "tt2543164" },
            },
          },
        ];
      }
      return null;
    };
    const res = await traktGet(
      new NextRequest("http://localhost/api/echo/providers/trakt?id=movie/193426&type=movie"),
    );
    expect(res.status).toBe(200);
    const data = await body(res);
    expect(data.configured).toBe(true);
    expect((data.results as { localId: string }[]).length).toBe(1);
    expect((data.results as { localId: string }[])[0].localId).toBe("trakt:movie/193426");
  });

  test("malformed id → configured:true, empty results (no upstream error leak)", async () => {
    process.env.TRAKT_CLIENT_ID = "test-trakt-client";
    const res = await traktGet(
      new NextRequest("http://localhost/api/echo/providers/trakt?id=not-a-valid-id"),
    );
    expect(res.status).toBe(200);
    const data = await body(res);
    expect(data.configured).toBe(true);
    expect(data.results).toEqual([]);
  });
});

/* ------------------------------ ask (AI) ----------------------------------- */

describe("POST /api/echo/ai/ask", () => {
  test("non-JSON body → 400 bad_body", async () => {
    const res = await askPost(emptyRequest("http://localhost/api/echo/ai/ask"));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toBe("bad_body");
  });

  test("history that does not end with a user turn → 400", async () => {
    const res = await askPost(
      jsonRequest("http://localhost/api/echo/ai/ask", {
        history: [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }],
      }),
    );
    expect(res.status).toBe(400);
  });

  test("no AI provider available → the designed ai_unavailable degradation (HTTP 200)", async () => {
    delete process.env.GEMINI_API_KEY; // no key in this environment
    fetchResponder = () => null; // no Gemini either
    const res = await askPost(
      jsonRequest("http://localhost/api/echo/ai/ask", {
        history: [{ role: "user", content: "recommend me a sci-fi movie" }],
      }),
    );
    expect(res.status).toBe(200); // graceful, not a crash
    const data = await body(res);
    expect(data.ok).toBe(false);
    expect(data.error).toBe("ai_unavailable");
  });

  test("per-IP rate limit trips after 15 requests in the window → 429", async () => {
    const sameIp = "203.0.113.77";
    let limited = 0;
    for (let i = 0; i < 16; i++) {
      const req = new NextRequest("http://localhost/api/echo/ai/ask", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": sameIp },
        body: JSON.stringify({ history: [{ role: "user", content: `q${i}` }] }),
      });
      const res = await askPost(req);
      if (res.status === 429) limited += 1;
    }
    expect(limited).toBeGreaterThan(0);
    const data = await body(
      (await askPost(
        new NextRequest("http://localhost/api/echo/ai/ask", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": sameIp },
          body: JSON.stringify({ history: [{ role: "user", content: "again" }] }),
        }),
      )) as NextResponse,
    );
    expect(data.error).toBe("rate_limited");
  });
});

/* ------------------------------ companion (AI) ------------------------------ */

describe("POST /api/echo/ai/companion", () => {
  test("non-JSON body → 400 bad_body", async () => {
    const res = await companionPost(emptyRequest("http://localhost/api/echo/ai/companion"));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toBe("bad_body");
  });

  test("snapshot without a stats object → 400 (the engine snapshot is required)", async () => {
    const res = await companionPost(
      jsonRequest("http://localhost/api/echo/ai/companion", { lang: "en", islands: [] }),
    );
    expect(res.status).toBe(400);
  });

  test("no AI provider available → ai_unavailable, HTTP 200, rest of app unaffected", async () => {
    delete process.env.GEMINI_API_KEY;
    const res = await companionPost(
      jsonRequest("http://localhost/api/echo/ai/companion", {
        lang: "en",
        stats: { librarySize: 12, ratedCount: 8 },
        islands: [{ label: "Sci-fi corner", titles: ["Arrival", "Interstellar"] }],
      }),
    );
    expect(res.status).toBe(200);
    const data = await body(res);
    expect(data.ok).toBe(false);
    expect(data.error).toBe("ai_unavailable");
  });
});

/* ------------------------------ weekly (AI) --------------------------------- */

describe("POST /api/echo/ai/weekly", () => {
  test("non-JSON body → 400 bad_body", async () => {
    const res = await weeklyPost(emptyRequest("http://localhost/api/echo/ai/weekly"));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toBe("bad_body");
  });

  test("digest without weekActivity → 400 (both engine parts are required)", async () => {
    const res = await weeklyPost(
      jsonRequest("http://localhost/api/echo/ai/weekly", { lang: "en", stats: { librarySize: 5 } }),
    );
    expect(res.status).toBe(400);
  });

  test("no AI provider available → ai_unavailable, HTTP 200", async () => {
    delete process.env.GEMINI_API_KEY;
    const res = await weeklyPost(
      jsonRequest("http://localhost/api/echo/ai/weekly", {
        lang: "ar",
        stats: { librarySize: 5, ratedCount: 3 },
        weekActivity: { added: 1, completed: 2, rated: 3 },
      }),
    );
    expect(res.status).toBe(200);
    const data = await body(res);
    expect(data.ok).toBe(false);
    expect(data.error).toBe("ai_unavailable");
  });
});
