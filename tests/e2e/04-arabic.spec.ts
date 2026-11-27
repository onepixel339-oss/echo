/**
 * E2E flow 4 — Arabic interface & RTL.
 *
 * Arabic is a first-class surface: switching must flip the document to
 * RTL, translate the chrome, keep flows working, and persist across
 * reloads.
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

async function switchToArabic(page: import("@playwright/test").Page): Promise<void> {
  await page.locator("nav").getByRole("button", { name: "Settings" }).click();
  const group = page.getByRole("radiogroup", { name: "Language" });
  await group.getByRole("radio", { name: "العربية" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
}

test("switching to Arabic flips the document to RTL and translates the chrome", async ({ page }) => {
  await switchToArabic(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  // nav chrome is translated
  await expect(page.locator("nav").getByRole("button", { name: "الخريطة" })).toBeVisible();
  await expect(page.locator("nav").getByRole("button", { name: "المكتبة" })).toBeVisible();
  await expect(page.locator("nav").getByRole("button", { name: "الإعدادات" })).toBeVisible();
});

test("the Arabic interface keeps the core flows working (search → add)", async ({ page }) => {
  await switchToArabic(page);
  // back to the map — its empty state is translated
  await page.locator("nav").getByRole("button", { name: "الخريطة" }).click();
  await expect(page.getByRole("heading", { name: "ورقة بيضاء" })).toBeVisible();
  // open the add dialog from the empty state (Arabic CTA)
  await page.getByRole("button", { name: "أضف العنوان الأول" }).click();
  await page.getByPlaceholder("ابحث في الكتالوج…").fill("cowboy");
  await expect(
    page
      .locator("dialog li, [role='dialog'] li")
      .filter({ hasText: "Cowboy Bebop" })
      .first(),
  ).toBeVisible({ timeout: 15_000 });
  // the Add button is translated
  await page
    .locator("dialog li, [role='dialog'] li")
    .filter({ hasText: "Cowboy Bebop" })
    .first()
    .getByRole("button", { name: "أضف" })
    .click();
  await closeDialog(page);
  await expect(page.getByText("عنوان واحد")).toBeVisible({ timeout: 15_000 });
});

test("switching back to English restores LTR and the English chrome", async ({ page }) => {
  await switchToArabic(page);
  await page.getByRole("radiogroup", { name: "اللغة" }).getByRole("radio", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("nav").getByRole("button", { name: "Library" })).toBeVisible();
});

test("the language choice persists across reloads", async ({ page }) => {
  await switchToArabic(page);
  await page.reload();
  await waitForApp(page);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("nav").getByRole("button", { name: "الخريطة" })).toBeVisible();
});
