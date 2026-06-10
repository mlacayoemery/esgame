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

The build is over its bundle budget (warns at ~995 KB vs the 500 KB initial budget in
`v2/angular.json`), and the heavy client op is GeoTIFF decode → SVG. Add **Lighthouse CI** to gate
bundle size + LCP/TBT regressions in CI; the Playwright suite (`v2/e2e`) can also assert
time-to-first-board-render.
