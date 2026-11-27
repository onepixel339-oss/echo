/**
 * ECHO — performance baseline capture (A1).
 *
 * Produces docs/PERF_BASELINE.md: the measured numbers every future change
 * is compared against. Four sections:
 *   1. production build time          (budget ≤ 180 s in CI)
 *   2. First Load JS for /            (budget ≤ 200 KB gzipped — measured
 *                                       as gzip of EVERY script the served
 *                                       page actually loads, because Next 16
 *                                       builds no longer print the route
 *                                       size table)
 *   3. engine pipeline benchmark      (bun, in-process: similarity →
 *                                       clusters → layout at 100/250/500)
 *   4. hydrate-to-interactive         (headless Chromium against the
 *                                       standalone production server, 500
 *                                       seeded titles, best of 3)
 *
 * The script is self-contained: it builds, spawns its OWN standalone server
 * on :3101 (never touching a dev server or the e2e server on :3100), seeds
 * IndexedDB directly, and shuts everything down after.
 *
 * Machine-class sandbox hardware — treat absolute values as baselines,
 * ratios as signal. Run: bun run perf-baseline
 */

import { execSync, spawn } from "node:child_process";
import { gzipSync } from "node:zlib";
import { writeFileSync, rmSync, cpSync, existsSync } from "node:fs";

const PORT = 3101;
const DOC = "docs/PERF_BASELINE.md";

/* ------------------------------ helpers ------------------------------------- */

function now(): number {
  return performance.now();
}

function ms(v: number): string {
  return `${v.toFixed(1)} ms`;
}

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server on ${url} did not come up`);
}

/* --------------------------- 1. build time ---------------------------------- */

function measureBuild(): number {
  console.log("perf-baseline: running the production build…");
  const t0 = now();
  execSync("bun run build:standalone", { stdio: "pipe", cwd: process.cwd() });
  const secs = (now() - t0) / 1000;
  console.log(`  build: ${secs.toFixed(1)} s`);
  return secs;
}

/* ------------------------ 2. First Load JS (gzip) --------------------------- */

interface ServerHandle {
  url: string;
  close(): Promise<void>;
}

async function startStandaloneServer(): Promise<ServerHandle> {
  // a private copy of the standalone output so a concurrently running
  // e2e/dev server can never serve stale chunks into the measurement
  const copy = ".next/perf-standalone";
  rmSync(copy, { recursive: true, force: true });
  cpSync(".next/standalone", copy, { recursive: true });
  const proc = spawn("node", ["server.js"], {
    cwd: copy,
    env: { ...process.env, NODE_ENV: "production", PORT: String(PORT) },
    stdio: "ignore",
  });
  const url = `http://localhost:${PORT}`;
  await waitForServer(url);
  return {
    url,
    close: async () => {
      proc.kill("SIGKILL");
      await new Promise((r) => setTimeout(r, 200));
      rmSync(copy, { recursive: true, force: true });
    },
  };
}

async function measureFirstLoadJs(url: string): Promise<number> {
  const res = await fetch(url);
  const html = await res.text();
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  const bodies: Buffer[] = [];
  for (const src of srcs) {
    const r = await fetch(src.startsWith("http") ? src : `${url}${src}`);
    bodies.push(Buffer.from(await r.arrayBuffer()));
  }
  const totalGzip = bodies.reduce((sum, b) => sum + gzipSync(b).length, 0);
  return totalGzip / 1024;
}

/* --------------------------- 3. engine pipeline ------------------------------ */

interface EngineBenchRow {
  size: number;
  similarity: number;
  clusters: number;
  layout: number;
  full: number;
  incremental: number;
}

