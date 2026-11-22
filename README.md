# ECHO — ذوقك، مرسومًا على خريطة

**Your taste, mapped.**

ECHO تطبيق ويب **محلي بالكامل** (local-first) بيرسم خريطة ذوقك في الأنمي والأفلام والمسلسلات والألعاب والكتب — من غير حسابات، ولا تتبّع، ولا أي تكلفة تشغيل. بيانات الكتالوج حقيقية من ست مصادر عامة مجانية، وكل حاجة بتتخزن في متصفحك.

- بدون حسابات ولا تسجيل دخول
- بدون قاعدة بيانات ولا خادم خاص
- بدون مفاتيح مدفوعة — يعمل كما هو فور النشر
- واجهة ثنائية اللغة (عربي/إنجليزي) بدعم RTL كامل
- PWA يعمل أوفلاين مع مكتبتك

---

A local-first atlas of your taste. Add the anime, movies, series, games and
books you enjoy, and ECHO charts them into one explorable map — islands of
genres, connections between stories, and recommendations that explain
themselves. **Real catalogue data, no accounts, no setup, no paid AI.**

## Deploy to Vercel (free)

The app needs **zero configuration** to deploy:

1. Push this repository to GitHub.
2. On [vercel.com](https://vercel.com) → **Add New… → Project** → import the repo.
3. Vercel auto-detects Next.js (Node 20.9+). Leave every field at its default.
4. *(Optional)* → **Environment Variables** → add `GEMINI_API_KEY` with a
   free key from [Google AI Studio](https://aistudio.google.com/apikey) to
   upgrade the AI features (Ask ECHO, Taste Companion, weekly digest) to
   Gemini — faster and higher quality. They already work keylessly through
   a free community provider; the key is a quality upgrade, not a
   requirement. (Synopsis translation is always keyless.)
5. **Deploy.**

That is the entire process. No database, no paid services, no other keys —
the games source (RAWG) ships with a built-in project key and every other
catalogue source is keyless and public.

> Local preview: `npm install && npm run dev` → http://localhost:3000

## What is implemented

| Area | Status |
| --- | --- |
| First-run onboarding (welcome → interests → seed taste → first map reveal) | ✅ skippable at every non-essential step |
| Interest selection (anime / movies / series / games / books) | ✅ |
| Taste seeding: live catalogue search with ratings + favourites **or** quick preference cards | ✅ real results from AniList · Kitsu · TVMaze · IMDb · RAWG · Open Library |
| Catalogue search & add — **real sources**, every result labelled with its source | ✅ AniList + Kitsu (anime) · TVMaze + IMDb (series) · IMDb + Cinemeta (movies) · RAWG (games, built-in key) · Open Library (books) |
| Offline resilience: labelled sample catalogue fallback when the network is down | ✅ |
| Manual title entry fallback — **auto-linked to the catalogue**: a confident match (same normalized title + compatible year + type) adopts the real record, so even manual entries get a real poster on the map; a manual "Attach real artwork" picker exists in the drawer | ✅ |
| Library: statuses, 1–5 ratings, favourites, notes, user tags, search/sort/filter, bulk status, remove | ✅ |
| **ECHO Map**: canvas renderer with real poster art, rating-sized nodes, status rings, favourite hearts, curved similarity lines, cluster **island hulls** with letterpress labels, survey graticule + compass rose, pan/zoom/pinch, fit-all, collision-aware labels, deterministic layout that survives additions, filters, in-map search, accessible list view, legend | ✅ |
| Edge explanations ("why are these two connected?") with real shared features | ✅ |
| Details drawer: metadata, source attribution + canonical link, status/rating/favourite/note/tags, "why it connects to your taste", similar titles | ✅ |
| Library ↔ sources: per-row source chip + external link, **Sync from sources** refreshes every title's metadata (posters, genres, synopsis) and links manual entries | ✅ |
| Discover: **live candidate pools** (AniList genre queries + Kitsu genre/trending + Cinemeta genre & top-rated catalogues + RAWG genre/tag pools + Open Library subject shelves & weekly trending) → 4 shelves (Made for your taste / Because you liked X / A different direction / Explore this island), familiar↔surprising dial, media-type-balanced shelves, every card explains itself, feedback actions | ✅ |
| Taste DNA: confidence tiers, insight cards with sample counts, feature bars, rating distribution, most-influential titles | ✅ |
| Taste identity card — a shareable card distilled from your taste fingerprint | ✅ |
| Ask ECHO — conversational search across every medium (intent routing → real catalogue results → grounded narration), plus library & AI-knowledge answers | ✅ |
| Taste Companion — AI reading of your taste map, grounded in the real engine snapshot, never invents | ✅ |
| Content safety: maturity ceiling; adult content never fetched or recommended | ✅ |
| Local persistence: IndexedDB (library, ratings, notes, feedback, settings, map layout) | ✅ survives refresh & restart |
| Export / import: versioned JSON, schema-validated (zod), merge or replace | ✅ |
| Sample map mode: clearly-labelled, isolated stores, exit with or without keeping titles | ✅ |
| Bilingual UI: English + Arabic with full RTL, proper Arabic typography | ✅ |
| PWA: manifest, generated icons, service worker (network-first) | ✅ opens offline with your library |
| Privacy: no accounts, no analytics, no trackers; provider calls only when you search | ✅ |

## Design language

ECHO looks like a printed survey map, not a generic dark app: warm paper and
ink with a single vermilion accent (light) / warm charcoal and cream (dark),
atlas tints for islands and statuses, a self-hosted variable font stack
(Space Grotesk + Alexandria), hairline borders, stamp-like source chips, a
faint graticule, curved tapered connection lines, a compass rose and a proper
legend. No glassmorphism, no gradients, no glow, no runtime CDN fetches.

## Real data sources (all attributed)

| Source | Serves | Notes |
| --- | --- | --- |
| [AniList](https://anilist.co/) | Anime | Public GraphQL API; genres, community tags, studios, artwork |
| [Kitsu](https://kitsu.app/) | Anime | Public JSON:API; categories, artwork, trending pools |
| [TVMaze](https://www.tvmaze.com/) | Series | Free public API; genres, ratings, artwork |
| IMDb suggestions + [Cinemeta](https://github.com/Stremio/) | Movies **and series** (+ genre/top-rated pools) | Public endpoints; genres, cast, director, artwork via metahub |
| [RAWG](https://rawg.io/) | Games (+ genre/tag pools) | Free API with a **built-in project key** — games work with zero setup |
| [Open Library](https://openlibrary.org/) | Books (+ subject shelves, weekly trending) | Internet Archive's open catalogue; keyless, CORS-enabled |

Every search result carries a source chip; every title's drawer links back to
its canonical page; Settings → Data sources lists all of them. When you're
offline, search falls back to the labelled sample catalogue. See
`docs/DATA_PROVIDER_COMPLIANCE.md` for the full compliance table.

## Stack

- **Next.js 16 (App Router) + TypeScript** — typed, component-based, PWA.
- **Tailwind CSS 4 + shadcn/ui** — accessible components on the atlas tokens.
- **Zustand** — tiny client state with write-through IndexedDB persistence.
- **Canvas 2D map renderer (custom)** — full control over the cartographic
  aesthetic and mobile performance (poster image cache, no heavy DOM).
- **zod** — strict import validation. **bun test** — domain unit tests.

No database server, no paid AI API, no runtime CDN fetches (fonts ship with
the app). Everything ECHO needs either ships with it or comes from the
attributed public APIs above.

## Architecture

```
src/
  app/                     # Next.js shell (single route), self-hosted fonts, global styles
    api/echo/              # same-origin server routes
      ai/ask|companion|weekly   # AI features (Gemini first, maxDuration 60s)
      translate/           # synopsis translation
  lib/echo/
    types.ts               # normalized domain model
    localdb.ts             # IndexedDB layer (no dependencies)
    store.ts               # zustand store + write-through persistence + sample-map mode
    i18n.tsx               # EN/AR dictionaries, RTL, singular/plural handling
    exportimport.ts        # versioned backup validation (zod) + merge/replace
    poster.ts              # deterministic generated artwork (paper/ink style)
    ids.ts                 # hashing + seeded RNG (determinism)
    data/
      demoCatalogue.ts     # 64-title labelled offline sample catalogue
      vocab.ts             # genre/tag vocabulary (EN/AR) + provider slug mapping
    engine/                # pure, deterministic, unit-tested
      features.ts          # feature extraction + IDF
      similarity.ts        # weighted overlap, missing-field renormalization, reasons
      taste.ts             # taste profile from real signals, confidence tiers
      recommend.ts         # closest / because / adjacent / explore / island shelves
      cluster.ts           # label-propagation islands, named from shared metadata
      layout.ts            # island-surveyor layout
      identityCard.ts      # shareable taste identity card
    ai/                    # AI features (same-origin routes, graceful degradation)
      llm.ts               # provider chain: Gemini (env key) → platform AI → keyless Pollinations
      ask.ts / companion.ts / weekly.ts   # client halves
    providers/             # real catalogue sources + offline fallback
      anilist.ts           # anime (GraphQL search, genre pools)
      tvmaze.ts            # series
      imdb.ts              # movies & series (IMDb suggestions + Cinemeta meta & catalogues)
      kitsu.ts             # anime (JSON:API: search, trending, categories)
      rawg.ts              # games (built-in key: search, details, genre/tag pools)
      openlibrary.ts       # books (keyless: search, works, subject shelves, trending)
      match.ts             # manual-title → catalogue matching
      index.ts             # router: multi-source search, candidate pools, refresh
      demo.ts              # labelled offline fallback
    server/kv.ts           # optional Upstash Redis swap point (env-driven, off by default)
  components/echo/         # app shell, onboarding, map canvas, screens, drawer, dialogs
  components/ui/           # the shadcn/ui subset actually used
docs/
  DATA_PROVIDER_COMPLIANCE.md
scripts/
  test-expanded-providers.ts   # live smoke test: RAWG + Open Library + pools
```

## Engines in one paragraph each

- **Similarity** — weighted components (genres 30%, tags 25%, format 10%,
  creators/studios 10%, era 5%, language/country 5%, cast 5%, user tags 10%).
  Missing fields renormalize instead of counting as mismatches. Genre/tag
  overlap is IDF-weighted so "Drama" cannot connect everything. Every edge
  carries its top-3 shared-feature reasons.
- **Taste profile** — only explicit signals count: ratings (4–5 positive,
  1–2 negative, 3 ≈ neutral), favourites amplify but never override. Insights
  carry sample counts and confidence tiers (<5 rated = early signals).
- **Recommendations** — deterministic scoring against the profile with
  IDF-weighted matches over a **live candidate pool** (AniList + Kitsu genre
  queries, Kitsu trending, Cinemeta genre & top-rated catalogues, RAWG
  genre/tag pools, Open Library subject shelves + weekly trending —
  interleaved so no single source dominates); shelves for closest /
  because-you-liked / adjacent / island neighbours; franchise and first-genre
  diversity caps; rejected titles never return.
- **Layout (island surveyor)** — clusters become landmasses: centroids are
  circle-packed with inter-island gaps, nodes relax inside their island with
  ellipse-aware collision (poster tiles are 2r × 3r), cross-island pairs
  repel harder than same-island pairs, and existing maps keep their shape
  (rigid offsets + capped centroid drift). Islands render as padded convex
  hulls with letterpress labels that dodge nodes and labels.

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
npm run lint       # eslint
npm test           # 22 domain unit tests (requires bun: https://bun.sh)
npm run smoke      # live smoke test: RAWG + Open Library + candidate pools (requires bun)
```

No environment configuration is required: every catalogue source — games
included, via the built-in RAWG key — works out of the box, and the AI
features run on a free keyless community provider (Pollinations) with no
setup at all. To upgrade them to Gemini, copy `.env.example` to `.env.local`
and set `GEMINI_API_KEY` (free key: https://aistudio.google.com/apikey).
If every provider fails, AI features degrade gracefully and the rest of the
app is unaffected.

## Environment variables (all optional)

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Optional quality upgrade for Ask ECHO / Taste Companion / weekly digest: free Google AI Studio key → Gemini runs first in the provider chain (keyless community AI is the zero-config default) |
| `GEMINI_MODEL` | Pin one Gemini model instead of the free chain (gemini-3.8-flash → gemini-3.5-flash-lite) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Growth swap point for shared rate-limit/cache across serverless instances — see `src/lib/echo/server/kv.ts` |

## Tests

22 domain unit tests cover: unrated titles create no positive signal, 5★ > 4★
evidence, low ratings are negative evidence, missing metadata isn't punished,
explanations match actually-shared features, common genres don't
over-connect, filters and rejections are respected, library titles aren't
re-recommended, low samples → low confidence, deterministic ranking, cluster
naming, layout determinism and layout stability on additions (≤ 60px drift).

## Known limitations

- Games run on a shared built-in RAWG key (free tier: ~20k requests/month
  across all users).
- The keyless AI fallback (Pollinations) is a shared free community service:
  slower and rate-limited. Set `GEMINI_API_KEY` for the best experience;
  if every provider fails the AI features degrade gracefully.
- Cinemeta does not provide per-region certifications; movie maturity data is
  coarse (adult content is filtered, everything else shows as unrated).
- Import/export covers library, feedback and non-secret settings; provider
  artwork URLs are excluded by design.
- The map is optimised for personal libraries (up to a few hundred titles).

## Privacy summary

No account. No analytics, ads or trackers. Your library lives in your
browser's IndexedDB. Catalogue queries go to the active public providers
only when you search or open Discover. The AI features call a same-origin
route that receives only an anonymous statistical digest of your library —
never your notes, tags or personal data. Export gives you every byte ECHO
stores.
