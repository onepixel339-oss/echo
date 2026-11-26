/**
 * E2E flow 2 — Federated search → add → rate → map updates.
 *
 * Providers are mocked at the network layer (AniList GraphQL, TVMaze,
 * Open Library, Wikidata + graceful-empty secondaries). The transparency
 * contract — every result labelled with its source — is asserted here.
 */

import { test, expect } from "@playwright/test";
import {
  addTitleFromSearch,
  closeDialog,
  mockProviders,
  openAddDialog,
  searchCatalogueFor,
  skipOnboarding,
  waitForApp,
} from "./fixtures";

test.beforeEach(async ({ page }) => {
  await mockProviders(page);
  await page.goto("/");
  await waitForApp(page);
  await skipOnboarding(page);
});

test("search returns labelled results from the (mocked) live providers", async ({ page }) => {
  await openAddDialog(page);
  await searchCatalogueFor(page, "breaking bad");
  // TVMaze row is present and carries its source chip
  const row = page
    .locator("dialog li, [role='dialog'] li")
    .filter({ hasText: "Breaking Bad" })
    .first();
  await expect(row).toBeVisible();
  await expect(row.getByText("TVMaze", { exact: true })).toBeVisible();
});

test("every result is source-labelled across providers (anime + books)", async ({ page }) => {
  await openAddDialog(page);
  // anime source
  await searchCatalogueFor(page, "cowboy");
  const animeRow = page
    .locator("dialog li, [role='dialog'] li")
    .filter({ hasText: "Cowboy Bebop" })
    .first();
  await expect(animeRow).toBeVisible();
  await expect(animeRow.getByText("AniList", { exact: true })).toBeVisible();
  // books source
  await searchCatalogueFor(page, "little prince");
  const bookRow = page
    .locator("dialog li, [role='dialog'] li")
    .filter({ hasText: "The Little Prince" })
    .first();
  await expect(bookRow).toBeVisible();
  await expect(bookRow.getByText("Open Library", { exact: true })).toBeVisible();
});

test("adding a title from search updates the library and the map stats", async ({ page }) => {
  await openAddDialog(page);
  await searchCatalogueFor(page, "cowboy");
  await addTitleFromSearch(page, "Cowboy Bebop");
  await closeDialog(page);
  // the map (formerly empty) now counts exactly one title
  await expect(page.getByText("1 title")).toBeVisible({ timeout: 15_000 });
  // and the library screen lists it
  await page.locator("nav").getByRole("button", { name: "Library" }).click();
  await expect(page.getByText("1 title, stored only on this device.")).toBeVisible();
  await expect(page.getByText("Cowboy Bebop")).toBeVisible();
});
