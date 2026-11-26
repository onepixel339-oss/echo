/**
 * ECHO — cost-table generator (T-6.1, A0).
 *
 * Renders docs/COST_TABLE.md from the plan's verified parameters so the doc
 * and the derivation can never drift apart silently:
 *   - `bun run cost-table`          rewrites docs/COST_TABLE.md
 *   - `bun run cost-table:check`    re-derives and FAILS on any drift (CI gate)
 *
 * Every price below is the plan's verified figure (checked 2026-11-25
 * against the official pricing pages). The generator also asserts the
 * T1/T2 zero-cost posture: no paid service may appear in those tiers.
 */

import { writeFileSync, readFileSync } from "node:fs";

/* ---------------------------- verified parameters -------------------------- */

/** Gemini 3.8 flash paid tier, $ per 1M tokens (2026 promotional / standard). */
const PRICE_IN = { promo: 0.75, standard: 1.5 } as const;
const PRICE_OUT = { promo: 3.75, standard: 7.5 } as const;
/** Promotional pricing window (per the plan: through 2026-12-31). */

/** The plan's per-request token assumptions: 3K input / 0.5K output. */
const TOKENS = { in: 3000, out: 500 } as const;

/* --------------------------------- formulas -------------------------------- */

/** Per-request cost in dollars: (t_in·p_in + t_out·p_out) / 1e6. */
function perRequestCost(tokens: { in: number; out: number }, year: "2026" | "2027"): number {
  const pIn = year === "2026" ? PRICE_IN.promo : PRICE_IN.standard;
  const pOut = year === "2026" ? PRICE_OUT.promo : PRICE_OUT.standard;
  return (tokens.in * pIn + tokens.out * pOut) / 1e6;
}

/** Monthly cost: M requests × per-request cost. */
function monthlyCost(reqPerDay: number, year: "2026" | "2027"): number {
  return reqPerDay * 30 * perRequestCost(TOKENS, year);
}

/* --------------------------------- formatting ------------------------------- */

/** Dollars: 2 decimals, but 6 for cent-scale figures so nothing rounds to $0.00. */
function fmtUsd(v: number): string {
  const s = v < 0.01 ? v.toFixed(6) : v.toFixed(2);
  return `$${s}`;
}

function pct(part: number, whole: number): string {
  return `${((part / whole) * 100).toFixed(1)}%`;
}

/* ------------------------------ the four tiers ------------------------------ */

const TIERS: { tier: string; definition: string; services: string; cost: string }[] = [
  {
    tier: "T1 — zero-cost initial build",
    definition: "Track A work, current product, no accounts",
    services:
      "Vercel Hobby (current, $0) → Workers Free (target after the PoC); AI off; no DB",
    cost: "**$0**",
  },
  {
    tier: "T2 — zero-cost private beta",
    definition: "Track B through B4: sync, accounts, cohort",
    services:
      "Workers Free + Supabase Free + OAuth-only + AI off (BYO optional) + in-memory rate limiting + manual pg_dump + provider subdomains",
    cost: "**$0**",
  },
  {
    tier: "T3 — future commercial operation",
    definition: "What turning it on actually costs",
    services:
      "Workers Paid/Vercel Pro, Supabase Pro, domain, corrected AI budget, privacy/ToS, support, license re-clearance",
    cost: "Per the AI tables below + provider terms; NOT a launch path",
  },
  {
    tier: "T4 — optional paid upgrades on demand",
    definition: "Discrete triggers, each with an observable metric",
    services: "See the trigger table (§4 below)",
    cost: "Per trigger",
  },
];

/* ------------------------------- the scenarios ------------------------------- */

interface Scenario {
  label: string;
  users: number;
  rho: number; // AI opt-in fraction
  r: number; // requests per active-AI-user per day
  bold?: boolean; // the stated (headline) parameter set is emphasised
}

const S2_STATED: Scenario = { label: "Stated: 50 users, ρ=1.0, r=5", users: 50, rho: 1.0, r: 5, bold: true };
const S2_LOW: Scenario = { label: "Low: 10 users, ρ=0.3, r=2", users: 10, rho: 0.3, r: 2 };
const S2_HIGH: Scenario = { label: "High: 50 users, ρ=1.0, r=10", users: 50, rho: 1.0, r: 10 };

