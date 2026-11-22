/**
 * ECHO — AniList adapter (anime + manga).
 *
 * Real source: AniList's public GraphQL API (graphql.anilist.co).
 * No key required. Rich data: genres, community tags (great similarity
 * features), studios, scores, cover art.
 * Attribution: "Data from AniList" with a link to the title's AniList page.
 */

import type { MediaFormat, MediaItem, MediaType } from "../types";
import {
  ProviderError,
  fetchJson,
  normalizeGenre,
  slugifyText,
  type CatalogueProvider,
  type ProviderSearchResult,
  type SearchFilters,
} from "./types";
import { cached, TTLCache } from "./cache";

const API = "https://graphql.anilist.co";

type AniListKind = "ANIME" | "MANGA";

interface AniListMedia {
  id: number;
  title: { romaji?: string; english?: string; native?: string };
  genres?: string[];
  tags?: { name: string; rank: number; isGeneralSpoiler?: boolean }[];
  isAdult?: boolean;
  averageScore?: number;
  popularity?: number;
  episodes?: number;
  chapters?: number;
  volumes?: number;
  format?: string;
  startDate?: { year?: number };
  coverImage?: { large?: string; extraLarge?: string };
  siteUrl?: string;
  studios?: { nodes?: { name: string }[] };
  description?: string | null;
  countryOfOrigin?: string;
}

interface GqlPage {
  data?: { Page?: { media: AniListMedia[] } };
  errors?: { message: string }[];
}

async function anilistQuery(query: string, variables: Record<string, unknown>): Promise<AniListMedia[]> {
  let res: Response;
  try {
    res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new ProviderError("network");
  }
  if (res.status === 429) throw new ProviderError("rate_limited");
  if (res.status >= 500) throw new ProviderError("unavailable");
  let body: GqlPage;
  try {
    body = (await res.json()) as GqlPage;
  } catch {
    throw new ProviderError("invalid_response");
  }
  if (body.errors?.length) throw new ProviderError("invalid_response");
  return body.data?.Page?.media ?? [];
}

function stripMarkdown(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\n+/g, " ")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function toMediaItem(m: AniListMedia, kind: AniListKind): MediaItem {
  const isManga = kind === "MANGA";
  const title = m.title.english || m.title.romaji || m.title.native || "Untitled";
  const isFilm = m.format === "MOVIE";
  const tags = (m.tags ?? [])
    .filter((t) => t.rank >= 75 && !t.isGeneralSpoiler)
    .slice(0, 8)
    .map((t) => slugifyText(t.name))
    .filter(Boolean);
  return {
    localId: isManga ? `anilist-m:${m.id}` : `anilist:${m.id}`,
    provider: isManga ? "anilist-m" : "anilist",
    providerId: String(m.id),
    canonicalUrl: m.siteUrl,
    mediaType: (isManga ? "manga" : "anime") as MediaType,
    format: (isManga ? "book" : isFilm ? "film" : "series") as MediaFormat,
    title,
    originalTitle: m.title.romaji !== title ? m.title.romaji : m.title.native,
    synopsis: m.description ? stripMarkdown(m.description).slice(0, 1200) : undefined,
    releaseYear: m.startDate?.year,
    genres: (m.genres ?? []).map(normalizeGenre),
    tags,
    studios: m.studios?.nodes?.map((s) => s.name).slice(0, 3),
    episodeCount: isManga || isFilm ? undefined : m.episodes,
    publicScore: m.averageScore ? m.averageScore / 10 : undefined, // AniList is 0–100
    contentRating: m.isAdult ? "18+" : undefined,
    posterUrl: m.coverImage?.extraLarge ?? m.coverImage?.large,
    countries: m.countryOfOrigin ? [m.countryOfOrigin] : undefined,
    sourceAttribution: "Data from AniList",
    metadataFetchedAt: new Date().toISOString(),
  };
}

const MEDIA_FIELDS = `
  id
  title { romaji english native }
  genres
  tags { name rank isGeneralSpoiler }
  isAdult
  averageScore
  popularity
  episodes
  chapters
  volumes
  format
  startDate { year }
  coverImage { large extraLarge }
  siteUrl
  studios(isMain: true) { nodes { name } }
  description(asHtml: false)
  countryOfOrigin
`;

export class AniListProvider implements CatalogueProvider {
  id = "anilist";
  label = "AniList";