async function benchEngine(): Promise<EngineBenchRow[]> {
  // dynamic import: the engine is client code, but it is pure and runs in bun
  const { computeIdf } = await import("../lib/echo/engine/features");
  const { buildSimilarityGraph } = await import("../lib/echo/engine/similarity");
  const { computeClusters } = await import("../lib/echo/engine/cluster");
  const { computeLayout } = await import("../lib/echo/engine/layout");
  type MediaItem = import("../lib/echo/types").MediaItem;

  const GENRES = ["action", "drama", "sci-fi", "comedy", "romance", "thriller", "fantasy", "slice-of-life", "mecha", "mystery"];
  const TAGS = ["space", "noir", "stylish", "melancholic", "hopeful", "tense", "whimsical", "dark", "jazz-scored", "family-bonds"];

  function makeLibrary(n: number): MediaItem[] {
    const items: MediaItem[] = [];
    for (let i = 0; i < n; i++) {
      items.push({
        localId: `perf:${i}`,
        provider: "manual",
        providerId: String(i),
        mediaType: (["anime", "movie", "series", "game", "book"] as const)[i % 5],
        format: (["series", "film", "series", "game", "book"] as const)[i % 5],
        title: `Perf Title ${i}`,
        genres: [GENRES[i % GENRES.length], GENRES[(i * 3) % GENRES.length]],
        tags: [TAGS[i % TAGS.length]],
        releaseYear: 1970 + (i % 55),
      } as unknown as MediaItem);
    }
    return items;
  }

  const rows: EngineBenchRow[] = [];
  for (const size of [100, 250, 500]) {
    const items = makeLibrary(size);
    // warm-up run (JIT) then the measured run
    for (let warm = 0; warm < 2; warm++) {
      const t1 = now();
      const idf = computeIdf(items);
      const graph = buildSimilarityGraph(items, { idf });
      const t2 = now();
      const clusters = computeClusters(items, graph);
      const t3 = now();
      const layout = computeLayout(items, graph, clusters, {});
      const t4 = now();
      if (warm === 1) {
        // incremental add: one more title → full recompute of the pipeline
        const bigger = [...items, makeLibrary(1)[0]];
        const ti = now();
        const idf2 = computeIdf(bigger);
        const g2 = buildSimilarityGraph(bigger, { idf: idf2 });
        computeClusters(bigger, g2);
        computeLayout(bigger, g2, computeClusters(bigger, g2), {});
        const tf = now();
        rows.push({
          size,
          similarity: t2 - t1,
          clusters: t3 - t2,
          layout: t4 - t3,
          full: t4 - t1,
          incremental: tf - ti,
        });
      }
    }
  }
  return rows;
}

/* ---------------------- 4. hydrate-to-interactive ---------------------------- */

interface HydrationResult {
  runs: number[];
  best: number;
}

