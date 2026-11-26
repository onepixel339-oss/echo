/**
 * E2E flow 6 — Offline resilience & the service worker.
 *
 * The PWA contract: the SW registers and controls the page; once
 * controlled, an offline reload boots the cached shell with the library
 * intact; the offline indicator is honest; offline search falls back to
 * the labelled sample catalogue; and live search resumes after reconnect.
 */

import { test, expect, type Page } from "@playwright/test";
import {
  mockProviders,
  seedIndexedDB,
  waitForApp,
} from "./fixtures";

test.beforeEach(async ({ page }) => {
  await mockProviders(page);
  await page.goto("/");
  await waitForApp(page);
});

/** True when the service worker controls the active page. */
async function swControls(page: Page): Promise<boolean> {
  return page.evaluate(() => Boolean(navigator.serviceWorker.controller));
}

/** Wait for an ACTIVE service worker, then reload so the page is controlled. */
async function becomeControlled(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          navigator.serviceWorker.getRegistration().then((r) => (r?.active ? "active" : "none")),
        ),
      { timeout: 20_000 },
    )
    .toBe("active");
  await page.reload();
  await waitForApp(page);
  await expect.poll(() => swControls(page), { timeout: 15_000 }).toBe(true);
}

test("the service worker registers and (after one controlled navigation) controls the page", async ({ page }) => {
  const registered = await page.evaluate(() =>
    navigator.serviceWorker.getRegistration().then((r) => Boolean(r)),
  );
  expect(registered).toBe(true);
  await becomeControlled(page);
});

test("offline reload boots the cached shell with the library intact", async ({ page }) => {
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
  // the seed's reload must land on a CONTROLLED page before going offline
  await becomeControlled(page);

  await page.context().setOffline(true);
  await page.reload();
  // the shell boots from the SW cache — library, map and all
  await expect(page.getByText("1 title")).toBeVisible({ timeout: 20_000 });
  // node labels are canvas-drawn; the Library screen is the DOM proof
  await page.locator("nav").getByRole("button", { name: "Library" }).click();
  await expect(page.getByText("Cowboy Bebop")).toBeVisible();
});

test("offline: the indicator is shown in the navigation", async ({ page }) => {
  await becomeControlled(page);
  await page.context().setOffline(true);
  await page.reload();
  await waitForApp(page);
  // the offline pill renders inside the nav (desktop sidebar)
  await expect(page.locator("nav").getByText("Offline")).toBeVisible({ timeout: 20_000 });
});

test("offline: search falls back to the labelled sample catalogue with an honest notice", async ({ page }) => {
  // a real library + onboarding, so the map (not the welcome) is the surface
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
  await becomeControlled(page);
  await page.context().setOffline(true);

  // Library → Add title (the map is not empty, so the empty-state CTA is gone)
  await page.locator("nav").getByRole("button", { name: "Library" }).click();
  await page.getByRole("button", { name: "Add title", exact: true }).click();
  await page.getByPlaceholder("Search the catalogue…").fill("spirited");
  // the fallback notice is shown (honest about what is being displayed)
  await expect(
    page.getByText("You're offline — showing the labelled sample catalogue. Reconnect to search live catalogues."),
  ).toBeVisible({ timeout: 15_000 });
  // sample results are labelled with the Sample chip
  await expect(page.locator("dialog .echo-chip, [role='dialog'] .echo-chip").filter({ hasText: "Sample" }).first()).toBeVisible();
});

test("back online: live search works again", async ({ page }) => {
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
  await becomeControlled(page);
  await page.context().setOffline(true);
  await page.locator("nav").getByRole("button", { name: "Library" }).click();
  await page.getByRole("button", { name: "Add title", exact: true }).click();
  await page.context().setOffline(false);

  // online again → a live provider (mocked) answers with its source chip
  await page.getByPlaceholder("Search the catalogue…").fill("cowboy");
  await expect(
    page
      .locator("dialog li, [role='dialog'] li")
      .filter({ hasText: "Cowboy Bebop" })
      .first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page
      .locator("dialog li, [role='dialog'] li")
      .filter({ hasText: "Cowboy Bebop" })
      .first()
      .getByText("AniList", { exact: true }),
  ).toBeVisible();
  // and the offline pill is gone
  await expect(page.locator("nav").getByText("Offline")).toHaveCount(0);
});
