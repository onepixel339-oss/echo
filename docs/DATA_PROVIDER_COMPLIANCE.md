# ECHO — Data Provider Compliance

Decision gate per spec §9.3. **No provider is enabled in a public release
without a row here, a reviewer and a date.**

| Provider | Status | Decision |
| --- | --- | --- |
| AniList (graphql.anilist.co) | **Active** — anime **and manga** search, metadata, artwork, genre pools, popularity/score rankings for Discover | **Approved** for ECHO — free public GraphQL API, no key, no scraping; per-title attribution + canonical link on every result |
| Kitsu (kitsu.io JSON:API) | **Active** — anime **and manga** search, trending, category pools, artwork | **Approved** for ECHO — free public JSON:API, no key; per-title attribution + canonical link on every result |
| TVMaze (api.tvmaze.com) | **Active** — series search, metadata, artwork | **Approved** for ECHO — free public API, no key; attribution requested and provided (details drawer + Settings → Data sources) |
| IMDb suggestion endpoint + Cinemeta (v3-cinemeta.strem.io) | **Active** — movie **and series** search, metadata, artwork, genre + top-rated catalogues, deep top lists (era filtering) | **Approved** for ECHO — public endpoints, no key; attributed as "Data from IMDb via Cinemeta" |
| RAWG (api.rawg.io) | **Active** — games search, metadata, artwork, genre/tag pools | **Approved** for ECHO — free API; a project key is built in so games are live out of the box, and users may add their own key in Settings for a private quota; per-title attribution + canonical link |
| Open Library (openlibrary.org) | **Active** — books **and comics** search, works metadata, covers, subject shelves, graphic-novel canon & era windows, weekly trending | **Approved** for ECHO — free public API from the Internet Archive, no key, CORS-enabled; per-title attribution + canonical link on every result |
| ECHO sample catalogue (local, offline) | Active as **offline fallback only** | **Approved** — original compilation, clearly labelled "Sample" whenever used |
| TMDB | **Removed** | Superseded by the keyless stack above; the key gate and commercial-use caveats no longer apply |

---

## AniList (anime)

- **Terms**: AniList's public API is free for non-commercial use with
  attribution (https://anilist.gitbook.io/anilist-apiv2-docs/). No key
  required; rate limits are generous for a personal-library use case.
- **What ECHO fetches**: search results (title, genres, community tags with
  rank ≥ 75, main studios, episode count, synopsis, cover art), and
  genre-filtered popular pools for Discover.
- **Attribution**: every AniList-sourced title links to its anilist.co page;
  Settings → Data sources credits the provider; no artwork is re-hosted
  (hot-linked from AniList's CDN, cached by the browser only).
- **Adult content**: `isAdult` results are filtered at the query level; the
  maturity ceiling setting additionally gates what is shown.

## TVMaze (series)

- **Terms**: TVMaze's API is free, no key, with a request to link back when
  used publicly (https://www.tvmaze.com/api). ECHO links every TVMaze result
  to its tvmaze.com page and credits the source in Settings.
- **What ECHO fetches**: search results (title, genres, rating, runtime,
  premiere year, synopsis, poster), refreshed metadata by stored id.

## Kitsu (anime)

- **Terms**: Kitsu's JSON:API (kitsu.io, kitsu.app) is free and public, no
  key. Kitsu is a community-driven anime/manga database; ECHO links every
  Kitsu result to its kitsu.app page and credits the source in Settings.
- **What ECHO fetches**: search results (titles, categories mapped onto the
  ECHO genre/tag vocabulary, synopsis, episode count, age rating, poster
  art), the trending list, and category-filtered popular pools for Discover.
- **Adult content**: `nsfw` items and `R18` age ratings are filtered unless
  the user explicitly enables mature content.
- **Cross-source note**: AniList and Kitsu both serve anime; search results
  are interleaved and near-duplicates (same normalized title + year) are
  dropped so the user picks from distinct records.

## IMDb suggestions + Cinemeta (movies & series)

- **Search**: IMDb's public suggestion endpoint
  (`v2.sg.media-imdb.com/suggestion/…`) — the same endpoint imdb.com's search
  box uses. No key. Used to resolve titles to IMDb ids; movie and
  TV-series results are separated (`qid: movie` vs `tvSeries`/`tvMiniSeries`).
- **Details**: Cinemeta (`v3-cinemeta.strem.io`), the open metadata service
  used by Stremio, keyed by IMDb id — genres, cast, director, synopsis,
  runtime, rating, poster art (served from metahub.space).
- **Attribution**: "Data from IMDb via Cinemeta" on every item; canonical
  link to the title's imdb.com page; Settings → Data sources entry.
- **Catalogues**: Cinemeta genre catalogues and the all-time top-rated
  catalogues power the movie/series candidate pools for Discover.
  Unreleased/far-future titles are filtered out.
- **Back-compatibility**: movie records keep the legacy `imdb:` localId
  prefix; series records use `imdb-series:`. Stored ids from earlier
  versions keep resolving.

## RAWG (games)

- **Terms**: RAWG's API (api.rawg.io) is free with an API key
  (https://rawg.io/apidocs); the free tier covers 20,000 requests/month per
  key.
- **Key handling**: a project key is built into the app, so the games
  catalogue is live for every user on first launch — no setup step. A user
  can optionally add their own free key in Settings → Data sources (stored
  only in their browser's IndexedDB, validated live before saving, passed to
  the same-origin `/api/echo/ai/ask` route for server-side Ask searches) to
  get a private quota. A deployment can swap the built-in key by setting
  `NEXT_PUBLIC_RAWG_API_KEY`. Keys are never logged or sent anywhere else.
- **What ECHO fetches**: search results (title, release year, genres, parent
  platforms, background art), detail records (synopsis, developers, ESRB
  rating, average playtime), and most-added genre/tag pools for Discover.
- **Attribution**: "Data from RAWG" on every item; canonical link to the
  game's rawg.io page; Settings → Data sources entry.

## Open Library (books)

- **Terms**: Open Library (openlibrary.org) is the Internet Archive's open
  catalogue — free, keyless, CORS-enabled (https://openlibrary.org/developers/api).
- **What ECHO fetches**: work-level search results (title, authors, first
  publish year, subjects, cover ids), work details (description, authors),
  subject shelves (most-read books per subject) and the weekly trending list
  for Discover.
- **Subject hygiene**: MARC cataloguing noise ("Accessible book", "Protected
  DAISY", award lists, nationality-prefixed categories, comma-joined strings)
  is filtered; the remaining subjects are mapped onto the ECHO genre
  vocabulary so books cluster with films/series/anime by shared genre.
- **Attribution**: "Data from Open Library" on every item; canonical link to
  the work's openlibrary.org page; Settings → Data sources entry. Cover art
  is hot-linked from covers.openlibrary.org (no re-hosting).

## ECHO sample catalogue (built-in offline fallback)

- **Terms**: none — original compilation made for ECHO. Titles, years, genres
  and other factual metadata reflect widely-known public information about the
  works; synopses are original one-liners; content ratings are approximate and
  labelled as such.
- **Role**: when the network is unavailable, search falls back to this
  catalogue and every result is tagged "Sample". It is never presented as
  live data.
- **Artwork**: no copyrighted posters are bundled; placeholder art is
  generated deterministically on-device.

## Privacy summary

All provider calls happen client-side, only when the user searches or opens
Discover. Library contents, ratings and notes never leave the device.