async function measureHydration(serverUrl: string): Promise<HydrationResult> {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();

  const GENRES = ["action", "drama", "sci-fi", "comedy", "romance"];
  const seed = (n: number) => {
    const items = [];
    for (let i = 0; i < n; i++) {
      items.push({
        localId: `perf:${i}`,
        provider: "manual",
        providerId: String(i),
        mediaType: (["anime", "movie", "series", "game", "book"])[i % 5],
        format: (["series", "film", "series", "game", "book"])[i % 5],
        title: `Perf Title ${i}`,
        genres: [GENRES[i % GENRES.length]],
        tags: [],
        releaseYear: 1970 + (i % 55),
        rating: 3 + (i % 3),
      });
    }
    return items;
  };

  try {
    const runs: number[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      // 1) first load: the app creates its IndexedDB stores during hydration
      await page.goto(serverUrl, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        async () => {
          try {
            const db = await new Promise((resolve, reject) => {
              const req = indexedDB.open("echo-universe");
              req.onsuccess = () => resolve(req.result);
              req.onerror = () => reject(req.error);
            });
            const has = db.objectStoreNames.contains("media") && db.objectStoreNames.contains("entries");
            db.close();
            return has;
          } catch {
            return false;
          }
        },
        undefined,
        { timeout: 30_000, polling: 100 },
      );
      // 2) seed 500 titles directly into the app's own database
      await page.evaluate(async (items) => {
        const db = await new Promise((resolve, reject) => {
          const req = indexedDB.open("echo-universe");
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        const ts = new Date().toISOString();
        await new Promise((resolve, reject) => {
          const t = db.transaction(["media", "entries"], "readwrite");
          for (const item of items) {
            const entryId = `entry_perf_${item.localId.replace(/[^a-z0-9]/gi, "")}`;
            t.objectStore("media").put(item, item.localId);
            t.objectStore("entries").put(
              {
                id: entryId,
                mediaLocalId: item.localId,
                status: "completed",
                rating: item.rating,
                isFavourite: false,
                userTags: [],
                addedAt: ts,
                updatedAt: ts,
                completedAt: ts,
              },
              entryId,
            );
          }
          t.oncomplete = () => resolve();
          t.onerror = () => reject(t.error);
        });
        await new Promise((resolve, reject) => {
          const t = db.transaction(["kv"], "readwrite");
          t.objectStore("kv").put(
            {
              language: "en",
              theme: "dark",
              interests: ["anime", "movie", "series", "game", "book", "manga", "comics"],
              onboarded: true,
              onboardedAt: ts,
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
      }, seed(500));
      // 3) reload and measure hydration: navigation start → the map is
      //    interactive (its stats line renders from the hydrated store)
      await page.goto(serverUrl, { waitUntil: "commit" });
      const t0 = await page.evaluate(() => performance.now());
      await page.waitForFunction(
        // innerText is CSS-transformed (the stats line renders as "500 TITLES")
        () => document.body.innerText.toUpperCase().includes("500 TITLES"),
        undefined,
        { timeout: 30_000, polling: 25 },
      );
      const t1 = await page.evaluate(() => performance.now());
      // subtract the pre-navigation clock reading (performance.now() is
      // relative to the page's own time origin, so t0 ≈ 0 — kept explicit
      // for clarity)
      runs.push(Math.max(0, t1 - t0));
      await context.close();
    }
    return { runs, best: Math.min(...runs) };
  } finally {
    await browser.close();
  }
}

/* --------------------------------- render ------------------------------------ */

function render(buildSecs: number, firstLoadKb: number, engine: EngineBenchRow[], hydration: HydrationResult): string {
  const stamp = new Date().toISOString();
  const L: string[] = [];
  L.push(
    "# ECHO — performance baseline (A1 capture)",
    "",
    `Captured ${stamp} by \`scripts/perf-baseline.ts\` on the Phase 1 branch.`,
    "Budgets are the plan §7.4 values; the numbers below are the measured",
    "baselines each future change is compared against. Machine-class sandbox",
    "hardware — treat absolute values as baselines, ratios as signal.",
    "",
  );

  L.push("### 1. Build time (budget ≤ 180 s in CI)", "");
  L.push("| Build | Measured |");
  L.push("|---|---|");
  L.push(`| \`bun run build\` (this machine) | ${buildSecs.toFixed(1)} s |`, "");

  L.push("### 2. First Load JS for / (budget ≤ 200 KB gzipped)", "");
  L.push("| Route | First Load JS (measured: gzip of every script the served page loads) |");
  L.push("|---|---|");
  L.push(`| \`/\` | ${firstLoadKb.toFixed(1)} KB |`, "");

  L.push("### 3. Engine pipeline (bun, this machine — O(n²) similarity + clustering + layout)", "");
  L.push("| Library size | Similarity graph | Clusters | Layout | Full pipeline | Incremental add (recompute) |");
  L.push("|---|---|---|---|---|---|");
  for (const r of engine) {
    L.push(
      `| ${r.size} titles | ${ms(r.similarity)} | ${ms(r.clusters)} | ${ms(r.layout)} | ${ms(r.full)} | ${ms(r.incremental)} |`,
    );
  }
  L.push("");

  L.push("### 4. Hydrate-to-interactive at 500 seeded titles (Chromium headless)", "");
  L.push("| Metric | Measured | Budget |");
  L.push("|---|---|---|");
  L.push(
    `| Hydrate-to-interactive (500 titles, best of 3) | ${Math.round(hydration.best)} ms | ≤ 1500 ms |`,
    "",
  );
  L.push(
    `(all runs: ${hydration.runs.map((r) => Math.round(r)).join(" ms, ")} ms; headless Chromium against the`,
    "e2e standalone server, machine-class sandbox hardware.)",
    "",
  );

  L.push("### 5. Not yet measured at A1 (recorded honestly)", "");
  L.push(
    "- Map interaction 60 fps at 500 nodes — needs rAF sampling in the map",
    "  flow (scheduled with the A3 Lighthouse CI pass).",
    "- Federated search first paint ≤ 1.5 s — needs the provider-latency",
    "  harness (A3); the e2e flows already pin the functional contract.",
    "",
  );
  return L.join("\n");
}

/* ----------------------------------- run -------------------------------------- */

async function main(): Promise<void> {
  if (!existsSync(".next/standalone/server.js")) {
    console.error("perf-baseline: run `bun run build:standalone` first (or let this script do it).");
  }
  const buildSecs = measureBuild();
  const server = await startStandaloneServer();
  try {
    const firstLoadKb = await measureFirstLoadJs(server.url);
    console.log(`  First Load JS (gzip): ${firstLoadKb.toFixed(1)} KB`);
    const engine = await benchEngine();
    const hydration = await measureHydration(server.url);
    console.log(`  hydration best of 3: ${Math.round(hydration.best)} ms`);
    const doc = render(buildSecs, firstLoadKb, engine, hydration);
    writeFileSync(DOC, doc);
    console.log(`perf-baseline: wrote ${DOC}`);
  } finally {
    await server.close();
  }
}

void main();