  capabilities = {
    anime: true,
    manga: true,
    movies: false,
    series: false,
    games: false,
    books: false,
    comics: false,
    contentRatings: true,
    relatedTitles: false,
  };

  isConfigured(): boolean {
    return true;
  }

  async search(query: string, filters?: SearchFilters): Promise<ProviderSearchResult[]> {
    return this.searchKind("ANIME", query, filters);
  }

  /** Manga search (AniList MANGA type, same rich fields). */
  async searchManga(query: string, filters?: SearchFilters): Promise<ProviderSearchResult[]> {
    return this.searchKind("MANGA", query, filters);
  }

  private async searchKind(
    kind: AniListKind,
    query: string,
    filters?: SearchFilters,
  ): Promise<ProviderSearchResult[]> {
    const media = await anilistQuery(
      `query ($s: String, $n: Int, $t: MediaType) {
        Page(perPage: $n) {
          media(search: $s, type: $t, sort: SEARCH_MATCH, isAdult: false) { ${MEDIA_FIELDS} }
        }
      }`,
      { s: query, n: Math.min(20, (filters?.limit ?? 8) * 2), t: kind },
    );
    return media
      .filter((m) => !m.isAdult)
      .slice(0, filters?.limit ?? 8)
      .map((item) => ({ item: toMediaItem(item, kind), sourceLabel: "AniList" }));
  }

  /** Trending/popular anime — used to build a real candidate pool for Discover.
   *  Cached 30 min: identical for every user with the same genres. */
  private genreCache = new TTLCache<MediaItem[]>(30 * 60_000);

  async byGenres(genres: string[], limit = 24, includeMature = false): Promise<MediaItem[]> {
    const display = genres.slice(0, 3);
    return cached(this.genreCache, `anime|${display.join(",")}|${limit}|${includeMature}`, async () => {
      const media = await anilistQuery(
        `query ($g: [String], $n: Int, $adult: Boolean) {
          Page(perPage: $n) {
            media(genre_in: $g, type: ANIME, sort: POPULARITY_DESC, isAdult: $adult) { ${MEDIA_FIELDS} }
          }
        }`,
        { g: display, n: limit, adult: includeMature ? undefined : false },
      );
      return media.filter((m) => includeMature || !m.isAdult).map((m) => toMediaItem(m, "ANIME"));
    });
  }

  /** Popular manga in the given genres — the manga Discover pool. */
  private mangaGenreCache = new TTLCache<MediaItem[]>(30 * 60_000);

  async mangaByGenres(genres: string[], limit = 24, includeMature = false): Promise<MediaItem[]> {
    const display = genres.slice(0, 3);
    return cached(this.mangaGenreCache, `manga|${display.join(",")}|${limit}|${includeMature}`, async () => {
      const media = await anilistQuery(
        `query ($g: [String], $n: Int, $adult: Boolean) {
          Page(perPage: $n) {
            media(genre_in: $g, type: MANGA, sort: POPULARITY_DESC, isAdult: $adult) { ${MEDIA_FIELDS} }
          }
        }`,
        { g: display, n: limit, adult: includeMature ? undefined : false },
      );
      return media.filter((m) => includeMature || !m.isAdult).map((m) => toMediaItem(m, "MANGA"));
    });
  }

  async getTitle(providerId: string): Promise<MediaItem | null> {
    const media = await anilistQuery(
      `query ($id: Int) {
        Page(perPage: 1) { media(id: $id, type: ANIME) { ${MEDIA_FIELDS} } }
      }`,
      { id: Number(providerId) },
    );
    return media[0] ? toMediaItem(media[0], "ANIME") : null;
  }

  /** Fetch a manga record by its AniList id. */
  async getTitleManga(providerId: string): Promise<MediaItem | null> {
    const media = await anilistQuery(
      `query ($id: Int) {
        Page(perPage: 1) { media(id: $id, type: MANGA) { ${MEDIA_FIELDS} } }
      }`,
      { id: Number(providerId) },
    );
    return media[0] ? toMediaItem(media[0], "MANGA") : null;
  }

  /** Anime airing RIGHT NOW (status RELEASING, trending first) — the live
   *  "currently airing" shelf. Cached 30 min: identical for every user. */
  private airingCache = new TTLCache<MediaItem[]>(30 * 60_000);

