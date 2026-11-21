/**
 * ECHO — Add title dialog: live multi-source catalogue search (AniList,
 * TVMaze, IMDb) with per-result source chips and a manual fallback.
 * Offline: falls back to the labelled sample catalogue automatically.
 */

"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, Check, PenLine, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/echo/i18n";
import { useEchoStore } from "@/lib/echo/store";
import { searchCatalogue, type CatalogueSearchOutcome } from "@/lib/echo/providers";
import type { MediaItem, MediaType } from "@/lib/echo/types";
import { MediaTypeIcon, PosterTile } from "./bits";
import { useToast } from "@/hooks/use-toast";
import { makeId } from "@/lib/echo/ids";
import { cn } from "@/lib/utils";

export function providerChipLabel(provider: string): string {
  switch (provider) {
    case "anilist":
      return "AniList";
    case "kitsu":
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
    case "manual":
      return "You";
    default:
      return provider;
  }
}

export function AddTitleDialog() {
  const { t, tv, lang } = useI18n();
  const { toast } = useToast();
  const open = useEchoStore((s) => s.addDialogOpen);
  const setOpen = useEchoStore((s) => s.setAddDialog);
  const addTitle = useEchoStore((s) => s.addTitle);
  const interests = useEchoStore((s) => s.settings.interests);
  const entries = useEchoStore((s) => s.entries);

  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<CatalogueSearchOutcome | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [searched, setSearched] = React.useState(false);
  const [manualOpen, setManualOpen] = React.useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const libraryIds = React.useMemo(() => new Set(entries.map((e) => e.mediaLocalId)), [entries]);

  const runSearch = React.useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults(null);
        setSearched(false);
        return;
      }
      setSearching(true);
      try {
        const res = await searchCatalogue(q, {
          mediaTypes: interests.length ? interests : undefined,
          limit: 8,
        });
        setResults(res);
        setSearched(true);
      } catch {
        setResults({ results: [], sources: [], usedFallback: false, failed: ["all"] });
        setSearched(true);
      } finally {
        setSearching(false);
      }
    },
    [interests],
  );

  const onQueryChange = (v: string) => {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(v), 350);
  };

  const closeDialog = () => {
    setOpen(false);
    setQuery("");
    setResults(null);
    setSearched(false);
    setManualOpen(false);
  };

  const items = results?.results ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : closeDialog())}>
      <DialogContent className="echo-card max-h-[88dvh] max-w-lg overflow-y-auto echo-scroll">
        <DialogHeader>
          <DialogTitle className="echo-display">{t("add.title")}</DialogTitle>
          <DialogDescription>{t("add.liveNotice")}</DialogDescription>
        </DialogHeader>

        {!manualOpen ? (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                autoFocus
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder={t("add.searchPlaceholder")}
                className="h-11 bg-background ps-9"
                aria-label={t("add.searchPlaceholder")}
              />
              {searching && (
                <Loader2 className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
              )}
            </div>

            {results?.usedFallback && (
              <p className="text-[11px] text-echo-gold">{t("add.fallbackNotice")}</p>
            )}
            {searched && !searching && items.length === 0 && query.trim() && !results?.usedFallback && (
              <p className="rounded-lg border border-dashed border-border px-3 py-2 text-center text-xs text-muted-foreground">
                {t("add.noResults", { q: query })}
                <br />
                {t("add.noResults.sub")}
              </p>
            )}

            <ul className="flex flex-col gap-1.5" aria-live="polite">
              {items.map(({ item, sourceLabel }) => {
                const inLibrary = libraryIds.has(item.localId);
                return (
                  <li key={item.localId}>
                    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-2 transition hover:border-echo-accent/40">
                      <PosterTile item={item} width={36} height={54} className="shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                          <span className="min-w-0 flex-1 truncate">
                            {lang === "ar" && item.titleAr ? item.titleAr : item.title}
                          </span>
                          <MediaTypeIcon type={item.mediaType} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="echo-chip shrink-0">{sourceLabel}</span>
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {[item.releaseYear, t(`media.${item.mediaType}`), item.contentRating]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
                          {item.genres.slice(0, 3).map((g) => tv(g)).join(" · ")}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={inLibrary ? "outline" : "default"}
                        disabled={inLibrary}
                        onClick={() =>
                          void addTitle(item, { status: "planned" }).then(() =>
                            toast({ description: t("toast.added") }),
                          )
                        }
                        className="shrink-0"
                      >
                        {inLibrary ? (
                          <>
                            <Check className="me-1 h-3.5 w-3.5" aria-hidden />
                            {t("add.inLibrary")}
                          </>
                        ) : (
                          <>
                            <Plus className="me-1 h-3.5 w-3.5" aria-hidden />
                            {t("add.add")}
                          </>
                        )}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* live sources note */}
            {results && results.sources.length > 0 && !results.usedFallback && (
              <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                {t("add.sourcesNote", { sources: results.sources.join(" · ") })}
              </p>
            )}

            <Button variant="outline" onClick={() => setManualOpen(true)} className="gap-2">
              <PenLine className="h-4 w-4" aria-hidden />
              {t("add.manualFallback")}
            </Button>
          </>
        ) : (
          <ManualEntryForm
            onDone={(item) => {
              void addTitle(item, { status: "planned" }).then(async (entry) => {
                toast({ description: t("toast.added") });
                closeDialog();
                // background: attach the real catalogue record (poster, genres,
                // synopsis) when a confident match exists
                const linked = await useEchoStore.getState().autoLinkEntry(entry.id);
                if (linked) {
                  toast({
                    description: t("toast.autoLinked", {
                      title: lang === "ar" && linked.titleAr ? linked.titleAr : linked.title,
                      source: providerChipLabel(linked.provider),
                    }),
                  });
                }
              });
            }}
            onCancel={() => setManualOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ManualEntryForm({
  onDone,
  onCancel,
}: {
  onDone: (item: MediaItem) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = React.useState("");
  const [type, setType] = React.useState<MediaType>("movie");
  const [year, setYear] = React.useState("");
  const [genres, setGenres] = React.useState("");
  const [synopsis, setSynopsis] = React.useState("");

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const name = title.trim();
    if (!name) return;
    const y = parseInt(year, 10);
    const item: MediaItem = {
      localId: `manual:${makeId("m")}`,
      provider: "manual",
      providerId: name,
      mediaType: type,
      format: type === "movie" ? "film" : type === "game" ? "game" : type === "book" ? "book" : "series",
      title: name,
      releaseYear: y >= 1900 && y <= 2100 ? y : undefined,
      genres: genres
        .split(",")
        .map((g) => g.trim().toLowerCase().replace(/\s+/g, "-"))
        .filter(Boolean)
        .slice(0, 5),
      tags: [],
      synopsis: synopsis.trim() || undefined,
      sourceAttribution: "Added manually by you",
    };
    onDone(item);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div>
        <label htmlFor="m-title" className="text-xs font-medium text-muted-foreground">
          {t("manual.name")} *
        </label>
        <Input
          id="m-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("manual.namePlaceholder")}
          className="mt-1 bg-background"
          required
          maxLength={120}
        />
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label htmlFor="m-type" className="text-xs font-medium text-muted-foreground">
            {t("manual.type")} *
          </label>
          <div className="mt-1 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={t("manual.type")}>
            {(["anime", "movie", "series", "game", "book"] as const).map((mt) => (
              <button
                key={mt}
                type="button"
                role="radio"
                aria-checked={type === mt}
                onClick={() => setType(mt)}
                className={cn(
                  "flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition",
                  type === mt
                    ? "border-echo-accent/60 bg-echo-accent/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`media.${mt}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="w-28">
          <label htmlFor="m-year" className="text-xs font-medium text-muted-foreground">
            {t("manual.year")}
          </label>
          <Input
            id="m-year"
            value={year}
            onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            placeholder="1998"
            className="mt-1 bg-background"
          />
        </div>
      </div>
      <div>
        <label htmlFor="m-genres" className="text-xs font-medium text-muted-foreground">
          {t("manual.genres")}
        </label>
        <Input
          id="m-genres"
          value={genres}
          onChange={(e) => setGenres(e.target.value)}
          placeholder="sci-fi, drama"
          className="mt-1 bg-background"
          maxLength={120}
        />
      </div>
      <div>
        <label htmlFor="m-synopsis" className="text-xs font-medium text-muted-foreground">
          {t("manual.synopsis")}
        </label>
        <Textarea
          id="m-synopsis"
          value={synopsis}
          onChange={(e) => setSynopsis(e.target.value)}
          className="mt-1 min-h-[70px] bg-background"
          maxLength={400}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("app.cancel")}
        </Button>
        <Button type="submit">{t("manual.add")}</Button>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground/80">{t("manual.autoLinkHint")}</p>
    </form>
  );
}
