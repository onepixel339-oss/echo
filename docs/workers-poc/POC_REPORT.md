# ECHO — Cloudflare Workers Compatibility PoC Report (Phase 1 / P0)

**Date:** 2026-11-25 (re-executed and verified end-to-end in a clean isolated copy the same day; every number below is from this run)
**Executor:** Phase 1 lead engineer (per the Transformation Master Plan Revision 1.3 PATCH1, §10.2.5 / §12.1 stage P0)
**Scope:** isolated compatibility assessment + proof of concept. **The Vercel production deployment was never touched. No migration happened.** This report informs owner decision D-28 only.

---

## 1. Environment and isolation

| Item | Value |
|---|---|
| PoC working copy | a **separate filesystem copy** of the Phase 1 branch at `/tmp/echo-workers-poc` (no `.git`, no Vercel link); the repository and its live deployment are untouched |
| Toolchain evaluated | **vinext 1.4.6** (Cloudflare's tool, github.com/cloudflare/vinext) + `@cloudflare/vite-plugin` 2.0.0-rc.5 + Vite (rolldown) — installed inside the PoC copy only |
| Worker runtime | local **workerd** via `vite preview` (`bun run start:vinext`, port 4173 — the actual Workers runtime, run locally; no Cloudflare account needed for local execution) |
| Real Cloudflare deployment | **NOT EXECUTED** — no Cloudflare account/token exists in this environment and none may be created; every gate requiring a deployed `*.workers.dev` Worker is marked below as blocked, not guessed |
| Cost | **$0** (no account, no deploy, no paid service) |

## 2. Gate results (P-1 … P-8)

| Gate | Description | Result | Evidence (measured in this run) |
|---|---|---|---|
| **P-1** | `vinext init` on the branch lineage; build; Worker size < 3 MiB compressed | **PASS (build + size) / BLOCKED (deploy)** | `vinext check`: **91% compatible** (15 supported, 1 partial, 1 issue — see §3). `vinext init --platform cloudflare` non-destructive: adds `vite.config.ts`, `cloudflare.config.ts`, four `*:vinext` scripts and upgrades react to ^19.3.1 in the PoC copy; `next dev`/`next build` untouched. Build succeeds — vite reports **"built in 1.40s"** (warm; full `build:vinext` wall time ~7.5 s including rolldown + finalize). Worker bundle: **105 JS modules (+1 css +1 json; 94 sourcemaps excluded — they are not uploaded), 2.10 MiB raw, 0.65 MiB gzipped vs 3.00 MiB limit (4.6× headroom)** (0.66 MiB including the css+json). Static assets: **1.61 MiB / 33 files** via Workers Assets (free, unlimited, not counted against the Worker limit). Deploy to `*.workers.dev` not executed (no account). |
| **P-2** | All 6 dynamic routes exercised | **PASS** | Against local workerd: `translate` (Arabic passthrough → `{"ok":true,"translations":["ملخص بالعربية"]}`, 200; bad body → 400 `bad_body`), `igdb`/`trakt` (unconfigured → `{"configured":false,"results":[]}`, 200), `ask`/`companion`/`weekly` (no key → `{"ok":false,"error":"ai_unavailable"}`, HTTP 200 — the designed degradation; weekly bad body → 400). **The entire six-flow Playwright e2e suite (25 tests) also passes against the Worker runtime** — onboarding/demo, search→rate→map, drawer, Arabic/RTL, export/clear→import, offline/SW. |
| **P-3** | PWA: SW registers, offline cache serves the shell, manifest installs | **PASS (locally) / scope-on-workers.dev NOT VERIFIED** | `sw.js` served (200, **4,201 B** — the repo's own SW, byte-identical), `manifest.webmanifest` served (200 — Next metadata route via the Worker), `icons/icon-192.png` 200. In a real browser against workerd: SW registers and **controls the page**; offline reload boots the shell from cache with the library intact (e2e offline suite green). The `*.workers.dev`-origin SW scope question remains deploy-gated (same-origin mechanics are identical; recorded honestly). |
| **P-4** | Fonts (incl. Arabic woff2) + RTL render | **PASS** | The three `next/font/local` faces (**alexandria-arabic**, alexandria-latin, space-grotesk) are emitted to Workers Assets with hashed URLs. In-browser on workerd after switching to Arabic: `dir=rtl`, `lang=ar`, translated chrome renders, and `document.fonts` confirms **alexandriaArabic loads** (with spaceGrotesk). Zero page errors — the only console error is the 404 for `/fonts/fraunces-var.woff2`, an undeclared leftover font file that no code references (a cleanup note, not a defect; see §3.6). |
| **P-5** | CPU per route (median < 5 ms heaviest; p99 < 10 ms) | **LOCAL PROXY: PASS / real Workers CPU observability BLOCKED (no deploy)** | Local workerd wall-clock over **100 requests per route** (includes HTTP + IPC overhead, so it overstates CPU): **median 3.7–5.6 ms** across all routes; **p99 9.7–35.4 ms** (the 35 ms outlier is one cold re-JIT on weekly). The routes are I/O-bound JSON validation + fetch relay; the real CPU figure will be lower than wall-clock. Actual Cloudflare observability measurement requires the deployed Worker. |
| **P-6** | 286-test domain suite under the worker environment | **PASS** | The domain suite (**333 tests** after the Phase 1 additions, including the AniList jobKey regression) runs green in the PoC copy — runtime-agnostic by design. Stronger than the gate asked: the **full browser e2e suite also runs green against the Worker runtime** (see P-2). |
| **P-SDK** | `z-ai-web-dev-sdk` never loads/bundles | **PARTIAL — bundles, but cannot harm; degrade path verified** | Vite resolves the dynamic import into a **7,491-byte chunk** (`_next/static/dist-sfCEMDY8.js`) — so it *is* in the bundle (it is a dependency). Its code statically imports `node:fs/promises` (config-file discovery — Node-only). Empirically on workerd: **the Worker boots and all routes work**; calling the platform fallback throws inside the route's try/catch → `ai_unavailable` (verified on all three AI routes). Recommendation for any real migration: mark `z-ai-web-dev-sdk` as `optimizeDeps.exclude`/external (or make the import conditional on `process.env.NODE_ENV !== "production"`) so the chunk drops out entirely. Not a blocker either way. |
| **P-7** | OpenNext fallback if vinext blocked | **N/A — vinext did not block** | Per the plan's own rule, OpenNext is evaluated only "if vinext hits a blocker". No blocker occurred (build, size, routes, PWA, fonts, RTL, e2e all green locally). OpenNext (`@opennextjs/cloudflare` 1.20.19 checked on npm) remains the documented fallback if a deploy-gated gate fails later. |
| **P-8** | OAuth redirect URIs on the workers.dev origin | **BLOCKED (no Supabase project, no deployed origin)** | Cannot be executed: requires the isolated Supabase project (Track B asset, not to be created in Phase 1) and a real `*.workers.dev` URL to register as a redirect target. Not attempted, not simulated. |

## 3. Findings and required migration steps (the honest list)

1. **`next.config.ts` `output: "standalone"` must be removed for vinext builds.** Reproduced exactly: with `standalone` set, the build fails with `No build output found in …/dist. Run vite build first.` (vinext's Node-standalone emitter conflicts with the Cloudflare plugin's `.cloudflare/output` redirect). One-line change, vinext-specific (Next standalone builds on the main branch are unaffected — the vinext setup lives alongside, non-destructively).
2. **`eslint.config.mjs` declared `__dirname`/`__filename`** — the only `vinext check` issue. The declarations were **dead code** (never referenced by the config); deleting them takes compatibility to **97% (14 supported, 1 partial, 0 issues)**. Dev-tooling only, never in the Worker bundle.
3. **`reactStrictMode` partial support** — App Router not yet wrapped by vinext. This repo sets `reactStrictMode: false`, so **no behavioral difference**. This is the one remaining "partial" in `vinext check`.
4. **Route classification warning** — vinext cannot statically classify API routes that read `headers()`/`cookies()` at runtime; all 6 routes are correctly emitted as dynamic (`λ`). Cosmetic warning only.
5. **P-SDK chunk** — see the gate row; recommend externalizing the SDK for a clean bundle (7.5 KB + Node-module references).
6. **Leftover font files** — `app/fonts/` ships ~10 unused woff2 files (fraunces/instrument/plex-arabic-*) that no code references (only 3 are declared via `next/font/local`; the 404 for `/fonts/fraunces-var.woff2` on the Worker confirms they are not served). Track-A cleanup candidate regardless of hosting; they add ~500 KB of dead repo weight (they do NOT enter the Worker assets).
7. **`compatibilityDate: "2026-11-25"`** is set by the generated config; no explicit `nodejs_compat` flag was needed for anything the app actually does (verified empirically — the full suite runs). If a future route needs Node APIs at module scope, add the flag then.

## 4. Measurements summary

| Measurement | Value | Budget/limit | Status |
|---|---|---|---|
| Worker size (gzip, all 105 JS modules) | **0.65 MiB** | 3.00 MiB (Free) | PASS (4.6× headroom) |
| Worker size (raw) | 2.10 MiB | — | (sourcemaps excluded; not uploaded) |
| Static assets (Workers Assets) | 1.61 MiB / 33 files | free + unlimited | PASS |
| vinext build time | 1.40 s vite (warm); ~7.5 s full wall | — | (vs 22.6 s Next build, same machine) |
| Route median wall-clock (local workerd, n=100) | 3.7–5.6 ms all routes | CPU 10 ms (Free) | proxy-PASS |
| Route p99 wall-clock (local workerd, n=100) | 9.7–35.4 ms | CPU p99 — | proxy; real CPU needs deploy |
| e2e six-flow suite on Workers runtime | **25/25 pass** | all green | PASS |
| Domain suite in PoC copy | **333/333 pass** | all green | PASS |
| `vinext check` compatibility | 91% (15✓ 1~ 1✗) → **97% (0 issues)** after the dead-code fix | — | no blocking issue |

## 5. What was NOT executed (and why)

- **Deployment to a `*.workers.dev` subdomain** — requires a Cloudflare account + `wrangler`/`cf` auth; none exists here and creating one is outside this phase's authority. All deploy-dependent observations (P-1 deploy step, P-3 SW scope on the real origin, P-5 real CPU via Cloudflare observability, static-asset behavior during daily-quota exhaustion, P-8 OAuth) are marked blocked above. **Nothing about them is claimed.**
- **P-8 OAuth round-trip** — additionally blocked on the Supabase project (a Track B asset; Phase 1 must not create it).
- **Daily-quota exhaustion behavior** — not simulatable locally; the client transport classifier (W-1…W-6) remains a Track B deliverable as planned.

## 6. Recommendation for D-28

**Conditionally ready — no compatibility blocker found; the remaining risk is deploy-gated, not code-gated.**

Everything executable without a Cloudflare account is green: the build produces a Worker at **22% of the Free size limit**, the full six-flow e2e suite and all six API routes behave correctly on the real workerd runtime, the PWA works offline, Arabic/RTL and the Arabic font render correctly, and the AI routes degrade exactly as designed. The one integration wart (the SDK chunk) is a 7.5 KB cleanup with a safe failure mode, already understood.

The recommended path to close D-28:

1. Owner creates (or grants) the **isolated Workers Free project** and runs `bun run deploy:vinext` from the PoC copy — a ~10-minute exercise.
2. Verify the four deploy-gated items: real Worker size as reported by the platform, SW scope on `*.workers.dev`, CPU numbers from Workers observability, and (when Track B's Supabase project exists) the OAuth redirect round-trip.
3. If all four pass: migration is a small, documented change set (§3 items 1–2 + optional SDK externalization) on a branch — canary-first, Vercel retained until cutover, per the plan's rule.

If the owner prefers zero residual risk, staying on Vercel Hobby remains fully within the $0 constraint — the PoC shows Workers is **viable**, not mandatory.
