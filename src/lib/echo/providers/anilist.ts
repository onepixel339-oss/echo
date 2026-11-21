/**
 * ECHO — AniList adapter (anime).
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

interface AniListMedia {
  id: number;
  title: { romaji?: string; english?: string; native?: string };
  genres?: string[];
  tags?: { name: string; rank: number; isGeneralSpoiler?: boolean }[];
  isAdult?: boolean;
  averageScore?: number;
  episodes?: number;
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

function toMediaItem(m: AniListMedia): MediaItem {
  const title = m.title.english || m.title.romaji || m.title.native || "Untitled";
  const isFilm = m.format === "MOVIE";
  const tags = (m.tags ?? [])
    .filter((t) => t.rank >= 75 && !t.isGeneralSpoiler)
    .slice(0, 8)
    .map((t) => slugifyText(t.name))
    .filter(Boolean);
  return {
    localId: `anilist:${m.id}`,
    provider: "anilist",
    providerId: String(m.id),
    canonicalUrl: m.siteUrl,
    mediaType: "anime" as MediaType,
    format: (isFilm ? "film" : "series") as MediaFormat,
    title,
    originalTitle: m.title.romaji !== title ? m.title.romaji : m.title.native,
    synopsis: m.description ? stripMarkdown(m.description).slice(0, 1200) : undefined,
    releaseYear: m.startDate?.year,
    genres: (m.genres ?? []).map(normalizeGenre),
    tags,
    studios: m.studios?.nodes?.map((s) => s.name).slice(0, 3),
    episodeCount: isFilm ? undefined : m.episodes,
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
  episodes
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
    movies: false,
    series: false,
    games: false,
    books: false,
    contentRatings: true,
    relatedTitles: false,
  };

  isConfigured(): boolean {
    return true;
  }

  async search(query: string, filters?: SearchFilters): Promise<ProviderSearchResult[]> {
    const media = await anilistQuery(
      `query ($s: String, $n: Int) {
        Page(perPage: $n) {
          media(search: $s, type: ANIME, sort: SEARCH_MATCH, isAdult: false) { ${MEDIA_FIELDS} }
        }
      }`,
      { s: query, n: Math.min(20, (filters?.limit ?? 8) * 2) },
    );
    return media
      .filter((m) => !m.isAdult)
      .slice(0, filters?.limit ?? 8)
      .map((item) => ({ item: toMediaItem(item), sourceLabel: "AniList" }));
  }

  /** Trending/popular anime — used to build a real candidate pool for Discover.
   *  Cached 30 min: identical for every user with the same genres. */
  private genreCache = new TTLCache<MediaItem[]>(30 * 60_000);

  async byGenres(genres: string[], limit = 24, includeMature = false): Promise<MediaItem[]> {
    const display = genres.slice(0, 3);
    return cached(this.genreCache, `${display.join(",")}|${limit}|${includeMature}`, async () => {
      const media = await anilistQuery(
        `query ($g: [String], $n: Int, $adult: Boolean) {
          Page(perPage: $n) {
            media(genre_in: $g, type: ANIME, sort: POPULARITY_DESC, isAdult: $adult) { ${MEDIA_FIELDS} }
          }
        }`,
        { g: display, n: limit, adult: includeMature ? undefined : false },
      );
      return media.filter((m) => includeMature || !m.isAdult).map(toMediaItem);
    });
  }

  async getTitle(providerId: string): Promise<MediaItem | null> {
    const media = await anilistQuery(
      `query ($id: Int) {
        Page(perPage: 1) { media(id: $id, type: ANIME) { ${MEDIA_FIELDS} } }
      }`,
      { id: Number(providerId) },
    );
    return media[0] ? toMediaItem(media[0]) : null;
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
      return media.filter((m) => includeMature || !m.isAdult).map(toMediaItem);
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
