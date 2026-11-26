/**
 * E2E flow 1 — Onboarding (A1 test spine).
 *
 * Covers: the welcome screen and its privacy promise, the guided
 * interests→seed→reveal path, live (mocked) seeding with ratings, and the
 * demo-mode round trip. Providers are mocked at the network layer.
 */

import { test, expect } from "@playwright/test";
import {
  expectWelcome,
  mockProviders,
  waitForApp,
} from "./fixtures";

test.beforeEach(async ({ page }) => {
  await mockProviders(page);
  await page.goto("/");
  await waitForApp(page);
  await expectWelcome(page);
});

test("welcome screen states the local-first privacy promise and both entry paths", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Start my map" })).toBeVisible();
  await expect(page.getByRole("button", { name: "See a sample map" })).toBeVisible();
  await expect(page.getByText("No account. No cloud. Everything stays on this device.")).toBeVisible();
});

test("guided path: interests → seed → reveal completes to the first (empty) map", async ({ page }) => {
  await page.getByRole("button", { name: "Start my map" }).click();
  // interests: defaults are pre-selected; verify the toggles and continue
  const anime = page.getByRole("button", { name: "Anime" }).first();
  await expect(anime).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  // seed step: skip entirely
  await page.getByRole("button", { name: "Skip — start empty" }).click();
  // reveal: the first-map summary
  await expect(page.getByRole("heading", { name: "Your first map" })).toBeVisible();
  await page.getByRole("button", { name: "Enter my map" }).click();
  // the empty map state
  await expect(page.getByRole("heading", { name: "A blank sheet" })).toBeVisible();
});

test("seeded path: search (mocked providers) → pick → rate → the map carries the title", async ({ page }) => {
  await page.getByRole("button", { name: "Start my map" }).click();
  // defaults already include anime — continue straight through
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  // path A: pick from the (live, mocked) catalogue
  await page.getByRole("button", { name: /Pick titles you like/ }).click();
  const search = page.getByPlaceholder("Search films, series, anime, games & books…");
  await search.fill("cowboy");
  // 350 ms debounce + provider round-trip → the result card appears
  await expect(page.getByRole("button", { name: /Cowboy Bebop/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /Cowboy Bebop/ }).click();
  // picked → rating stars appear; rate 5
  await page.getByRole("radio", { name: "5" }).click();
  await expect(page.getByText("1 selected")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Enter my map" }).click();
  // the map stats line now counts exactly one title (singular form)
  await expect(page.getByText("1 title")).toBeVisible();
});

test("demo mode: sample map from welcome, labelled banner, exit returns to the real empty map", async ({ page }) => {
  await page.getByRole("button", { name: "See a sample map" }).click();
  // the demo banner is explicit that nothing touches the real library
  await expect(
    page.getByText("You are exploring the sample map. Nothing here touches your real library."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Exit demo" })).toBeVisible();
  await expect(page.getByText("Sample map", { exact: true })).toBeVisible();
  // exiting discards the demo state (keep=false) and returns to the real map
  await page.getByRole("button", { name: "Exit demo" }).click();
  await expect(page.getByRole("heading", { name: "A blank sheet" })).toBeVisible();
});