  async airingNow(limit = 20, includeMature = false): Promise<MediaItem[]> {
    return cached(this.airingCache, `airing|${limit}|${includeMature}`, async () => {
      const media = await anilistQuery(
        `query ($n: Int, $adult: Boolean) {
          Page(perPage: $n) {
            media(status: RELEASING, type: ANIME, sort: TRENDING_DESC, isAdult: $adult) {
              ${MEDIA_FIELDS}
              nextAiringEpisode { episode airingAt }
            }
          }
        }`,
        { n: limit, adult: includeMature ? undefined : false },
      );
      return media.filter((m) => includeMature || !m.isAdult).map((m) => toMediaItem(m, "ANIME"));
    });
  }

  // ---- curated Discover pools (real popularity / score / era queries) ----

  /** All-time most popular anime (community member counts, not recency). */
  private animeTopCache = new TTLCache<MediaItem[]>(60 * 60_000);

  async animeTop(limit = 20, includeMature = false): Promise<MediaItem[]> {
    return cached(this.animeTopCache, `top|${limit}|${includeMature}`, async () => {
      const media = await anilistQuery(
        `query ($n: Int, $adult: Boolean) {
          Page(perPage: $n) {
            media(type: ANIME, sort: POPULARITY_DESC, isAdult: $adult) { ${MEDIA_FIELDS} }
          }
        }`,
        { n: limit, adult: includeMature ? undefined : false },
      );
      return media.filter((m) => includeMature || !m.isAdult).map((m) => toMediaItem(m, "ANIME"));
    });
  }

  /** Iconic classic anime — most popular works that started before `beforeYear`. */
  private animeClassicsCache = new TTLCache<MediaItem[]>(60 * 60_000);

  async animeClassics(beforeYear = 1995, limit = 20, includeMature = false): Promise<MediaItem[]> {
    return cached(this.animeClassicsCache, `classics|${beforeYear}|${limit}|${includeMature}`, async () => {
      const media = await anilistQuery(
        `query ($n: Int, $adult: Boolean, $before: FuzzyDateInt) {
          Page(perPage: $n) {
            media(type: ANIME, sort: POPULARITY_DESC, startDate_lesser: $before, isAdult: $adult) { ${MEDIA_FIELDS} }
          }
        }`,
        { n: limit, before: beforeYear * 10000, adult: includeMature ? undefined : false },
      );
      return media.filter((m) => includeMature || !m.isAdult).map((m) => toMediaItem(m, "ANIME"));
    });
  }

  /** Critically acclaimed anime — highest community scores. */
  private animeAcclaimedCache = new TTLCache<MediaItem[]>(60 * 60_000);

  async animeAcclaimed(limit = 20, includeMature = false): Promise<MediaItem[]> {
    return cached(this.animeAcclaimedCache, `acclaimed|${limit}|${includeMature}`, async () => {
      const media = await anilistQuery(
        `query ($n: Int, $adult: Boolean) {
          Page(perPage: $n) {
            media(type: ANIME, sort: SCORE_DESC, averageScore_greater: 80, isAdult: $adult) { ${MEDIA_FIELDS} }
          }
        }`,
        { n: limit, adult: includeMature ? undefined : false },
      );
      return media.filter((m) => includeMature || !m.isAdult).map((m) => toMediaItem(m, "ANIME"));
    });
  }