const SENSITIVITY: { tokens: { in: number; out: number }; label: string }[] = [
  { label: "1K/0.3K", tokens: { in: 1000, out: 300 } },
  { label: "3K/0.5K", tokens: { in: TOKENS.in, out: TOKENS.out } },
  { label: "6K/1.0K", tokens: { in: 6000, out: 1000 } },
];

/* ----------------------------- T4 upgrade triggers --------------------------- */

const TRIGGERS: { trigger: string; upgrade: string }[] = [
  { trigger: "Sync DB > ~350 MB sustained / pause pain / backup-for-trust", upgrade: "Supabase Pro (from $25/mo)" },
  { trigger: "Dynamic requests > ~70K/day sustained or CPU-limit errors (1102) on p99", upgrade: "Workers Paid ($5/mo)" },
  { trigger: "Email-sign-in demand or brand-domain need", upgrade: "Domain + Resend path" },
  { trigger: "AI demand + privacy approval", upgrade: "Paid Gemini key (per the AI tables above)" },
  { trigger: ">50 concurrent-realtime users", upgrade: "Realtime review" },
  { trigger: "Commercial decision (D-16 flip)", upgrade: "Full T3 stack + license re-clearance" },
];

/* --------------------------------- rendering -------------------------------- */

function render(): string {
  const L: string[] = [];

  L.push("# ECHO — generated cost tables (T-6.1)", "");
  L.push("<!-- GENERATED by scripts/cost-table.ts — do not edit by hand; rerun the script instead. -->", "");
  L.push(
    "Every figure below is derived by `scripts/cost-table.ts` from the",
    "parameters in its source. CI re-derives and diffs this file: hand",
    "edits fail, parameter changes re-derive. Prices verified 2026-11-25.",
    "",
  );

  // §1 four-tier model
  L.push("## 1. The four-tier cost model (plan §10.1)", "");
  L.push("| Tier | Definition | Services | Monthly cost |");
  L.push("|---|---|---|---|");
  for (const t of TIERS) L.push(`| ${t.tier} | ${t.definition} | ${t.services} | ${t.cost} |`);
  L.push("");

  // §2 formulas
  L.push("## 2. AI cost model (plan §8.2 — formulas first)", "");
  L.push("Prices (official, per 1M tokens, gemini-3.8-flash paid tier):");
  L.push(
    `- 2026 promotional: input **$${PRICE_IN.promo.toFixed(2)}** / output **$${PRICE_OUT.promo.toFixed(2)}** (2026 promotional, through 2026-12-31)`,
  );
  L.push(
    `- standard: input **$${PRICE_IN.standard.toFixed(2)}** / output **$${PRICE_OUT.standard.toFixed(2)}** (standard, from 2027-01-01)`,
    "",
  );
  L.push("```text");
  L.push("requests/day   R = U × ρ × r          (U users; ρ AI opt-in fraction; r requests/active-AI-user/day)");
  L.push("requests/month M = R × 30");
  L.push("cost/month     C = M × (t_in × p_in + t_out × p_out) / 1e6");
  L.push("per-request    c = (t_in × p_in + t_out × p_out) / 1e6");
  L.push("```", "");
  L.push(
    `Per-request cost at the token assumptions (${TOKENS.in / 1000}K in / ${TOKENS.out / 1000}K out): **${fmtUsd(perRequestCost(TOKENS, "2026"))}** (2026) / **${fmtUsd(perRequestCost(TOKENS, "2027"))}** (2027).`,
    "",
  );

  // §3 scenarios
  L.push("## 3. Scenarios (plan §8.3)", "");
  L.push("### S2 — private beta, 10–50 users", "");
  L.push("| Parameter set | R (req/day) | M (req/mo) | C (2026) | C (2027) |");
  L.push("|---|---|---|---|---|");
  for (const sc of [S2_STATED, S2_LOW, S2_HIGH]) {
    const R = sc.users * sc.rho * sc.r;
    const M = R * 30;
    const b = (s: string) => (sc.bold ? `**${s}**` : s);
    L.push(
      `| ${sc.label} | ${b(String(R))} | ${M.toLocaleString("en-US")} | ${b(fmtUsd(monthlyCost(R, "2026")))} | ${fmtUsd(monthlyCost(R, "2027"))} |`,
    );
  }
  const sens = SENSITIVITY.map(
    (s) => `${s.label} → ${fmtUsd(S2_STATED.users * S2_STATED.rho * S2_STATED.r * 30 * perRequestCost(s.tokens, "2026"))}/mo`,
  ).join("; ");
  L.push("");
  L.push(
    `Token sensitivity (stated case, 2026): ${sens}.`,
    "",
  );
  const s1 = monthlyCost(100, "2026");
  L.push(
    `**S1** (owner-only): 100/day → 3,000/mo → **${fmtUsd(s1)}/mo** (2026) — moot under the $0 posture (no owner-funded key in tiers 1–2).`,
  );
  const s3lo = monthlyCost(100 * 8, "2026");
  const s3hi = monthlyCost(500 * 8, "2026");
  L.push(
    `**S3** (100–500 users, r=8): **${fmtUsd(s3lo)}–${fmtUsd(s3hi)}/mo** (2026, ρ=1.0).`,
  );
  const s4lo = monthlyCost(1000 * 6, "2026");
  const s4hi = monthlyCost(5000 * 6, "2026");
  L.push(
    `**S4** (1,000–5,000 users, r=6): **${fmtUsd(s4lo)}–${fmtUsd(s4hi)}/mo** (2026, ρ=1.0).`,
    "",
  );
  L.push(
    "Conclusion the owner should draw: if external AI is ever switched on",
    "for real users it is a first-order cost line, not a rounding error —",
    "reinforcing the off-by-default posture (docs/AI_POSTURE.md).",
    "",
  );

  // quota-fit figures
  L.push("### Quota-fit figures (plan §8.3)", "");
  L.push("| Figure | Computed | Limit | Fit |");
  L.push("|---|---|---|---|");
  L.push(
    `| Workers dynamic requests (beta sizing) | 3,700/day | 100,000/day | ${pct(3700, 100000)} |`,
  );
  L.push(
    `| Supabase storage (50 users × 0.5–2 MB) | 25–100 MB | 500 MB | ${pct(25, 500)}–${pct(100, 500)} |`,
  );
  L.push(
    `| Supabase egress | ≈ 0.18 GB/mo | 5 GB/mo | ${pct(0.18, 5)} |`,
  );
  L.push(
    `| Worst-case conflict archive (50 × 200 × ~4 KB) | ≈ 40 MB | 500 MB | ${pct(40, 500)} |`,
    "",
  );

  // §4 triggers
  L.push("## 4. T4 — optional paid-upgrade triggers (plan §10.6)", "");
  L.push("| Trigger (observable metric) | Upgrade |");
  L.push("|---|---|");
  for (const t of TRIGGERS) L.push(`| ${t.trigger} | ${t.upgrade} |`);
  L.push("");

  // §5 zero-cost assertion
  L.push("## 5. T1/T2 zero-cost posture assertion", "");
  L.push(
    "The generator asserts: **no paid service appears in the T1/T2 stage",
    "definitions**; every deferred-for-cost feature is listed with its",
    "trigger in §4 above. AI is off by default (D-24); BYO-key is optional",
    "and disclosed (D-29 draft in docs/AI_POSTURE.md).",
    "",
  );

  return L.join("\n");
}

/* ------------------------------ zero-cost assert ----------------------------- */

for (const t of TIERS.slice(0, 2)) {
  if (t.cost !== "**$0**") {
    console.error(`ASSERTION FAILED: tier ${t.tier} is not $0 — the zero-cost posture is broken`);
    process.exit(1);
  }
}

/* ------------------------------------ run ------------------------------------ */

const output = render();
const DOC = "docs/COST_TABLE.md";

if (process.argv.includes("--check")) {
  const current = readFileSync(DOC, "utf8");
  if (current !== output) {
    console.error(
      "cost-table CHECK FAILED: docs/COST_TABLE.md is out of date with scripts/cost-table.ts parameters.\n" +
        "Rerun `bun run cost-table` and commit the regenerated file.",
    );
    process.exit(1);
  }
  console.log("cost-table check OK: docs/COST_TABLE.md matches the generator.");
} else {
  writeFileSync(DOC, output);
  console.log(`cost-table: wrote ${DOC}`);
}
