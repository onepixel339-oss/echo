import { defineConfig, devices } from "@playwright/test";

/**
 * ECHO — end-to-end configuration (A1 test spine).
 *
 * Runs against the PRODUCTION standalone build (next build → standalone
 * server), not the dev server, so the suite exercises the real bundle:
 * service worker, fonts, code splitting, everything. Port 3100 keeps it
 * clear of dev servers and the perf-baseline server (:3101).
 */

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "NODE_ENV=production PORT=3100 node .next/standalone/server.js",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
