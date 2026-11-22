/**
 * ECHO — Discover: the whole catalogue, curated and personal.
 *
 * Two layers:
 *  1. Curated sections (All-time favourites · Iconic classics · Popular now
 *     · Critically acclaimed · Hidden gems) built from REAL provider charts
 *     — visible from day one, before any ratings exist.
 *  2. Explainable personal recommendation shelves (closest / because /
 *     adjacent / island / explore) that unlock at 3+ rated titles and show
 *     the actual shared features. No fake percentages.
 *
 * A title never appears twice on the screen: personal shelves win, curated
 * sections are globally deduped, and everything already in the library is
 * filtered out client-side.
 */

"use client";

import React from "react";
import { Compass, ThumbsUp, ThumbsDown, Check, Plus, SlidersHorizontal, Info, Loader2, WifiOff, RefreshCw, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/echo/i18n";
import { useEchoStore, useActiveLibrary } from "@/lib/echo/store";
import { computeIdf } from "@/lib/echo/engine/features";
import { buildTasteProfile } from "@/lib/echo/engine/taste";
import {
  recommendClosest,
  recommendAdjacent,
  recommendBecause,
  recommendExplore,
  recommendIsland,
  pickAnchorEntry,
} from "@/lib/echo/engine/recommend";
import { computeClusters } from "@/lib/echo/engine/cluster";
import { buildSimilarityGraph } from "@/lib/echo/engine/similarity";
import {
  fetchCandidatePool,
  fetchComingSoon,
  fetchDiscoverSections,
  type ComingSoonShelf,
  type DiscoverSection,
} from "@/lib/echo/providers";
import { DEMO_CATALOGUE, demoToMediaItem } from "@/lib/echo/data/demoCatalogue";
import { MEDIA_TYPES, type MediaItem, type MediaType, type Recommendation } from "@/lib/echo/types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { EmptyState, MediaTypeIcon, PosterTile } from "../bits";
import { useToast } from "@/hooks/use-toast";

const DEMO_ITEMS: MediaItem[] = DEMO_CATALOGUE.map(demoToMediaItem);

/** Common genre chips for the "explore a genre" row (canonical slugs). */
const GENRE_CHIPS = [
  "sci-fi",
  "fantasy",
  "mystery",
  "thriller",
  "horror",
  "romance",
  "comedy",
  "drama",
  "action",
  "adventure",
  "crime",
  "historical",
];

export function DiscoverScreen() {
  const { t, tv, lang } = useI18n();
  const { toast } = useToast();
  const { entries, mediaById } = useActiveLibrary();
  const settings = useEchoStore((s) => s.settings);
  const addTitle = useEchoStore((s) => s.addTitle);
  const recordFeedback = useEchoStore((s) => s.recordFeedback);
  const setView = useEchoStore((s) => s.setView);
  const select = useEchoStore((s) => s.select);
  const feedback = useEchoStore((s) => s.feedback);

  const [dial, setDial] = React.useState(30); // familiar ↔ surprising
  const [types, setTypes] = React.useState<Set<MediaType>>(new Set());

  // ---- coming soon: upcoming games + airing anime (a calendar, not a rec) ----
  const [comingSoon, setComingSoon] = React.useState<ComingSoonShelf | null>(null);

  React.useEffect(() => {
    const wants = settings.interests.filter((mt) => mt === "anime" || mt === "game");
    if (!wants.length) return;
    let cancelled = false;
    fetchComingSoon({
      mediaTypes: wants,
      visibility: settings.contentVisibility,
      limitPerShelf: 12,
    })
      .then((res) => {
        if (!cancelled) setComingSoon(res);
      })
      .catch(() => undefined); // the shelf simply stays hidden on failure
    return () => {
      cancelled = true;
    };
  }, [settings.interests, settings.contentVisibility]);

  // ---- curated sections (no taste needed — real charts only) ----
  const [curated, setCurated] = React.useState<DiscoverSection[] | null>(null);
  const [curatedState, setCuratedState] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  const [curatedSources, setCuratedSources] = React.useState<string[]>([]);
  const [curatedNonce, setCuratedNonce] = React.useState(0);

  const interests: MediaType[] = settings.interests.length
    ? settings.interests
    : MEDIA_TYPES;
  const interestsKey = React.useMemo(() => [...interests].sort().join(","), [interests]);

  React.useEffect(() => {
    if (!interests.length) return;
    let cancelled = false;
    setCuratedState((s) => (s === "ready" ? "ready" : "loading"));
    fetchDiscoverSections({
      mediaTypes: interests,
      visibility: settings.contentVisibility,
      excludedGenres: settings.excludedGenres,
      maxPerSection: 14,
    })
      .then((res) => {
        if (cancelled) return;
        setCurated(res.sections);
        setCuratedSources(res.sources);
        setCuratedState(res.sections.length ? "ready" : "error");
      })
      .catch(() => {
        if (cancelled) return;
        setCurated([]);
        setCuratedState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [interestsKey, settings.contentVisibility, settings.excludedGenres, curatedNonce]);

  // ---- genre explore row: a one-tap genre shelf across the user's types ----
  const [genreFocus, setGenreFocus] = React.useState<string | null>(null);
  const [genreShelf, setGenreShelf] = React.useState<MediaItem[] | null>(null);
  const [genreLoading, setGenreLoading] = React.useState(false);

  const libraryIds = React.useMemo(() => new Set(entries.map((e) => e.mediaLocalId)), [entries]);

  const onGenreChip = (slug: string) => {
    if (genreFocus === slug) {
      setGenreFocus(null);
      setGenreShelf(null);
      return;
    }
    setGenreFocus(slug);
    setGenreShelf(null);
    setGenreLoading(true);
    fetchCandidatePool({
      genres: [slug],
      mediaTypes: interests,
      visibility: settings.contentVisibility,
      limitPerSource: 8,
    })
      .then((res) => {
        const seen = new Set(libraryIds);
        const seenTitles = new Set<string>();
        const mixed: MediaItem[] = [];
        for (const item of res.pool) {
          if (seen.has(item.localId)) continue;
          const tk = `${item.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")}|${item.releaseYear ?? ""}`;
          if (seenTitles.has(tk)) continue;
          seen.add(item.localId);
          seenTitles.add(tk);
          mixed.push(item);
        }
        setGenreShelf(mixed.slice(0, 14));
      })
      .catch(() => setGenreShelf([]))
      .finally(() => setGenreLoading(false));
  };

  // ---- personal recommendation pool (taste-based, 3+ ratings) ----
  const [pool, setPool] = React.useState<MediaItem[] | null>(null);
  const [poolState, setPoolState] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  const [poolSources, setPoolSources] = React.useState<string[]>([]);
  const [poolNonce, setPoolNonce] = React.useState(0);

  const profile = React.useMemo(
    () => buildTasteProfile(mediaById, entries, feedback, { recencyWeight: settings.recencyWeight }),
    [mediaById, entries, feedback, settings.recencyWeight],
  );

  const rejectedLocalIds = React.useMemo(
    () =>
      new Set(
        feedback.filter((f) => f.value === "not_for_me" && f.mediaLocalId).map((f) => f.mediaLocalId!),
      ),
    [feedback],
  );

  const libraryItems = React.useMemo(
    () =>
      entries
        .map((e) => mediaById.get(e.mediaLocalId))
        .filter((m): m is MediaItem => Boolean(m)),
    [entries, mediaById],
  );

  /** top genre slugs from the taste profile (falls back to interests) */
  const topGenres = React.useMemo(() => {
    const genres = profile.features
      .filter((f) => f.kind === "genre" && f.score > 0)
      .sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : 1))
      .map((f) => f.slug);
    if (genres.length >= 2) return genres.slice(0, 3);
    // not enough rated signal yet → seed from library genres by frequency
    const freq = new Map<string, number>();
    for (const m of libraryItems) for (const g of m.genres) freq.set(g, (freq.get(g) ?? 0) + 1);
    const byFreq = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
    return [...genres, ...byFreq].slice(0, 3);
  }, [profile, libraryItems]);

  const poolKey = React.useMemo(
    () => `${topGenres.join("+")}|${interestsKey}|${poolNonce}`,
    [topGenres, interestsKey, poolNonce],
  );

  // fetch the personal pool only once the taste signal exists
  React.useEffect(() => {
    if (profile.ratedCount < 3 && libraryItems.length < 3) return;
    let cancelled = false;
    setPoolState("loading");
    const includeMature = settings.contentVisibility === "all";
    fetchCandidatePool({
      genres: topGenres.length ? topGenres : ["drama"],
      mediaTypes: interests,
      includeMature,
      limitPerSource: 20,
      arabicShelf: settings.language === "ar",
    })
      .then((res) => {
        if (cancelled) return;
        const items = res.pool.length ? res.pool : DEMO_ITEMS;
        setPool(items);
        setPoolSources(res.sources);
        setPoolState(res.pool.length ? "ready" : "error");
      })
      .catch(() => {
        if (cancelled) return;
        setPool(DEMO_ITEMS);
        setPoolState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [poolKey]);

  const idf = React.useMemo(() => {
    const libIds = new Set(libraryItems.map((m) => m.localId));
    const corpus = [...libraryItems, ...DEMO_ITEMS.filter((m) => !libIds.has(m.localId))];
    return computeIdf(corpus);
  }, [libraryItems]);

  const candidates = React.useMemo(() => {
    if (!pool) return [];
    return pool.filter(
      (m) =>
        !libraryIds.has(m.localId) &&
        (!types.size || types.has(m.mediaType)),
    );
  }, [pool, types, libraryIds]);

  const baseOpts = React.useMemo(
    () => ({
      profile,
      candidates,
      entries,
      mediaById,
      simOptions: { idf },
      excludedGenres: settings.excludedGenres,
      rejectedLocalIds,
      visibility: settings.contentVisibility,
      maxShelf: 10,
    }),
    [profile, candidates, entries, mediaById, idf, settings.excludedGenres, settings.contentVisibility, rejectedLocalIds],
  );

  const anchorEntry = React.useMemo(() => pickAnchorEntry(entries, mediaById), [entries, mediaById]);

  // clusters for the "explore this island" shelf
  const clusters = React.useMemo(() => {
    if (libraryItems.length < 3) return [];
    const edges = buildSimilarityGraph(libraryItems, { idf });
    return computeClusters(libraryItems, edges);
  }, [libraryItems, idf]);
  const biggestCluster = React.useMemo(
    () => clusters.filter((c) => c.members.length >= 2).sort((a, b) => b.members.length - a.members.length)[0],
    [clusters],
  );

  const personalShelves = React.useMemo(() => {
    if (profile.ratedCount < 3 || !candidates.length) return null;
    const w = dial / 100;
    const list: { id: string; title: string; sub: string; recs: Recommendation[] }[] = [];
    const closest = recommendClosest(baseOpts);
    if (w > 0.55) {
      // surprising side: blend in adjacent ranking
      const adjacent = recommendAdjacent(baseOpts);
      const merged = [...closest.map((r) => ({ ...r, score: r.score * (1 - w * 0.7) })), ...adjacent.map((r) => ({ ...r, score: r.score * (0.35 + w * 0.65), mode: "adjacent" as const }))]
        .sort((a, b) => b.score - a.score || (a.item.localId < b.item.localId ? -1 : 1));
      list.push({
        id: "main",
        title: w > 0.8 ? t("discover.explore") : t("discover.adjacent"),
        sub: w > 0.8 ? t("discover.explore.sub") : t("discover.adjacent.sub"),
        recs: mixByType(dedupe(merged), 10),
      });
    } else {
      list.push({
        id: "main",
        title: t("discover.closest"),
        sub: t("discover.closest.sub"),
        recs: mixByType(closest, 10),
      });
    }
    if (anchorEntry) {
      const anchorItem = mediaById.get(anchorEntry.mediaLocalId);
      if (anchorItem) {
        list.push({
          id: "because",
          title: t("discover.because", {
            title: anchorItem.title,
          }),
          sub: t("discover.because.sub"),
          recs: recommendBecause(baseOpts, anchorEntry.mediaLocalId, 8),
        });
      }
    }
    if (w <= 0.55) {
      list.push({
        id: "adjacent",
        title: t("discover.adjacent"),
        sub: t("discover.adjacent.sub"),
        recs: recommendAdjacent(baseOpts, 8),
      });
    }
    if (biggestCluster) {
      const labelKey = biggestCluster.labelKey;
      const name = labelKey ? tv(labelKey.split(":")[1]) : t("map.cluster.island");
      list.push({
        id: "island",
        title: t("discover.island", { name }),
        sub: t("discover.island.sub"),
        recs: recommendIsland(baseOpts, biggestCluster.members, 8),
      });
    }
    if (w > 0.55) {
      list.push({
        id: "explore",
        title: t("discover.explore"),
        sub: t("discover.explore.sub"),
        recs: recommendExplore(baseOpts, 8),
      });
    }
    return list.filter((s) => s.recs.length > 0);
  }, [baseOpts, dial, anchorEntry, biggestCluster, profile.ratedCount, candidates.length]);

  /** localIds already surfaced by the personal shelves — curated skips them */
  const personalIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const shelf of personalShelves ?? []) {
      for (const rec of shelf.recs) ids.add(rec.item.localId);
    }
    return ids;
  }, [personalShelves]);

  /** curated sections, filtered client-side against library/rejected/personal */
  const visibleCurated = React.useMemo(() => {
    if (!curated) return [];
    return curated
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (item) =>
            !libraryIds.has(item.localId) &&
            !rejectedLocalIds.has(item.localId) &&
            !personalIds.has(item.localId) &&
            (!types.size || types.has(item.mediaType)),
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [curated, libraryIds, rejectedLocalIds, personalIds, types]);

  const genreShelfVisible = React.useMemo(() => {
    if (!genreShelf) return [];
    return genreShelf.filter(
      (item) => !libraryIds.has(item.localId) && (!types.size || types.has(item.mediaType)),
    );
  }, [genreShelf, libraryIds, types]);

  const hasAnyContent =
    comingSoon?.games.length || comingSoon?.airingAnime.length || personalShelves?.length || visibleCurated.length || genreShelfVisible.length;

  const showSkeleton =
    curatedState === "loading" && !curated && poolState !== "loading";

  // ---------- action handlers shared by curated tiles and rec cards ----------
  const onInterested = (item: MediaItem) => {
    void recordFeedback(item.localId, "interested", "recommendation");
    toast({ description: t("discover.feedbackNote") });
  };
  const onNotForMe = (item: MediaItem) => {
    void recordFeedback(item.localId, "not_for_me", "recommendation");
    toast({ description: t("discover.feedbackNote") });
  };
  const onWatched = (item: MediaItem) => {
    void addTitle(item, { status: "completed" }).then(() => toast({ description: t("toast.added") }));
  };
  const onPlanned = (item: MediaItem) => {
    void addTitle(item, { status: "planned" }).then(() => toast({ description: t("toast.added") }));
  };

  // ---------- total failure: no curated, no personal, no coming soon ----------
  if (
    !hasAnyContent &&
    curatedState === "error" &&
    poolState !== "loading"
  ) {
    return (
      <div className="px-4 pt-10 md:px-8">
        <EmptyState
          icon={<WifiOff className="h-12 w-12" strokeWidth={1.2} />}
          title={t("discover.offlineTitle")}
          sub={t("discover.offlineSub")}
        >
          <Button
            variant="outline"
            onClick={() => {
              setCuratedNonce((n) => n + 1);
              setPoolNonce((n) => n + 1);
            }}
          >
            <RefreshCw className="me-1.5 h-4 w-4" aria-hidden />
            {t("discover.retry")}
          </Button>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-4 pt-4 md:px-8">
      <ComingSoonSection shelf={comingSoon} lang={lang} t={t} onSelect={(item) => select(item.localId, item)} />

      {/* controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="max-w-md text-sm text-muted-foreground">{t("discover.sub")}</p>
          {(curatedSources.length > 0 || poolSources.length > 0) && (
            <p className="echo-overline mt-1.5">
              {t("discover.liveFrom", { sources: [...new Set([...curatedSources, ...poolSources])].join(" · ") })}
            </p>
          )}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
              {t("discover.controls")}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
                  {t("discover.similarity")}
                </label>
                <Slider
                  value={[dial]}
                  onValueChange={(v) => setDial(v[0])}
                  min={0}
                  max={100}
                  step={10}
                  aria-label={t("discover.similarity")}
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium text-muted-foreground">{t("discover.types")}</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {MEDIA_TYPES.map((mt) => (
                    <button
                      key={mt}
                      onClick={() =>
                        setTypes((prev) => {
                          const next = new Set(prev);
                          if (next.has(mt)) next.delete(mt);
                          else next.add(mt);
                          return next;
                        })
                      }
                      aria-pressed={types.has(mt)}
                      className={cn(
                        "flex-1 rounded-lg border px-2 py-1.5 text-xs transition",
                        types.has(mt)
                          ? "border-echo-accent/60 bg-echo-accent/10 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t(`media.${mt}`)}
                    </button>
                  ))}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setCuratedNonce((n) => n + 1);
                  setPoolNonce((n) => n + 1);
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                {t("discover.refreshPool")}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* explore a genre — one tap, real pools across the user's types */}
      <section aria-label={t("discover.genresRow")} className="flex flex-col gap-2">
        <p className="echo-overline">{t("discover.genresRow")}</p>
        <div className="echo-scroll -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {GENRE_CHIPS.map((slug) => (
            <button
              key={slug}
              onClick={() => onGenreChip(slug)}
              aria-pressed={genreFocus === slug}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                genreFocus === slug
                  ? "border-echo-accent/60 bg-echo-accent/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {tv(slug)}
            </button>
          ))}
        </div>
        {genreFocus && (
          <section aria-label={tv(genreFocus)} className="mt-1 flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="echo-display text-base font-semibold text-foreground">{tv(genreFocus)}</h2>
                <p className="text-xs text-muted-foreground">{t("discover.genreShelf.sub")}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setGenreFocus(null);
                  setGenreShelf(null);
                }}
                aria-label={t("app.close")}
                className="h-7 shrink-0 gap-1 px-2"
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </div>
            {genreLoading ? (
              <GenreSkeleton />
            ) : genreShelfVisible.length ? (
              <div className="echo-scroll echo-shelf -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
                {genreShelfVisible.map((item) => (
                  <CuratedTile
                    key={item.localId}
                    item={item}
                    lang={lang}
                    t={t}
                    tv={tv}
                    onInterested={() => onInterested(item)}
                    onNotForMe={() => onNotForMe(item)}
                    onWatched={() => onWatched(item)}
                    onPlanned={() => onPlanned(item)}
                    onDetails={() => select(item.localId, item)}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-border px-3 py-2 text-center text-xs text-muted-foreground">
                {t("discover.empty.sub")}
              </p>
            )}
          </section>
        )}
      </section>

      {/* personal shelves — explainable recommendations from the user's taste */}
      {personalShelves && personalShelves.length > 0 && (
        <section aria-label={t("discover.personal")} className="flex flex-col gap-5">
          <p className="echo-overline">{t("discover.personal")}</p>
          {personalShelves.map((shelf) => (
            <section key={shelf.id} aria-label={shelf.title}>
              <div className="mb-2.5">
                <h2 className="echo-display text-base font-semibold text-foreground">{shelf.title}</h2>
                <p className="text-xs text-muted-foreground">{shelf.sub}</p>
              </div>
              <div className="echo-scroll echo-shelf -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
                {shelf.recs.map((rec) => (
                  <RecCard
                    key={`${shelf.id}-${rec.item.localId}`}
                    rec={rec}
                    inLibrary={libraryIds.has(rec.item.localId)}
                    lang={lang}
                    tv={tv}
                    t={t}
                    onInterested={() => onInterested(rec.item)}
                    onNotForMe={() => onNotForMe(rec.item)}
                    onWatched={() => onWatched(rec.item)}
                    onPlanned={() => onPlanned(rec.item)}
                    onDetails={() => select(rec.item.localId, rec.item)}
                  />
                ))}
              </div>
            </section>
          ))}
        </section>
      )}

      {/* curated sections — real charts, whole catalogue */}
      <section aria-label={t("discover.browseAll")} className="flex flex-col gap-5">
        <p className="echo-overline">{t("discover.browseAll")}</p>

        {showSkeleton && <ShelfSkeleton />}

        {visibleCurated.map((section) => (
          <section key={section.id} aria-label={t(`discover.sec.${section.id}.title`)}>
            <div className="mb-2.5">
              <h2 className="echo-display text-base font-semibold text-foreground">
                {t(`discover.sec.${section.id}.title`)}
              </h2>
              <p className="text-xs text-muted-foreground">{t(`discover.sec.${section.id}.sub`)}</p>
            </div>
            <div className="echo-scroll echo-shelf -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
              {section.items.map((item) => (
                <CuratedTile
                  key={item.localId}
                  item={item}
                  lang={lang}
                  t={t}
                  tv={tv}
                  onInterested={() => onInterested(item)}
                  onNotForMe={() => onNotForMe(item)}
                  onWatched={() => onWatched(item)}
                  onPlanned={() => onPlanned(item)}
                  onDetails={() => select(item.localId, item)}
                />
              ))}
            </div>
          </section>
        ))}
      </section>

      {/* unlock hint — the personal layer needs 3 ratings */}
      {profile.ratedCount < 3 && (
        <div className="rounded-2xl border border-dashed border-echo-accent/40 bg-echo-accent/5 px-5 py-6 text-center">
          <Compass className="mx-auto h-8 w-8 text-echo-accent" strokeWidth={1.4} aria-hidden />
          <h3 className="mt-2 text-sm font-semibold text-foreground">{t("discover.unlock.title")}</h3>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
            {t("discover.unlock.sub")}
          </p>
          <Button size="sm" className="mt-3" onClick={() => setView("library")}>
            {t("discover.goLibrary")}
          </Button>
        </div>
      )}

      {poolState === "loading" && profile.ratedCount >= 3 && (
        <p className="flex items-center justify-center gap-2 pb-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          {t("discover.loading")}
        </p>
      )}
    </div>
  );
}

/** generic "matches your taste" reasons go last; specific shared features lead */
function reasonRank(key: string): number {
  switch (key) {
    case "shared_creator":
      return 5;
    case "shared_genre":
    case "shared_tag":
      return 4;
    case "adjacentNew":
      return 3;
    case "sharedAnchor":
      return 2;
    default:
      return 1; // tasteMatch
  }
}

/**
 * "Coming soon" shelves: unreleased games (RAWG) + anime airing right now
 * (AniList). A calendar, not a recommendation — shown before the taste
 * shelves so a fresh library still sees something alive.
 */
function ComingSoonSection({
  shelf,
  lang,
  t,
  onSelect,
}: {
  shelf: ComingSoonShelf | null;
  lang: "ar" | "en";
  t: (k: string, p?: Record<string, string | number>) => string;
  onSelect: (item: MediaItem) => void;
}) {
  if (!shelf) return null;
  const shelves: { id: string; title: string; sub: string; items: MediaItem[]; chip: string }[] = [];
  if (shelf.games.length) {
    shelves.push({
      id: "games",
      title: t("coming.games.title"),
      sub: t("coming.games.sub"),
      items: shelf.games,
      chip: t("coming.chip.soon"),
    });
  }
  if (shelf.airingAnime.length) {
    shelves.push({
      id: "airing",
      title: t("coming.anime.title"),
      sub: t("coming.anime.sub"),
      items: shelf.airingAnime,
      chip: t("coming.chip.airing"),
    });
  }
  if (!shelves.length) return null;

  return (
    <>
      {shelves.map((s) => (
        <section key={s.id} aria-label={s.title} className="flex flex-col gap-2.5">
          <div>
            <h2 className="echo-display text-base font-semibold text-foreground">{s.title}</h2>
            <p className="text-xs text-muted-foreground">{s.sub}</p>
          </div>
          <div className="echo-scroll echo-shelf -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
            {s.items.map((item) => (
              <ComingTile key={item.localId} item={item} chip={s.chip} lang={lang} onSelect={onSelect} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function ComingTile({
  item,
  chip,
  lang,
  onSelect,
}: {
  item: MediaItem;
  chip: string;
  lang: "ar" | "en";
  onSelect: (item: MediaItem) => void;
}) {
  const title = item.title;
  const dateLabel = item.releaseDate
    ? new Date(item.releaseDate).toLocaleDateString(lang === "ar" ? "ar-EG" : "en", {
        month: "short",
        year: "numeric",
      })
    : item.releaseYear
      ? String(item.releaseYear)
      : "";
  return (
    <button
      onClick={() => onSelect(item)}
      className="echo-card relative flex w-[170px] shrink-0 snap-start flex-col overflow-hidden rounded-xl text-start transition hover:border-echo-accent/50"
      aria-label={title}
    >
      <PosterTile item={item} width={170} height={210} className="w-full rounded-none rounded-t-xl" />
      <span className="echo-chip absolute start-2 top-2 !bg-card/90">{chip}</span>
      <span className="flex items-center gap-1 px-2.5 pt-2 text-sm font-semibold text-foreground">
        <MediaTypeIcon type={item.mediaType} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate">{title}</span>
      </span>
      <span className="px-2.5 pb-2.5 pt-0.5 font-mono text-[11px] text-muted-foreground">
        {dateLabel || "—"}
        {item.genres[0] ? ` · ${item.genres[0]}` : ""}
      </span>
    </button>
  );
}

/** round-robin by media type so one kind of title never fills the shelf */
function mixByType(recs: Recommendation[], max: number): Recommendation[] {
  const buckets = new Map<string, Recommendation[]>();
  for (const r of recs) {
    const k = r.item.mediaType;
    const list = buckets.get(k) ?? [];
    list.push(r);
    buckets.set(k, list);
  }
  const keys = [...buckets.keys()];
  const out: Recommendation[] = [];
  let i = 0;
  while (out.length < max) {
    let pushed = false;
    for (const k of keys) {
      const item = buckets.get(k)?.[i];
      if (item && out.length < max) {
        out.push(item);
        pushed = true;
      }
    }
    if (!pushed) break;
    i++;
  }
  return out;
}

function dedupe(recs: Recommendation[]): Recommendation[] {
  const seen = new Set<string>();
  const out: Recommendation[] = [];
  for (const r of recs) {
    if (seen.has(r.item.localId)) continue;
    seen.add(r.item.localId);
    out.push(r);
  }
  return out;
}

function sourceChipLabel(provider: string): string {
  switch (provider) {
    case "anilist":
    case "anilist-m":
      return "AniList";
    case "kitsu":
    case "kitsu-m":
      return "Kitsu";
    case "tvmaze":
      return "TVMaze";
    case "imdb":
    case "imdb-series":
      return "IMDb";
    case "rawg":
      return "RAWG";
    case "openlib":
      return "Open Library";
    case "echo-demo":
      return "Sample";
    default:
      return provider;
  }
}

/** A curated-section card: poster + real chart context + quick actions. */
function CuratedTile({
  item,
  lang,
  t,
  tv,
  onInterested,
  onNotForMe,
  onWatched,
  onPlanned,
  onDetails,
}: {
  item: MediaItem;
  lang: "en" | "ar";
  t: (k: string, p?: Record<string, string | number>) => string;
  tv: (slug: string) => string;
  onInterested: () => void;
  onNotForMe: () => void;
  onWatched: () => void;
  onPlanned: () => void;
  onDetails: () => void;
}) {
  const title = lang === "ar" && item.titleAr ? item.titleAr : item.title;
  const metaBits: string[] = [];
  if (item.releaseYear) metaBits.push(String(item.releaseYear));
  if (item.publicScore) metaBits.push(`★ ${item.publicScore.toFixed(1)}`);
  if (item.contentRating) metaBits.push(item.contentRating);
  return (
    <article className="echo-card relative flex w-[210px] shrink-0 snap-start flex-col overflow-hidden rounded-xl transition hover:border-echo-accent/50">
      <button onClick={onDetails} className="relative text-start" aria-label={title}>
        <PosterTile item={item} width={210} height={260} className="w-full rounded-none rounded-t-xl" />
        <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-sm bg-card/85 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          <MediaTypeIcon type={item.mediaType} className="h-3 w-3" aria-hidden />
          {t(`media.${item.mediaType}`)}
        </span>
        <span className="echo-chip absolute end-2 top-2 !bg-card/90">{sourceChipLabel(item.provider)}</span>
      </button>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-1 text-sm font-semibold text-foreground">{title}</h3>
        {metaBits.length > 0 && (
          <p className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
            {item.publicScore ? (
              <Star className="h-3 w-3 fill-echo-warning text-echo-warning" aria-hidden />
            ) : null}
            {metaBits.join(" · ")}
          </p>
        )}
        {item.genres.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.genres.slice(0, 2).map((g) => (
              <Badge key={g} variant="secondary" className="text-[9px]">{tv(g)}</Badge>
            ))}
          </div>
        )}
        {item.creators?.[0] && (
          <p className="text-[11px] leading-snug text-echo-teal line-clamp-1">
            <Info className="me-1 inline h-3 w-3 align-[-2px]" aria-hidden />
            {t("add.moreBySource", { source: item.creators[0] })}
          </p>
        )}
        <div className="mt-auto flex flex-wrap gap-1 pt-1.5">
          <ActionBtn label={t("discover.addPlanned")} onClick={onPlanned} icon={<Plus className="h-3 w-3" />} primary />
          <ActionBtn label={t("discover.interested")} onClick={onInterested} icon={<ThumbsUp className="h-3 w-3" />} />
          <ActionBtn label={t("discover.notForMe")} onClick={onNotForMe} icon={<ThumbsDown className="h-3 w-3" />} />
          <ActionBtn label={t("discover.alreadyWatched")} onClick={onWatched} icon={<Check className="h-3 w-3" />} />
        </div>
      </div>
    </article>
  );
}

function RecCard({
  rec,
  inLibrary,
  lang,
  t,
  tv,
  onInterested,
  onNotForMe,
  onWatched,
  onPlanned,
  onDetails,
}: {
  rec: Recommendation;
  inLibrary: boolean;
  lang: "en" | "ar";
  t: (k: string, p?: Record<string, string | number>) => string;
  tv: (slug: string) => string;
  onInterested: () => void;
  onNotForMe: () => void;
  onWatched: () => void;
  onPlanned: () => void;
  onDetails: () => void;
}) {
  const { item, reasonData } = rec;
  const title = lang === "ar" && item.titleAr ? item.titleAr : item.title;
  const reasonLine = [...reasonData]
    .sort((a, b) => reasonRank(b.key) - reasonRank(a.key))
    .map((r) =>
      t(`discover.reason.${r.key}`, {
        values: r.values.map((v) => tv(v)).join(" · "),
      }),
    )
    .filter(Boolean)
    .slice(0, 2);

  return (
    <article className="echo-card relative flex w-[230px] shrink-0 snap-start flex-col overflow-hidden rounded-xl transition hover:border-echo-accent/50">
      <button onClick={onDetails} className="relative text-start" aria-label={title}>
        <PosterTile item={item} width={230} height={280} className="w-full rounded-none rounded-t-xl" />
        <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-sm bg-card/85 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          <MediaTypeIcon type={item.mediaType} className="h-3 w-3" aria-hidden />
          {t(`media.${item.mediaType}`)}
        </span>
        <span className="echo-chip absolute end-2 top-2 !bg-card/90">{sourceChipLabel(item.provider)}</span>
      </button>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-1 text-sm font-semibold text-foreground">{title}</h3>
        <p className="font-mono text-[11px] text-muted-foreground">
          {item.releaseYear ?? "—"}
          {item.publicScore ? ` · ★ ${item.publicScore.toFixed(1)}` : ""}
          {item.contentRating ? ` · ${item.contentRating}` : ""}
        </p>
        <div className="flex flex-wrap gap-1">
          {item.genres.slice(0, 2).map((g) => (
            <Badge key={g} variant="secondary" className="text-[9px]">{tv(g)}</Badge>
          ))}
        </div>
        {/* explanation — always the real shared features */}
        <ul className="mt-0.5 flex flex-col gap-1">
          {reasonLine.map((line, i) => (
            <li key={i} className="flex items-start gap-1 break-words text-[11px] leading-snug text-echo-teal line-clamp-2">
              <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <div className="mt-auto flex flex-wrap gap-1 pt-1.5">
          <ActionBtn label={t("discover.addPlanned")} onClick={onPlanned} icon={<Plus className="h-3 w-3" />} primary />
          <ActionBtn label={t("discover.interested")} onClick={onInterested} icon={<ThumbsUp className="h-3 w-3" />} />
          <ActionBtn label={t("discover.notForMe")} onClick={onNotForMe} icon={<ThumbsDown className="h-3 w-3" />} />
          <ActionBtn label={t("discover.alreadyWatched")} onClick={onWatched} icon={<Check className="h-3 w-3" />} />
        </div>
      </div>
      {inLibrary && (
        <span className="absolute" data-in-library aria-hidden />
      )}
    </article>
  );
}

function ActionBtn({
  label,
  onClick,
  icon,
  primary,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[10px] font-medium transition",
        primary
          ? "border-echo-accent/50 bg-echo-accent/10 text-foreground hover:bg-echo-accent/20"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function ShelfSkeleton() {
  return (
    <div className="flex flex-col gap-2.5" aria-hidden>
      <div className="h-5 w-44 animate-pulse rounded bg-secondary/60" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="echo-card w-[210px] shrink-0">
            <div className="aspect-[3/4] w-full animate-pulse rounded-t-xl bg-secondary/50" />
            <div className="flex flex-col gap-2 p-3">
              <div className="h-3.5 w-3/4 animate-pulse rounded bg-secondary/60" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-secondary/40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GenreSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="echo-card w-[210px] shrink-0">
          <div className="aspect-[3/4] w-full animate-pulse rounded-t-xl bg-secondary/50" />
        </div>
      ))}
    </div>
  );
}
