/**
 * ECHO — Settings: language, theme, content, data (export/import/clear),
 * privacy, credits, PWA install.
 */

"use client";

import React from "react";
import { Download, Upload, Trash2, ShieldCheck, Languages, Palette, Eye, Database, Info, Sparkles, Waypoints, ExternalLink, Gamepad2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/echo/i18n";
import { useEchoStore } from "@/lib/echo/store";
import { buildBundle, validateBundle, MAX_IMPORT_BYTES } from "@/lib/echo/exportimport";
import { MEDIA_TYPES, type AppSettings, type ContentVisibility, type MediaType } from "@/lib/echo/types";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { MediaTypeIcon } from "../bits";
import { rawgKeyConfigured } from "@/lib/echo/providers/rawg";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { catalogueSources } from "@/lib/echo/providers";

const APP_VERSION = "1.0.0-mvp";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function SettingsScreen() {
  const { t, lang, setLang } = useI18n();
  const { toast } = useToast();
  const settings = useEchoStore((s) => s.settings);
  const updateSettings = useEchoStore((s) => s.updateSettings);
  const clearAllData = useEchoStore((s) => s.clearAllData);
  const importBundle = useEchoStore((s) => s.importBundle);

  const [confirmClear, setConfirmClear] = React.useState(false);
  const [importPreview, setImportPreview] = React.useState<{ count: number; data: unknown } | null>(null);
  const [installEvent, setInstallEvent] = React.useState<BeforeInstallPromptEvent | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const set = (patch: Partial<AppSettings>) => void updateSettings(patch);

  const toggleInterest = (mt: MediaType) => {
    const interests = settings.interests.includes(mt)
      ? settings.interests.filter((x) => x !== mt)
      : [...settings.interests, mt];
    if (interests.length) void updateSettings({ interests });
  };

  const doExport = async () => {
    const state = useEchoStore.getState();
    const bundle = buildBundle({
      settings: {
        language: state.settings.language,
        interests: state.settings.interests,
        recencyWeight: state.settings.recencyWeight,
        mapLabels: state.settings.mapLabels,
        animations: state.settings.animations,
      },
      media: state.media,
      entries: state.entries,
      feedback: state.feedback,
    });
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `echo-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ description: t("toast.exported") });
  };

  const onImportFile = async (file: File) => {
    if (file.size > MAX_IMPORT_BYTES) {
      toast({ description: t("settings.importInvalid") });
      return;
    }
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const parsed = validateBundle(data);
      if (!parsed.ok) {
        toast({ description: t("settings.importInvalid") });
        return;
      }
      setImportPreview({ count: parsed.data.entries.length, data: parsed.data });
    } catch {
      toast({ description: t("settings.importInvalid") });
    }
  };

  const applyImport = async (mode: "merge" | "replace") => {
    if (!importPreview) return;
    const res = await importBundle(importPreview.data, mode);
    setImportPreview(null);
    if (res.ok) {
      toast({ description: t("settings.importDone", { n: res.count ?? 0 }) });
    } else {
      toast({ description: t("settings.importInvalid") });
    }
  };

  return (
    <div className="flex flex-col gap-5 px-4 pt-4 pb-8 md:px-8">
      {/* language */}
      <SettingsCard icon={<Languages className="h-4 w-4" aria-hidden />} title={t("settings.language")}>
        <div className="flex gap-1.5" role="radiogroup" aria-label={t("settings.language")}>
          <button
            onClick={() => setLang("en")}
            role="radio"
            aria-checked={lang === "en"}
            className={cn(
              "min-h-[44px] rounded-xl border px-5 py-2.5 text-sm transition",
              lang === "en" ? "border-echo-accent/60 bg-echo-accent/10" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            English
          </button>
          <button
            onClick={() => setLang("ar")}
            role="radio"
            aria-checked={lang === "ar"}
            className={cn(
              "min-h-[44px] rounded-xl border px-5 py-2.5 text-sm transition",
              lang === "ar" ? "border-echo-accent/60 bg-echo-accent/10" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            العربية
          </button>
        </div>
      </SettingsCard>

      {/* interests (mediums) */}
      <SettingsCard
        icon={<Waypoints className="h-4 w-4" aria-hidden />}
        title={t("settings.interests")}
        desc={t("settings.interests.sub")}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5" role="group">
          {MEDIA_TYPES.map((mt) => {
            const active = settings.interests.includes(mt);
            return (
              <button
                key={mt}
                onClick={() => toggleInterest(mt)}
                aria-pressed={active}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border p-3.5 transition",
                  active
                    ? "border-echo-accent/60 bg-echo-accent/8 text-foreground"
                    : "border-border text-muted-foreground hover:border-echo-accent/35 hover:text-foreground",
                )}
              >
                <MediaTypeIcon type={mt} className={cn("h-6 w-6", active && "text-echo-accent")} />
                <span className="text-xs font-medium">{t(`media.${mt}`)}</span>
              </button>
            );
          })}
        </div>
      </SettingsCard>

      {/* theme — one obsidian skin for now; Porcelain light lands later
          on the same tokens */}
      <SettingsCard icon={<Palette className="h-4 w-4" aria-hidden />} title={t("settings.theme")}>
        <div
          className="flex items-center gap-3 rounded-xl border border-echo-accent/40 bg-echo-accent/10 p-3"
          role="status"
        >
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border"
            style={{
              background:
                "linear-gradient(135deg, #1F2632 0%, #0A0D12 55%, #C85A34 130%)",
            }}
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground">
              {t("settings.theme.obsidian")}
            </span>
            <span className="block text-xs leading-relaxed text-muted-foreground">
              {t("settings.theme.obsidian.sub")}
            </span>
          </span>
          <span className="ms-auto flex items-center gap-1.5 text-[11px] font-semibold text-echo-accent">
            <span className="echo-dot" style={{ background: "var(--echo-accent)" }} aria-hidden />
          </span>
        </div>
      </SettingsCard>

      {/* content & maturity */}
      <SettingsCard icon={<Eye className="h-4 w-4" aria-hidden />} title={t("settings.content")} desc={t("settings.content.sub")}>
        <div className="flex flex-col gap-1.5" role="radiogroup" aria-label={t("settings.content")}>
          {(["safe", "moderate", "all"] as ContentVisibility[]).map((v) => (
            <label
              key={v}
              className={cn(
                "flex cursor-pointer flex-col gap-0.5 rounded-xl border px-3 py-2.5 transition",
                settings.contentVisibility === v
                  ? "border-echo-accent/60 bg-echo-accent/10"
                  : "border-border hover:border-echo-accent/30",
              )}
            >
              <span className="flex items-center gap-2.5 text-sm">
                <input
                  type="radio"
                  name="visibility"
                  checked={settings.contentVisibility === v}
                  onChange={() => set({ contentVisibility: v })}
                  className="h-4 w-4 accent-[var(--echo-accent)]"
                />
                {t(`settings.visibility.${v}`)}
              </span>
              <span className="ms-6 text-[11px] leading-relaxed text-muted-foreground">
                {t(`settings.visibility.${v}.sub`)}
              </span>
            </label>
          ))}
        </div>
        {/* provider-level exclusion status — always visible confirmation */}
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-echo-teal/25 bg-echo-teal/5 p-3 text-[11px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-echo-teal" aria-hidden />
          {t("settings.content.providers")}
        </p>
      </SettingsCard>

      {/* toggles */}
      <SettingsCard icon={<Sparkles className="h-4 w-4" aria-hidden />} title={t("settings.animations")}>
        <div className="flex flex-col gap-3">
          <ToggleRow
            label={t("settings.recency")}
            desc={t("settings.recency.sub")}
            checked={settings.recencyWeight}
            onChange={(v) => set({ recencyWeight: v })}
          />
          <ToggleRow
            label={t("settings.mapLabels")}
            checked={settings.mapLabels}
            onChange={(v) => set({ mapLabels: v })}
          />
          <ToggleRow
            label={t("settings.animations")}
            desc={t("settings.animations.sub")}
            checked={settings.animations}
            onChange={(v) => set({ animations: v })}
          />
        </div>
      </SettingsCard>

      {/* data */}
      <SettingsCard icon={<Database className="h-4 w-4" aria-hidden />} title={t("settings.data")}>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void doExport()} className="gap-2">
            <Download className="h-4 w-4" aria-hidden />
            {t("settings.export")}
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()} className="gap-2">
            <Upload className="h-4 w-4" aria-hidden />
            {t("settings.import")}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImportFile(f);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            onClick={() => setConfirmClear(true)}
            className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            {t("settings.clear")}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("settings.clear.sub")}</p>
      </SettingsCard>

      {/* PWA */}
      {installEvent && (
        <SettingsCard icon={<Sparkles className="h-4 w-4" aria-hidden />} title={t("settings.pwa")} desc={t("settings.pwa.sub")}>
          <Button
            onClick={() => {
              void installEvent.prompt().then(() => setInstallEvent(null));
            }}
            className=""
          >
            {t("settings.pwa")}
          </Button>
        </SettingsCard>
      )}

      {/* privacy */}
      <SettingsCard icon={<ShieldCheck className="h-4 w-4" aria-hidden />} title={t("settings.privacy")}>
        <p className="text-xs leading-relaxed text-muted-foreground">{t("settings.privacy.body")}</p>
      </SettingsCard>

      {/* data sources */}
      <SettingsCard icon={<Waypoints className="h-4 w-4" aria-hidden />} title={t("settings.sources")} desc={t("settings.sources.sub")}>
        {/* RAWG connection — built-in key, zero setup for every user */}
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-echo-teal/30 bg-echo-teal/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Gamepad2 className="h-4 w-4 text-echo-teal" aria-hidden />
            {t("settings.rawg.key")}
            <span
              className={cn(
                "echo-chip",
                rawgKeyConfigured() ? "text-echo-pine" : "text-echo-gold",
              )}
            >
              {rawgKeyConfigured() ? t("settings.rawg.builtin") : t("settings.rawg.off")}
            </span>
          </p>
        </div>
        <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
          {t("settings.rawg.key.sub")}
        </p>

        <ul className="flex flex-col gap-2">
          {catalogueSources().map((src) => (
            <li key={src.id} className="rounded-xl border border-border bg-secondary/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {src.label}
                  <span className="echo-chip ms-2">{src.serves}</span>
                </p>
                <a
                  href={src.canonical}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-echo-accent hover:underline"
                >
                  {t("settings.sources.visit")}
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{src.notice}</p>
            </li>
          ))}
          <li className="rounded-xl border border-dashed border-border p-3 text-xs leading-relaxed text-muted-foreground">
            {t("settings.credits.demo")}
          </li>
        </ul>
      </SettingsCard>

      {/* about */}
      <p className="px-1 text-center text-[11px] text-muted-foreground/60">
        ECHO · {t("settings.version")} {APP_VERSION} · {t("app.tagline")}
      </p>

      {/* clear confirm */}
      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent className="echo-card">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.clearConfirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("settings.clearConfirm.body")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("app.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/85"
              onClick={() => {
                void clearAllData();
                setConfirmClear(false);
              }}
            >
              {t("settings.clear")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* import preview */}
      <Dialog open={Boolean(importPreview)} onOpenChange={(v) => !v && setImportPreview(null)}>
        <DialogContent className="echo-card max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("settings.import")}</DialogTitle>
            <DialogDescription>
              {t("settings.importPreview", { n: importPreview?.count ?? 0 })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => void applyImport("merge")}>
              {t("settings.importMerge")}
            </Button>
            <Button
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => void applyImport("replace")}
            >
              {t("settings.importReplace")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SettingsCard({
  icon,
  title,
  desc,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="echo-card rounded-xl p-4 md:p-5" aria-label={title}>
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/70 text-echo-accent">
          {icon}
        </span>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {desc ? <p className="text-xs text-muted-foreground">{desc}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span>
        <span className="block text-sm text-foreground">{label}</span>
        {desc ? <span className="block text-xs text-muted-foreground">{desc}</span> : null}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}
