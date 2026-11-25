# Changelog

All notable changes to ECHO are documented here. The version scheme is
semantic: MAJOR for breaking user-data or product-contract changes, MINOR for
feature/stabilization releases, PATCH for fixes. User-data compatibility
(export bundles v1–v3, IndexedDB migrations) is never broken by a release.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1/).

## [1.1.0] — 2026-11-25 — "Phase 1: stabilize, test, prove"

Track A stage A0 (truth & configuration) + A1 (test spine) + the isolated
Cloudflare Workers proof of concept (P0), per the ECHO Transformation Master
Plan Revision 1.3 PATCH1. No product behavior was rewritten; every change is
targeted, with regression tests.

### Fixed

- **RAWG provenance stamping (audit G4).** RAWG records now carry the uniform
  v2 catalog fields (`workId`, `externalIds.rawg`, field-level `provenance`,
  `providerRef`) like every other adapter — previously they were missing,
  degrading dedupe/auto-linking to weaker title/year evidence. Regression
  tests: search, `getTitle` and the Discover pools all assert the stamps.
- **NF-1 export round-trip field loss.** The import schema silently dropped
  the `madb`, `trakt`, `igdb`, `inventaire` and `bnf` external-id namespaces
  (zod default key-stripping) and the v3 settings `contentVisibility` and
  `providerToggles`. All are now part of the validated schema; the export
  actually ships the two settings fields; and **replace-mode imports restore
  the backed-up settings** (merge mode still never touches settings, per its
  contract). Backwards compatible: v1/v2/v3 bundles without the new fields
  import unchanged. Round-trip regression tests pin every namespace.
- **Documentation truth (A0).** DEPLOY-AR.md claimed the AI features fall
  back to "free Pollinations" without a Gemini key — false. The code's
  platform-SDK fallback only has credentials inside its originating sandbox;
  everywhere else the features return their designed `ai_unavailable` state.
  Fixed in DEPLOY-AR.md, README.md and `.env.example`; the corrected AI
  posture (D-24: off by default; D-29: BYO-key disclosure draft) is
  documented in `docs/AI_POSTURE.md`. A stale provider-chain comment in
  `app/api/echo/ai/ask/route.ts` (claimed platform-first; the code is
  Gemini-first) was corrected.

### Changed

- **Provider registry: `cloudSyncPolicy` field added** (Revision 1.3 §7.3.1).
  Four-level per-provider cloud-sync posture: `full` (wikidata, trakt, bnf,
  echo-demo), `reference` (rawg, igdb, openlib, tvmaze, imdb, cinemeta, madb,
  inventaire), `none` (**anilist** — local-only until written terms
  clarification, per Revision 1.3; kitsu — hard-disabled). `pointer` is
  reserved for no provider (the documented post-clarification candidate).
  Declarative until Track B exists (no `supabase/` directory today); the
  registry is the single source of truth the future sync classifier reads.
  AniList's local functionality is unchanged.
- **RAWG commercial-use flag updated** from `unverified` to `permitted`
  (free under 100K monthly active users with attribution — verified
  2026-11-25, rawg.io/apidocs), with the verification date recorded in the
  registry.
- **Version references unified** at 1.1.0 (package.json, Settings about line)
  with this changelog as the ledger; `scripts/version-check.ts` enforces
  agreement in CI.

### Added

- **CI pipeline** (`.github/workflows/ci.yml`): lint, `tsc --noEmit`,
  domain tests, production build, secret scanning and the version check —
  every gate that exists locally now runs on every push/PR.
- **Test spine (A1):** Playwright end-to-end coverage of the six core flows
  with mocked providers (onboarding→sample map→exit demo; federated
  search→rate→map updates; details drawer; language→AR/RTL; export→clear→
  import round-trip; offline library + local search); API-route tests
  (rate limits, validation, graceful AI-unavailable, provider proxies);
  EN↔AR i18n parity gate; service-worker offline behaviour tests; and
  performance baselines (`scripts/perf-baseline.ts`).
- **Cost-table generator (T-6.1):** `scripts/cost-table.ts` renders the
  four-tier cost model (T1/T2 zero-cost, T3 future commercial, T4 upgrade
  triggers) from the plan's verified numbers — the doc table and the script
  can no longer drift apart silently.
- **AniList clarification letter (L-3)** prepared at
  `docs/letters/ANILIST_CLARIFICATION_LETTER.md` (four questions, EN) —
  **prepared, NOT sent**; sending requires explicit owner approval.
- **Cloudflare Workers PoC report** (`docs/workers-poc/POC_REPORT.md`):
  the isolated compatibility assessment (P-1…P-8) with measurements and the
  migration recommendation for decision D-28.

### Verified

- `gemini-3.5-flash-lite` deprecation check (2026-11-25, official
  deprecations page): **not deprecated**, no shutdown date announced; the
  app's model chain (`gemini-3.8-flash` → `gemini-3.5-flash-lite`) is
  current. Recorded in `docs/AI_POSTURE.md`.

## [1.0.0] — 2026-11-23 — "MVP"

The audited initial release: local-first taste atlas across seven media
types, deterministic taste engine, license-gated federated provider registry
(14 entries), bilingual EN/AR with full RTL, PWA with offline shell,
IndexedDB persistence with migrations, versioned export/import (v1–v3),
sample-map demo mode. Known gaps at release (documented in the system audit
and addressed in 1.1.0): RAWG provenance stamping missing, NF-1 export
round-trip loss, AI features unavailable without a key, UI/routes/SW/i18n
untested.
