# ECHO — performance baseline (A1 capture)

Captured 2026-11-25T11:49:08.828Z by `scripts/perf-baseline.ts` on the Phase 1 branch.
Budgets are the plan §7.4 values; the numbers below are the measured
baselines each future change is compared against. Machine-class sandbox
hardware — treat absolute values as baselines, ratios as signal.

### 1. Build time (budget ≤ 180 s in CI)

| Build | Measured |
|---|---|
| `bun run build` (this machine) | 21.7 s |
### 2. First Load JS for / (budget ≤ 200 KB gzipped)

| Route | First Load JS (measured: gzip of every script the served page loads) |
|---|---|
| `/` | 454.7 KB |

### 3. Engine pipeline (bun, this machine — O(n²) similarity + clustering + layout)

| Library size | Similarity graph | Clusters | Layout | Full pipeline | Incremental add (recompute) |
|---|---|---|---|---|---|
| 100 titles | 32.2 ms | 23.5 ms | 46.1 ms | 101.8 ms | 86.3 ms |
| 250 titles | 106.3 ms | 6.7 ms | 215.0 ms | 327.9 ms | 255.5 ms |
| 500 titles | 335.3 ms | 9.4 ms | 628.6 ms | 973.3 ms | 1091.0 ms |

### 4. Hydrate-to-interactive at 500 seeded titles (Chromium headless)

| Metric | Measured | Budget |
|---|---|---|
| Hydrate-to-interactive (500 titles, best of 3) | 1237 ms | ≤ 1500 ms |

(all runs: 1359 ms, 1260 ms, 1237 ms; headless Chromium against the
e2e standalone server, machine-class sandbox hardware.)

### 5. Not yet measured at A1 (recorded honestly)

- Map interaction 60 fps at 500 nodes — needs rAF sampling in the map
  flow (scheduled with the A3 Lighthouse CI pass).
- Federated search first paint ≤ 1.5 s — needs the provider-latency
  harness (A3); the e2e flows already pin the functional contract.
