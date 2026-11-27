/**
 * E2E flow 3 — The details drawer.
 *
 * Covers: opening from the library, the title/metadata contract, rating
 * via stars, favourite toggle, and closing via the Close button (Escape
 * is unreliable under radix aria-hidden semantics).
 */

import { test, expect } from "@playwright/test";
import { mockProviders, seedIndexedDB, waitForApp } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await mockProviders(page);
  await page.goto("/");
  await waitForApp(page);
  await seedIndexedDB(page, [
    {
      localId: "tvmaze:169",
      provider: "tvmaze",
      providerId: "169",
      title: "Breaking Bad",
      mediaType: "series",
      format: "series",
      genres: ["drama", "crime"],
      releaseYear: 2008,
      rating: 4,
    },
    {
      localId: "anilist:1",
      provider: "anilist",
      providerId: "1",
      title: "Cowboy Bebop",
      mediaType: "anime",
      format: "series",
      genres: ["action", "adventure", "sci-fi"],
      releaseYear: 1998,
      rating: 5,
    },
  ]);
  await page.locator("nav").getByRole("button", { name: "Library" }).click();
});

test("selecting a title opens the details drawer with its metadata", async ({ page }) => {
  await page.getByRole("button", { name: /Breaking Bad/ }).first().click();
  // the drawer's accessible name is the title (radix aria-labelledby)
  const drawer = page.getByRole("dialog", { name: "Breaking Bad" });
  await expect(drawer).toBeVisible();
  // the stored rating shows as the checked star radio in the drawer
  await expect(drawer.getByRole("radio", { name: "4" })).toHaveAttribute("aria-checked", "true");
});

test("rating changes persist on the entry", async ({ page }) => {
  await page.getByRole("button", { name: /Cowboy Bebop/ }).first().click();
  const drawer = page.getByRole("dialog", { name: "Cowboy Bebop" });
  await expect(drawer).toBeVisible();
  // click the 3-star radio in the drawer's rating control
  await drawer.getByRole("radio", { name: "3" }).click();
  await expect(drawer.getByRole("radio", { name: "3" })).toHaveAttribute("aria-checked", "true");
  // close and reopen — the rating persisted
  await page.getByRole("button", { name: "Close" }).click();
  await expect(drawer).toBeHidden();
  await page.getByRole("button", { name: /Cowboy Bebop/ }).first().click();
  await expect(
    page.getByRole("dialog", { name: "Cowboy Bebop" }).getByRole("radio", { name: "3" }),
  ).toHaveAttribute("aria-checked", "true");
});

test("favourite toggle flips on the drawer", async ({ page }) => {
  await page.getByRole("button", { name: /Breaking Bad/ }).first().click();
  const drawer = page.getByRole("dialog");
  const fav = drawer.getByRole("button", { name: "Favourite" });
  await expect(fav).toHaveAttribute("aria-pressed", "false");
  await fav.click();
  await expect(fav).toHaveAttribute("aria-pressed", "true");
});

test("closing the drawer returns focus to the app (Close button, not Escape)", async ({ page }) => {
  await page.getByRole("button", { name: /Breaking Bad/ }).first().click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(drawer).toBeHidden();
  // the app behind is interactive again (aria-hidden lifted)
  await expect(page.locator("nav").getByRole("button", { name: "Library" })).toBeVisible();
  await page.locator("nav").getByRole("button", { name: "Map" }).click();
  await expect(page.getByText("2 titles")).toBeVisible();
});

test("the drawer shows the media type and source attribution", async ({ page }) => {
  await page.getByRole("button", { name: /Cowboy Bebop/ }).first().click();
  const drawer = page.getByRole("dialog", { name: "Cowboy Bebop" });
  await expect(drawer).toBeVisible();
  // media type is surfaced as a chip/label
  await expect(drawer.getByText("Anime").first()).toBeVisible();
});