  /** Sequel/part volume markers — gems should be entry points, not part 5s. */
  private static numberedSequel(title: string): boolean {
    return /\b(part|vol(ume)?|season|chapter|episode)\s*\d+\b|\b\d+\s*\bpart\b|[:#]\s*\d+\b/i.test(title);
  }

  /** Hidden-gem anime — loved by critics/community, far less mainstream. */
  private animeGemsCache = new TTLCache<MediaItem[]>(60 * 60_000);

  async animeGems(limit = 20, includeMature = false): Promise<MediaItem[]> {
    return cached(this.animeGemsCache, `gems|${limit}|${includeMature}`, async () => {
      const media = await anilistQuery(
        `query ($n: Int, $adult: Boolean) {
          Page(perPage: $n) {
            media(type: ANIME, sort: SCORE_DESC, averageScore_greater: 78, popularity_lesser: 50000, isAdult: $adult) { ${MEDIA_FIELDS} }
          }
        }`,
        { n: limit * 2, adult: includeMature ? undefined : false },
      );
      return media
        .filter(
          (m) =>
            (includeMature || !m.isAdult) &&
            !AniListProvider.numberedSequel(m.title.english ?? m.title.romaji ?? ""),
        )
        .slice(0, limit)
        .map((m) => toMediaItem(m, "ANIME"));
    });
  }

  /** All-time most popular manga. */
  private mangaTopCache = new TTLCache<MediaItem[]>(60 * 60_000);

  async mangaTop(limit = 20, includeMature = false): Promise<MediaItem[]> {
    return cached(this.mangaTopCache, `top|${limit}|${includeMature}`, async () => {
      const media = await anilistQuery(
        `query ($n: Int, $adult: Boolean) {
          Page(perPage: $n) {
            media(type: MANGA, sort: POPULARITY_DESC, isAdult: $adult) { ${MEDIA_FIELDS} }
          }
        }`,
        { n: limit, adult: includeMature ? undefined : false },
      );
      return media
        .filter(
          (m) =>
            (includeMature || !m.isAdult) &&
            !AniListProvider.numberedSequel(m.title.english ?? m.title.romaji ?? ""),
        )
        .map((m) => toMediaItem(m, "MANGA"));
    });
  }

  /** Iconic classic manga — most popular works that started before `beforeYear`. */
  private mangaClassicsCache = new TTLCache<MediaItem[]>(60 * 60_000);

  async mangaClassics(beforeYear = 2000, limit = 20, includeMature = false): Promise<MediaItem[]> {
    return cached(this.mangaClassicsCache, `classics|${beforeYear}|${limit}|${includeMature}`, async () => {
      const media = await anilistQuery(
        `query ($n: Int, $adult: Boolean, $before: FuzzyDateInt) {
          Page(perPage: $n) {
            media(type: MANGA, sort: POPULARITY_DESC, startDate_lesser: $before, isAdult: $adult) { ${MEDIA_FIELDS} }
          }
        }`,
        { n: limit, before: beforeYear * 10000, adult: includeMature ? undefined : false },
      );
      return media.filter((m) => includeMature || !m.isAdult).map((m) => toMediaItem(m, "MANGA"));
    });
  }

  /** Critically acclaimed manga — highest community scores. */
  private mangaAcclaimedCache = new TTLCache<MediaItem[]>(60 * 60_000);

  async mangaAcclaimed(limit = 20, includeMature = false): Promise<MediaItem[]> {
    return cached(this.mangaAcclaimedCache, `acclaimed|${limit}|${includeMature}`, async () => {
      const media = await anilistQuery(
        `query ($n: Int, $adult: Boolean) {
          Page(perPage: $n) {
            media(type: MANGA, sort: SCORE_DESC, averageScore_greater: 80, isAdult: $adult) { ${MEDIA_FIELDS} }
          }
        }`,
        { n: limit, adult: includeMature ? undefined : false },
      );
      return media
        .filter(
          (m) =>
            (includeMature || !m.isAdult) &&
            !AniListProvider.numberedSequel(m.title.english ?? m.title.romaji ?? ""),
        )
        .map((m) => toMediaItem(m, "MANGA"));
    });
  }

  /** Hidden-gem manga — high scores, small readership. */
  private mangaGemsCache = new TTLCache<MediaItem[]>(60 * 60_000);

  async mangaGems(limit = 20, includeMature = false): Promise<MediaItem[]> {
    return cached(this.mangaGemsCache, `gems|${limit}|${includeMature}`, async () => {
      const media = await anilistQuery(
        `query ($n: Int, $adult: Boolean) {
          Page(perPage: $n) {
            media(type: MANGA, sort: SCORE_DESC, averageScore_greater: 78, popularity_lesser: 60000, isAdult: $adult) { ${MEDIA_FIELDS} }
          }
        }`,
        { n: limit * 2, adult: includeMature ? undefined : false },
      );
      return media
        .filter(
          (m) =>
            (includeMature || !m.isAdult) &&
            !AniListProvider.numberedSequel(m.title.english ?? m.title.romaji ?? ""),
        )
        .slice(0, limit)
        .map((m) => toMediaItem(m, "MANGA"));
    });
  }

  getAttribution() {
    return {
      name: "AniList",
      notice: "Anime metadata and artwork from AniList's public API.",
      canonical: "https://anilist.co/",
    };
  }
}
