/**
 * ECHO — secret scanner (A0).
 *
 * Scans every git-tracked (and newly added) text file for credential
 * patterns: provider API keys, OAuth tokens, private keys, and long
 * high-entropy literals in secret-shaped assignments. No network access.
 *
 *   bun run secret-scan            scan the tree (CI gate)
 *   bun run secret-scan --self-test  plant a fake secret in a temp file and
 *                                    prove the scanner catches it
 *
 * Allowlist: literals that are INTENTIONALLY present (each with its reason)
 * — e.g. the historical RAWG key string the regression test pins as removed.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

/* --------------------------------- patterns --------------------------------- */

interface Pattern {
  name: string;
  re: RegExp;
}

const PATTERNS: Pattern[] = [
  { name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub token", re: /\b(?:ghp|gho|ghu|ghs)_[A-Za-z0-9]{36}\b/ },
  { name: "GitHub fine-grained PAT", re: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/ },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "Slack token", re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/ },
  { name: "OpenAI-style key", re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: "private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: "JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./ },
  { name: "32-hex literal", re: /["']([0-9a-fA-F]{32})["']/ },
  { name: "secret-shaped assignment", re: /\b(?:api[_-]?key|client[_-]?secret|secret|access[_-]?token|password)\b["']?\s*[:=]\s*["'][^"'\s]{20,}["']/i },
];

/** Intentionally-present literals, each with its reason. */
const ALLOWLIST: { literal: string; reason: string }[] = [
  {
    // The RAWG key that was removed from the client bundle in Phase 1; the
    // registry regression test pins its exact literal as REMOVED — it is a
    // dead credential kept only as a "must never come back" guard.
    literal: "891771e3867e44fba54f16d4b411b1b3",
    reason: "historical RAWG key literal in the removal regression test (registry.test.ts)",
  },
];

const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svgz",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".zip", ".gz", ".tar", ".tgz", ".zst",
  ".mp3", ".mp4", ".webm", ".wav", ".pdf",
  ".lock", ".sum", ".bin", ".exe", ".wasm",
]);

/* ---------------------------------- scanning --------------------------------- */

interface Finding {
  file: string;
  line: number;
  name: string;
  excerpt: string;
}

function scanTree(root: string): Finding[] {
  let files: string[] = [];
  try {
    files = execSync("git ls-files --cached --others --exclude-standard", {
      cwd: root,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    console.error("secret-scan: not a git work tree — refusing to guess the file set");
    process.exit(1);
  }

  const findings: Finding[] = [];
  for (const file of files) {
    if (BINARY_EXT.has(file.slice(file.lastIndexOf(".")))) continue;
    let text: string;
    try {
      text = readFileSync(`${root}/${file}`, "utf8");
    } catch {
      continue;
    }
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      for (const { name, re } of PATTERNS) {
        for (const m of line.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"))) {
          const hit = m[0];
          const literal = m[1] ?? m[0];
          if (ALLOWLIST.some((a) => literal.includes(a.literal) || a.literal === literal)) continue;
          findings.push({
            file,
            line: i + 1,
            name,
            excerpt: hit.slice(0, 48),
          });
        }
      }
    });
  }
  return findings;
}

/* --------------------------------- self-test --------------------------------- */

/** Join parts so this scanner's OWN source never contains detectable literals. */
const join = (...parts: string[]) => parts.join("");

function selfTest(): boolean {
  // planted INSIDE the work tree as an untracked file, exactly like a real
  // leaked secret would sit — then removed again
  const file = ".secret-scan-selftest-fixture.ts";
  writeFileSync(
    file,
    [
      "// self-test fixture: planted credentials that MUST be detected",
      `const planted = "${join("AKIA", "IOSFODNN7EXAMPLE")}";`,
      `const openai = "${join("sk-", "abcdefghijklmnopqrstuvwxyz1234567890")}";`,
      `const pem = '-----BEGIN RSA ${join("PRIVATE", " KEY-----")}';`,
      `const hexish = "${join("deadbeefdeadbeef", "deadbeefdeadbeef")}";`,
      "export const key = planted;",
    ].join("\n"),
  );
  const findings = scanTree(".").filter((f) => f.file === file);
  unlinkSync(file);
  const names = new Set(findings.map((f) => f.name));
  const expected = ["AWS access key", "OpenAI-style key", "private key block", "32-hex literal"];
  const missing = expected.filter((e) => !names.has(e));
  if (missing.length) {
    console.error(`secret-scan SELF-TEST FAILED: did not detect: ${missing.join(", ")}`);
    return false;
  }
  console.log("secret-scan self-test OK: all planted credentials were detected.");
  return true;
}

/* ------------------------------------ run ------------------------------------ */

if (process.argv.includes("--self-test")) {
  process.exit(selfTest() ? 0 : 1);
}

const findings = scanTree(".");
if (findings.length) {
  console.error(`secret-scan FAILED: ${findings.length} suspicious literal(s):`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  [${f.name}]  ${f.excerpt}`);
  }
  console.error(
    "\nIf a finding is intentional, add it to ALLOWLIST in scripts/secret-scan.ts with a reason.",
  );
  process.exit(1);
}
console.log("secret-scan OK: no credential patterns found in the tree.");
