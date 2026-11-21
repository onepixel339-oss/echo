/**
 * ECHO — Normalized domain types.
 * Mirrors the spec (section 11) with minor pragmatic refinements.
 * All user data is local-first (IndexedDB). No server, no accounts.
 */

export type MediaType = "anime" | "movie" | "series" | "game" | "book";

/** Coarse running format, derived from mediaType + episode count. */
export type MediaFormat = "film" | "series" | "game" | "book";

export const MEDIA_TYPES: MediaType[] = ["anime", "movie", "series", "game", "book"];

/** The three legacy screen types (pre-expansion), used for migrations. */
export const LEGACY_MEDIA_TYPES: MediaType[] = ["anime", "movie", "series"];

/** Deterministic format for a media type (manual entries, provider adapters). */
export function formatForType(mediaType: MediaType): MediaFormat {
  switch (mediaType) {
    case "movie":
      return "film";
    case "game":
      return "game";
    case "book":
      return "book";
    default:
      return "series"; // anime & series are episodic by default
  }
}

export type LibraryStatus =
  | "completed"
  | "watching"
  | "planned"
  | "dropped"
  | "on_hold";

/** Rating scale: 1..5 stars. `undefined` means explicitly unrated. */
export type Rating = 1 | 2 | 3 | 4 | 5;

export const RATING_MAX = 5;

export interface MediaItem {
  localId: string;
  provider: string; // "anilist" | "tvmaze" | "imdb" | "echo-demo" | "manual"
  providerId: string;
  canonicalUrl?: string;
  mediaType: MediaType;
  format: MediaFormat;
  title: string;
  titleAr?: string;
  originalTitle?: string;
  synopsis?: string;
  synopsisAr?: string;
  releaseDate?: string;
  releaseYear?: number;
  genres: string[]; // slugs, e.g. "sci-fi"
  tags: string[]; // slugs, e.g. "time-travel"
  creators?: string[];
  studios?: string[];
  cast?: string[];
  languages?: string[];
  countries?: string[];
  contentRating?: string; // e.g. "PG-13", "TV-MA" — approximate in demo data
  /** public/audience score on a 0–10 scale (TVMaze/IMDb/AniList/RAWG/Kitsu) */
  publicScore?: number;
  runtimeMinutes?: number;
  episodeCount?: number;
  posterUrl?: string; // external providers only; demo uses generated art
  backdropUrl?: string;
  /** trailer link (YouTube) when the provider ships one — Cinemeta */
  trailerUrl?: string;
  sourceAttribution?: string;
  metadataFetchedAt?: string;
}

export interface UserMediaEntry {
  id: string;
  mediaLocalId: string;
  status: LibraryStatus;
  rating?: Rating;
  isFavourite: boolean;
  personalNote?: string;
  userTags: string[];
  addedAt: string;
  updatedAt: string;
  completedAt?: string;
}

export type FeedbackValue =
  | "liked"
  | "disliked"
  | "interested"
  | "not_for_me"
  | "already_watched";

export interface TasteFeedback {
  id: string;
  mediaLocalId?: string;
  featureKey?: string; // e.g. "genre:mystery" (onboarding preference cards)
  value: FeedbackValue;
  source:
    | "rating"
    | "favourite"
    | "onboarding"
    | "recommendation"
    | "manual";
  createdAt: string;
}

export interface MapLayoutState {
  positions: Record<string, { x: number; y: number }>;
  zoom: number;
  panX: number;
  panY: number;
  activeFilters: Record<string, unknown>;
  layoutVersion: number;
  updatedAt: string;
}

export type ThemeMode = "dark" | "light" | "system";
export type ContentVisibility = "safe" | "moderate" | "all";
export type Language = "en" | "ar";

export interface AppSettings {
  language: Language;
  theme: ThemeMode;
  interests: MediaType[];
  onboarded: boolean;
  onboardedAt?: string;
  demoMode: boolean;
  contentVisibility: ContentVisibility;
  recencyWeight: boolean;
  mapLabels: boolean;
  animations: boolean;
  excludedGenres: string[];
  dismissedInsights: string[];
  schemaVersion: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: "en",
  theme: "dark",
  interests: ["anime", "movie", "series", "game", "book"],
  onboarded: false,
  demoMode: false,
  contentVisibility: "moderate",
  recencyWeight: true,
  mapLabels: true,
  animations: true,
  excludedGenres: [],
  dismissedInsights: [],
  schemaVersion: 2,
};

/** v1 → v2: the catalogue grew games (RAWG) and books (Open Library).
 *  Existing users never opted out of types that did not exist, so the
 *  expansion is additive — they can turn either off in Settings. */
export function migrateSettings(settings: AppSettings): AppSettings {
  if (settings.schemaVersion >= 2) return settings;
  const interests = [...new Set([...settings.interests, "game" as MediaType, "book" as MediaType])];
  return { ...settings, interests, schemaVersion: 2 };
}

/** An edge in the similarity graph (spec 8.1). */
export interface SimEdge {
  a: string; // localId
  b: string; // localId
  score: number; // 0..1
  reasons: SimReason[];
}

export interface SimReason {
  kind: "genre" | "tag" | "format" | "creator" | "era" | "language" | "userTag";
  /** Shared values that produced this reason. */
  values: string[];
  weight: number; // contribution 0..1
}

export interface Cluster {
  id: string;
  labelKey: string | null; // genre/tag slug the cluster is named after, if confident
  members: string[]; // localIds
}

export type RecMode =
  | "closest"
  | "because"
  | "adjacent"
  | "explore"
  | "island";

export interface RecReasonData {
  key: string; // i18n key suffix
  values: string[]; // display values
}

export interface Recommendation {
  item: MediaItem;
  score: number; // 0..1
  reasonData: RecReasonData[];
  mode: RecMode;
}

export interface TasteFeatureStat {
  key: string; // "genre:mystery"
  kind: "genre" | "tag" | "creator" | "studio" | "type";
  slug: string;
  score: number; // signed evidence
  sampleCount: number; // titles contributing
}

export type TasteConfidence = "early" | "tentative" | "established";

export interface TasteProfile {
  features: TasteFeatureStat[];
  ratedCount: number;
  positiveCount: number;
  negativeCount: number;
  confidence: TasteConfidence;
}

export interface ExportBundle {
  app: "ECHO";
  schemaVersion: number;
  exportedAt: string;
  settings?: Partial<AppSettings>;
  entries: UserMediaEntry[];
  media: MediaItem[]; // provider IDs + permitted fields only
  feedback: TasteFeedback[];
  mapLayout?: MapLayoutState | null;
}
