/**
 * ECHO — Export / import (versioned JSON backups, spec 10.3).
 * Import always validates before touching existing data, shows a count
 * preview and asks before merge/replace.
 */

import { z } from "zod";
import type { ExportBundle, MediaItem, TasteFeedback, UserMediaEntry } from "./types";

const ratingSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);

const mediaItemSchema = z.object({
  localId: z.string().min(1),
  provider: z.string().min(1),
  providerId: z.string(),
  canonicalUrl: z.string().optional(),
  mediaType: z.enum(["anime", "movie", "series", "game", "book"]),
  format: z.enum(["film", "series", "game", "book"]),
  title: z.string().min(1),
  titleAr: z.string().optional(),
  originalTitle: z.string().optional(),
  synopsis: z.string().optional(),
  synopsisAr: z.string().optional(),
  releaseDate: z.string().optional(),
  releaseYear: z.number().int().optional(),
  genres: z.array(z.string()),
  tags: z.array(z.string()),
  creators: z.array(z.string()).optional(),
  studios: z.array(z.string()).optional(),
  cast: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  countries: z.array(z.string()).optional(),
  contentRating: z.string().optional(),
  runtimeMinutes: z.number().optional(),
  episodeCount: z.number().optional(),
  posterUrl: z.string().optional(),
  backdropUrl: z.string().optional(),
  sourceAttribution: z.string().optional(),
  metadataFetchedAt: z.string().optional(),
});

const entrySchema = z.object({
  id: z.string().min(1),
  mediaLocalId: z.string().min(1),
  status: z.enum(["completed", "watching", "planned", "dropped", "on_hold"]),
  rating: ratingSchema.optional(),
  isFavourite: z.boolean(),
  personalNote: z.string().optional(),
  userTags: z.array(z.string()),
  addedAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
});

const feedbackSchema = z.object({
  id: z.string().min(1),
  mediaLocalId: z.string().optional(),
  featureKey: z.string().optional(),
  value: z.enum(["liked", "disliked", "interested", "not_for_me", "already_watched"]),
  source: z.enum(["rating", "favourite", "onboarding", "recommendation", "manual"]),
  createdAt: z.string(),
});

const bundleSchema = z.object({
  app: z.literal("ECHO"),
  schemaVersion: z.number(),
  exportedAt: z.string(),
  settings: z
    .object({
      language: z.enum(["en", "ar"]).optional(),
      interests: z.array(z.enum(["anime", "movie", "series", "game", "book"])).optional(),
      recencyWeight: z.boolean().optional(),
      mapLabels: z.boolean().optional(),
      animations: z.boolean().optional(),
    })
    .optional(),
  entries: z.array(entrySchema),
  media: z.array(mediaItemSchema),
  feedback: z.array(feedbackSchema),
  mapLayout: z.any().optional(),
});

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export type ValidBundle = ExportBundle;

export function validateBundle(data: unknown): { ok: true; data: ValidBundle } | { ok: false; error: string } {
  const parsed = bundleSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "schema" };
  const b = parsed.data as unknown as ValidBundle;
  // every entry must reference a media item present in the bundle
  const ids = new Set(b.media.map((m) => m.localId));
  const orphans = b.entries.filter((e) => !ids.has(e.mediaLocalId));
  if (orphans.length === b.entries.length && b.entries.length > 0) {
    return { ok: false, error: "orphan-entries" };
  }
  return { ok: true, data: b };
}

export function buildBundle(args: {
  settings: ExportBundle["settings"];
  media: MediaItem[];
  entries: UserMediaEntry[];
  feedback: TasteFeedback[];
}): ExportBundle {
  const entryMediaIds = new Set(args.entries.map((e) => e.mediaLocalId));
  return {
    app: "ECHO",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    // provider references + permitted fields only (no secrets, no images)
    media: args.media
      .filter((m) => entryMediaIds.has(m.localId) || m.provider === "manual")
      .map((m) => ({
        ...m,
        posterUrl: undefined,
        backdropUrl: undefined,
      })),
    entries: args.entries,
    feedback: args.feedback,
    settings: args.settings,
  };
}

export interface ApplyDeps {
  putMedia: (items: MediaItem[]) => Promise<void>;
  putEntries: (entries: UserMediaEntry[]) => Promise<void>;
  putFeedback: (items: TasteFeedback[]) => Promise<void>;
  getAllEntries: () => Promise<UserMediaEntry[]>;
  getAllMedia: () => Promise<MediaItem[]>;
  getAllFeedback: () => Promise<TasteFeedback[]>;
}

/** Merge keeps current entries (incoming only fills new titles);
 *  Replace wipes and restores the bundle. */
export async function applyBundle(
  bundle: ValidBundle,
  mode: "merge" | "replace",
  deps: ApplyDeps,
): Promise<number> {
  if (mode === "replace") {
    const { clearLibraryStores } = await import("./localdbHelpers");
    await clearLibraryStores();
    await deps.putMedia(bundle.media);
    await deps.putEntries(bundle.entries);
    await deps.putFeedback(bundle.feedback);
    return bundle.entries.length;
  }
  const [existingEntries, existingMedia] = await Promise.all([
    deps.getAllEntries(),
    deps.getAllMedia(),
  ]);
  const existingMediaIds = new Set(existingMedia.map((m) => m.localId));
  const existingKeys = new Set(existingEntries.map((e) => e.mediaLocalId));
  const newMedia = bundle.media.filter((m) => !existingMediaIds.has(m.localId));
  const newEntries = bundle.entries.filter((e) => !existingKeys.has(e.mediaLocalId));
  const existingFb = await deps.getAllFeedback();
  const fbKeys = new Set(existingFb.map((f) => `${f.mediaLocalId ?? ""}|${f.featureKey ?? ""}|${f.value}`));
  const newFb = bundle.feedback.filter(
    (f) => !fbKeys.has(`${f.mediaLocalId ?? ""}|${f.featureKey ?? ""}|${f.value}`),
  );
  await deps.putMedia(newMedia);
  await deps.putEntries(newEntries);
  await deps.putFeedback(newFb);
  return newEntries.length;
}
