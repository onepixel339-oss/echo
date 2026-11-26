/**
 * ECHO — version consistency check (A0).
 *
 * The version number must agree across the three places it lives:
 *   1. package.json "version"
 *   2. the Settings about line (APP_VERSION in components/echo/screens/SettingsScreen.tsx)
 *   3. CHANGELOG.md latest "## [x.y.z]" heading (the ledger)
 *
 * Exits non-zero on any mismatch (CI gate). Run: bun run version-check
 */

import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version?: string };
const pkgVersion = pkg.version;

const settings = readFileSync(
  "components/echo/screens/SettingsScreen.tsx",
  "utf8",
);
const m = settings.match(/APP_VERSION\s*=\s*"([^"]+)"/);
const appVersion = m?.[1];

const changelog = readFileSync("CHANGELOG.md", "utf8");
const cm = changelog.match(/^## \[([^\]]+)\]/m);
const changelogVersion = cm?.[1];

const failures: string[] = [];
if (!pkgVersion) failures.push("package.json has no version field");
if (!appVersion) failures.push("APP_VERSION not found in SettingsScreen.tsx");
if (!changelogVersion) failures.push("no '## [x.y.z]' heading found in CHANGELOG.md");

if (pkgVersion && appVersion && pkgVersion !== appVersion) {
  failures.push(`package.json (${pkgVersion}) != Settings APP_VERSION (${appVersion})`);
}
if (pkgVersion && changelogVersion && pkgVersion !== changelogVersion) {
  failures.push(`package.json (${pkgVersion}) != CHANGELOG latest (${changelogVersion})`);
}

if (failures.length) {
  console.error("version-check FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`version-check OK: ${pkgVersion} (package.json = Settings = CHANGELOG)`);
