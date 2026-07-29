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
| `main-*.js` | 610,307 B |
| `styles-*.css` | 105,750 B |
| `polyfills-*.js` | 35,784 B |
| **initial total** | **751,841 B** |

The budgets in `v2/angular.json` are `maximumWarning: 1mb` / `maximumError: 2mb`, and
Angular reports them in decimal units (1 mb = 1,000,000 bytes). The build emitted the
warning on every run until the two non-game routes were made lazy:

| Change | initial total |
|---|---|
| (before) | 1,106,956 B |
| `/configurator` lazy | 976,723 B |
| `/config` lazy | 817,134 B |
| `@angular/animations` dropped | **751,841 B** |

a 355,115 B reduction (−32%). There is now ~248 kB of headroom under the warning.

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
| Assertion | Budget | Measured | Aggregation |
|---|---|---|---|
| `resource-summary:script:size` | 700,000 B | 648,333 B | all runs |
| `resource-summary:stylesheet:size` | 120,000 B | 105,159 B | all runs |
| `resource-summary:font:size` | 150,000 B | 130,139 B | all runs |
| `resource-summary:third-party:size` | **0 B** | **0 B** | all runs |
| `resource-summary:total:size` | 1,080,000 B | 1,001,871 B | all runs |
| `categories:performance` | ≥ 0.70 | ~0.87 | median |
| `categories:accessibility` | **= 1.00** | 100 | all runs |
| `categories:seo` | ≥ 0.95 | 100 | all runs |
| `categories:best-practices` | ≥ 0.95 | 100 | all runs |
| `largest-contentful-paint` | ≤ 2500 ms | ~1,550 ms | median |
| `total-blocking-time` | ≤ 500 ms | ~160 ms | median |
| `cumulative-layout-shift` | ≤ 0.1 | 0 | median |

The timing figures above were taken on a loaded desktop. They move a lot with machine
load — three consecutive runs scored 57 / 82 / 85 while a Docker build was running — so
**only compare timings A/B in the same sitting**, never against a number recorded on a
different day. The byte figures are stable to the byte.

**The byte budgets are the gate.** Transfer sizes are byte-identical across runs, so they
are held tight (~8-10% headroom) and will catch any real regression.

The **accessibility / SEO / best-practices** scores are also byte-stable — identical on
every run — so they are asserted tightly too. Accessibility is now **100 with no failing
audits**, so its assertion is pinned at exactly 1.00: any new component that introduces
a violation fails CI rather than quietly eroding the score.

Getting there needed a brand change. `$color-primary` was `#1e90ff`, which is 3.24:1
against white — under the 4.5:1 WCAG AA threshold — as both link text and a
white-on-blue button background. It is now `#0b5ed7` at **5.84:1**.

**The timing assertions are a smoke alarm, not a gate.** They aggregate on the *median*
of the three runs, because a single noisy run is otherwise enough to fail the build —
observed here: 88 / 90 / 69 in one sitting, and 77 / 86 / 85 for the same code moments
earlier. Thresholds are deliberately far below the observed median so only a genuine
collapse trips them. Reports upload as the `lighthouse-reports` artifact when the gate
fails.

**`third-party:size` is asserted at 0 on purpose.** The app used to fetch Roboto and
Material Icons from Google Fonts and two production-type icons from raw.githubusercontent
— so the "self-contained" container image could not render correctly without reaching the
internet, on exactly the offline and filtered school networks this game is played on.
Everything is now vendored, and this assertion fails the build if any external asset
creeps back in.

Fonts were the first thing fixed here: `Roboto-Regular` was served as a 164 kB TTF and
the other eleven Roboto weights were shipped but never referenced. Converting the one
used face to WOFF2 cut it 62% (168,260 → 63,608 B) and deleting the unused weights took
~1.8 MB off the build output. Route-level lazy loading came next. Neither `/configurator` (an authoring tool) nor
`/config` (the start page) is on the path a player takes — the game is the default route
— and between them they owned every use of MatStepper, MatInput, MatCheckbox, MatSlider,
MatSelect and MatFormField. Moving both behind `loadChildren` took 289,822 B out of the
entry point.

Self-hosting then added the 300/500 Roboto weights and a subset Material Icons face
(356,840 B TTF → 23,336 B WOFF2, four ligatures). Fonts went 108,429 → 130,139 B but
third-party went 43,168 → 0, so total transfer is marginally *lower* than before and the
app makes no external request at all.

`@angular/animations` went next: Angular Material 22 no longer needs it, so dropping
`BrowserAnimationsModule` took another 65,988 B off `main`. Most Material motion is
CSS-based and survives — the built output goes from 110 `transition`/`animation`/
`@keyframes` declarations to 102.

The main remaining lever is Angular Material itself, still ~29% of `main`, with nine of
its ten modules genuinely used by eagerly-loaded components. Going further means
component-level changes rather than configuration.

The Playwright suite (`v2/e2e`) can also assert time-to-first-board-render.
