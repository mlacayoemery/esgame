# Performance testing

## Backend load — `calc-load.js` (k6)

Load-tests the calculation backend (`calcUrl`), which is the likely bottleneck under classroom use
because R/Plumber serves requests single-threaded. Use it to find how many concurrent players one
replica sustains, then size the K8s `replicas` / HPA accordingly.

```sh
# bring up the calculator (e.g. the esgame-dynamic stack), then:
k6 run -e CALC_URL=http://localhost:8000 -e VUS=20 perf/calc-load.js
```

- `CALC_URL` — the calculation endpoint (default `http://localhost:8000`).
- `VUS` — concurrent students to ramp to (default `20`).
- `FIELDS` — allocation size (default `812` = the 28×29 board).

Thresholds (fail the run if breached): error rate `< 1%`, p95 latency `< 3s`. Raise `VUS` until they
break to find the per-replica ceiling. Install k6: https://k6.io/docs/get-started/installation/

## Frontend load — Lighthouse CI

The production build exceeds its `initial` bundle budget on every run. Measured on
Angular 22.0.8 (`ng build --configuration production`):

| Entry-point file | Size |
|---|---|
| `main-*.js` | 966,182 B (943 KiB) |
| `styles-*.css` | 104,990 B (103 KiB) |
| `polyfills-*.js` | 35,784 B (35 KiB) |
| **initial total** | **1,106,956 B — 1.11 MB** |

The budgets in `v2/angular.json` are `maximumWarning: 1mb` / `maximumError: 2mb`, so the
build **warns** by ~107 kB but does not fail — the 2 MB error threshold is what would
actually break CI. (Angular reports budgets in decimal units: 1 mb = 1,000,000 bytes.)

`main` is 87% of the payload, and the heavy client op is GeoTIFF decode → SVG.

A perpetual warning is not a gate, so **Lighthouse CI** (`v2/lighthouserc.json`) is what
actually fails a regression. It runs in CI after the e2e step and locally with:

```sh
cd v2 && npm run lhci        # builds are reused; needs CHROME_PATH if chrome isn't on PATH
```

It serves the production build through `e2e/serve.mjs` (the same SPA fallback as the
container's nginx), runs Lighthouse 3× under the `desktop` preset, and asserts:

| Assertion | Budget | Measured |
|---|---|---|
| `resource-summary:script:size` | 1,100,000 B | 1,002,152 B |
| `resource-summary:stylesheet:size` | 120,000 B | 105,159 B |
| `resource-summary:font:size` | **125,000 B** | **108,429 B** |
| `resource-summary:total:size` | **1,450,000 B** | **1,358,202 B** |
| `categories:performance` | ≥ 0.80 | 0.82 |
| `largest-contentful-paint` | ≤ 2500 ms | ~1,757 ms |
| `total-blocking-time` | ≤ 300 ms | ~206 ms |
| `cumulative-layout-shift` | ≤ 0.1 | 0 |

The timing figures above were taken on a loaded desktop. They move a lot with machine
load — three consecutive runs scored 57 / 82 / 85 while a Docker build was running — so
**only compare timings A/B in the same sitting**, never against a number recorded on a
different day. The byte figures are stable to the byte.

Byte budgets are tight (~10% headroom) because transfer sizes are deterministic. The
timing budgets are the Core Web Vitals "good" thresholds, left loose on purpose — a
shared CI runner is noisy, and flaky perf gates get ignored. Reports upload as the
`lighthouse-reports` artifact when the gate fails.

Fonts were the first thing fixed here: `Roboto-Regular` was served as a 164 kB TTF and
the other eleven Roboto weights were shipped but never referenced. Converting the one
used face to WOFF2 cut it 62% (168,260 → 63,608 B) and deleting the unused weights took
~1.8 MB off the build output. `main` is now ~74% of the transfer, so route-level lazy
loading is the next lever.

The Playwright suite (`v2/e2e`) can also assert time-to-first-board-render.
