/**
 * E2E flow 5 — Export → clear → import round-trip.
 *
 * The data-ownership contract: a backup exports everything the app stores,
 * clearing wipes it (and honestly returns to onboarding), and importing
 * restores the library. Also pins NF-1: the v3 settings fields ship in the
 * bundle.
 */

import { test, expect } from "@playwright/test";
import { mockProviders, seedIndexedDB, waitForApp } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await mockProviders(page);
  await page.goto("/");
  await waitForApp(page);
});

test("export produces a valid ECHO v3 bundle with settings and entries", async ({ page }) => {
  await seedIndexedDB(page, [
    {
      localId: "anilist:1",
      provider: "anilist",
      providerId: "1",
      title: "Cowboy Bebop",
      mediaType: "anime",
      format: "series",
      genres: ["action"],
      releaseYear: 1998,
      rating: 5,
    },
    {
      localId: "tvmaze:169",
      provider: "tvmaze",
      providerId: "169",
      title: "Breaking Bad",
      mediaType: "series",
      format: "series",
      genres: ["drama"],
      releaseYear: 2008,
      rating: 4,
    },
  ]);
  await page.locator("nav").getByRole("button", { name: "Settings" }).click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export backup (JSON)" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^echo-backup-\d{4}-\d{2}-\d{2}\.json$/);

  const path = await download.path();
  const bundle = JSON.parse((await import("node:fs")).readFileSync(path!, "utf8")) as Record<string, unknown>;
  expect(bundle.app).toBe("ECHO");
  expect(bundle.schemaVersion).toBe(3);
  expect(bundle.entries).toHaveLength(2);
  expect(bundle.media).toHaveLength(2);
  // NF-1: the v3 settings fields ship in the export
  const settings = bundle.settings as Record<string, unknown>;
  expect(settings.contentVisibility).toBe("moderate");
  expect(typeof settings.providerToggles).toBeDefined();
});

test("clear all data wipes the library and returns to onboarding", async ({ page }) => {
  await seedIndexedDB(page, [
    {
      localId: "anilist:1",
      provider: "anilist",
      providerId: "1",
      title: "Cowboy Bebop",
      mediaType: "anime",
      format: "series",
      genres: ["action"],
      rating: 5,
    },
  ]);
  await page.locator("nav").getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Delete all local ECHO data" }).click();
  // confirmation dialog (destructive action is guarded)
  await expect(page.getByText("Delete everything?")).toBeVisible();
  await page.getByRole("button", { name: "Delete all local ECHO data" }).click();
  // cleared → onboarding runs again by design
  await expect(
    page.getByRole("heading", { name: "Everything you watch, play & read — on one map." }),
  ).toBeVisible({ timeout: 15_000 });
});

test("importing an exported bundle with Replace restores the library", async ({ page }) => {
  const items = [
    {
      localId: "anilist:1",
      provider: "anilist",
      providerId: "1",
      title: "Cowboy Bebop",
      mediaType: "anime" as const,
      format: "series" as const,
      genres: ["action"],
      releaseYear: 1998,
      rating: 5,
    },
    {
      localId: "tvmaze:169",
      provider: "tvmaze",
      providerId: "169",
      title: "Breaking Bad",
      mediaType: "series" as const,
      format: "series" as const,
      genres: ["drama"],
      releaseYear: 2008,
      rating: 4,
    },
  ];
  await seedIndexedDB(page, items);
  await page.locator("nav").getByRole("button", { name: "Settings" }).click();

  // export → clear → confirm, so the device is genuinely empty
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export backup (JSON)" }).click(),
  ]);
  const exportPath = await download.path();
  await page.getByRole("button", { name: "Delete all local ECHO data" }).click();
  await page.getByRole("button", { name: "Delete all local ECHO data" }).click();
  await expect(
    page.getByRole("heading", { name: "Everything you watch, play & read — on one map." }),
  ).toBeVisible({ timeout: 15_000 });

  // import the saved bundle (fresh onboarding → enter the app first)
  await page.getByRole("button", { name: "Start my map" }).click();
  await page.getByRole("button", { name: "Anime" }).first().click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip — start empty" }).click();
  await page.getByRole("button", { name: "Enter my map" }).click();
  await page.locator("nav").getByRole("button", { name: "Settings" }).click();
  await page.setInputFiles('input[type="file"]', exportPath!);
  await expect(page.getByText("Backup contains 2 titles.")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Replace", exact: true }).click();
  await expect(page.getByText("Imported 2 titles.", { exact: true })).toBeVisible({ timeout: 15_000 });

  // the library is fully restored
  await page.locator("nav").getByRole("button", { name: "Library" }).click();
  await expect(page.getByText("2 titles, stored only on this device.")).toBeVisible();
  await expect(page.getByText("Cowboy Bebop")).toBeVisible();
  await expect(page.getByText("Breaking Bad")).toBeVisible();
});

test("merge import of the same bundle does not duplicate titles", async ({ page }) => {
  const items = [
    {
      localId: "anilist:1",
      provider: "anilist",
      providerId: "1",
      title: "Cowboy Bebop",
      mediaType: "anime" as const,
      format: "series" as const,
      genres: ["action"],
      rating: 5,
    },
  ];
  await seedIndexedDB(page, items);
  await page.locator("nav").getByRole("button", { name: "Settings" }).click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export backup (JSON)" }).click(),
  ]);
  const exportPath = await download.path();

  // merge the same bundle into the same library → nothing new is added
  // (entries dedupe by id), and the library still holds exactly one title
  await page.setInputFiles('input[type="file"]', exportPath!);
  await expect(page.getByText("Backup contains 1 titles.")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Merge" }).click();
  await expect(page.getByText("Imported 0 titles.", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.locator("nav").getByRole("button", { name: "Library" }).click();
  await expect(page.getByText("1 title, stored only on this device.")).toBeVisible();
});
