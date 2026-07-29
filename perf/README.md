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

## Frontend load (recommended next)

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

A perpetual warning is not a gate. Add **Lighthouse CI** to hold the line on bundle size
and LCP/TBT regressions; the Playwright suite (`v2/e2e`) can also assert
time-to-first-board-render.
