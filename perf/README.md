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

The production build is **within** its `initial` budget. Measured on Angular 22.0.8
(`ng build --configuration production`):

| Entry-point file | Size |
|---|---|
| `main-*.js` | 835,862 B |
| `styles-*.css` | 105,077 B |
| `polyfills-*.js` | 35,784 B |
| **initial total** | **976,723 B** |

The budgets in `v2/angular.json` are `maximumWarning: 1mb` / `maximumError: 2mb`, and
Angular reports them in decimal units (1 mb = 1,000,000 bytes). The build emitted the
warning on every run until `/configurator` was made lazy — that moved 130,233 B out of
the entry point (1,106,956 → 976,723) and the warning stopped.

That headroom is only ~23 kB, so the budget is now a live gate rather than background
noise: the next thing added to the eager graph will trip it.

The heavy client op is GeoTIFF decode → SVG.

A perpetual warning is not a gate, so **Lighthouse CI** (`v2/lighthouserc.json`) is what
actually fails a regression. It runs in CI after the e2e step and locally with:

```sh
cd v2 && npm run lhci        # builds are reused; needs CHROME_PATH if chrome isn't on PATH
```

It serves the production build through `e2e/serve.mjs` (the same SPA fallback as the
container's nginx), runs Lighthouse 3× under the `desktop` preset, and asserts:

| Assertion | Budget | Measured |
|---|---|---|
| `resource-summary:script:size` | 1,000,000 B | 938,017 B |
| `resource-summary:stylesheet:size` | 120,000 B | 105,159 B |
| `resource-summary:font:size` | 125,000 B | 108,429 B |
| `resource-summary:total:size` | 1,380,000 B | 1,294,040 B |
| `categories:performance` | ≥ 0.80 | 0.83 |
| `largest-contentful-paint` | ≤ 2500 ms | ~1,790 ms |
| `total-blocking-time` | ≤ 300 ms | ~175 ms |
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
~1.8 MB off the build output. Route-level lazy loading came next: `/configurator` is an authoring tool, not on the
path to the game, and the only consumer of MatStepper / MatInput / MatCheckbox /
MatSlider. Moving it behind `loadChildren` took 130,233 B out of the entry point.

The remaining levers, roughly by size: Angular Material is still ~29% of `main`, and
nine of its ten modules are genuinely used by eagerly-loaded components;
`@angular/animations` is ~63 kB and only present because `app.module.ts` imports
`BrowserAnimationsModule` (see the dependency review).

The Playwright suite (`v2/e2e`) can also assert time-to-first-board-render.
