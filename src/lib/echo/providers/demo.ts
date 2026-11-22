/**
 * ECHO — Demo catalogue provider.
 * Clearly labelled offline sample data (spec rule 8): never presented as
 * live search results; UI marks results with a "Demo catalogue" tag.
 */

import { DEMO_CATALOGUE, demoToMediaItem } from "../data/demoCatalogue";
import type { MediaItem } from "../types";
import type { CatalogueProvider, ProviderSearchResult, SearchFilters } from "./types";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export class DemoProvider implements CatalogueProvider {
  id = "echo-demo";
  label = "ECHO demo catalogue";

  capabilities = {
    anime: true,
    manga: true,
    movies: true,
    series: true,
    games: true,
    books: true,
    comics: true,
    contentRatings: true, // approximate
    relatedTitles: false,
  };

  isConfigured(): boolean {
    return true;
  }

  private all(): MediaItem[] {
    return DEMO_CATALOGUE.map(demoToMediaItem);
  }

  async search(query: string, filters?: SearchFilters): Promise<ProviderSearchResult[]> {
    const q = normalize(query);
    if (!q) return [];
    const types = filters?.mediaTypes;
    const scored: { item: MediaItem; score: number }[] = [];
    for (const item of this.all()) {
      if (types?.length && !types.includes(item.mediaType)) continue;
      const title = normalize(item.title);
      const titleAr = item.titleAr ? normalize(item.titleAr) : "";
      let score = 0;
      if (title === q || titleAr === q) score = 100;
      else if (title.startsWith(q) || titleAr.startsWith(q)) score = 80;
      else if (title.includes(q) || titleAr.includes(q)) score = 60;
      else if (normalize(item.genres.join(" ")).includes(q)) score = 25;
      else if (normalize(item.tags.join(" ")).includes(q)) score = 20;
      else if (normalize(item.synopsis ?? "").includes(q)) score = 10;
      if (score > 0) scored.push({ item, score });
    }
    scored.sort((a, b) => b.score - a.score || (a.item.title < b.item.title ? -1 : 1));
    return scored.slice(0, filters?.limit ?? 12).map((s) => ({
      item: s.item,
      sourceLabel: "Sample",
    }));
  }

  async getTitle(providerId: string): Promise<MediaItem | null> {
    return this.all().find((m) => m.providerId === providerId) ?? null;
  }

  getAttribution() {
    return {
      name: "ECHO demo catalogue",
      notice: "Offline sample data for development. Not live search results.",
    };
  }
}
