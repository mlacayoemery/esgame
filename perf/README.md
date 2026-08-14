# Performance testing

## Backend load — `calc-load.js` (k6)

Load-tests the calculation backend (`calcUrl`), which is the likely bottleneck under classroom use
because R/Plumber serves requests single-threaded. Use it to find how many concurrent players one
replica sustains, then size the K8s `replicas` / HPA accordingly.

```sh
# bring up the calculator (e.g. the esgame-dynamic stack), then:
k6 run -e CALC_URL=http://localhost:8000/esgame perf/calc-load.js

# or against a kind cluster, through the ingress, the way ingress-test.sh reaches it:
k6 run -e CALC_URL=http://127.0.0.1:8880/esgame -e CALC_HOST=esgame-calculation.local \
       perf/calc-load.js
```

**It runs weekly in CI now** — `.github/workflows/cluster.yml`, after the browser round-trip,
against the live cluster that job already builds. That is the only place it *can* run: it needs a
calculator behind an ingress. Before that it had been executed by hand exactly once, on
2026-08-06. The run posts its numbers to the job summary every time, including when it fails.

**Measured 2026-08-06, first run ever.** A round takes 12.9–28.2s and rounds do not overlap —
Plumber is single-threaded, so a second concurrent submission queues. **One replica sustains
about one concurrent player**, and a class of N students pressing *Next Level* together waits
roughly N × 15s for the last of them. Size `replicas` from that, not from a latency target.

`VUS` now defaults to **2**, not 20. At 20 the queue alone is about five minutes and every
request times out, which measures the queue rather than the server. Raise it deliberately, and
raise `TIMEOUT` with it — it must exceed a *queued* round or a slow request is recorded as an
error the server never saw. That was the original defect here: a 30s timeout and a `p(95)<3000`
threshold, neither of which any real round has ever satisfied, so the test could not pass at any
concurrency.

- `CALC_URL` — the calculation endpoint (default `http://localhost:8000`). Note the **path**: the
  route is `/esgame`, and posting to the bare origin gets a 404 that reads as a broken backend.
- `CALC_HOST` — vhost to send as the `Host` header, for reaching it through an ingress. Unset by
  default. The `.local` names do not resolve, and putting them in `/etc/hosts` is exactly what the
  browser harness avoids.
- `VUS` — concurrent students to ramp to (default `2`).
- `FIELDS` — allocation size (default `812` = the 28×29 board).
- `TIMEOUT` — per-request timeout (default `180s`). Must exceed `VUS` × round time.
- `GRACEFUL` — how long a stage waits for rounds already in flight (defaults to `TIMEOUT`).
- `P95_MS` — p95 latency ceiling. **Unset by default: no latency threshold is registered.**
- `ERROR_RATE` — allowed error rate (default `0.01`).

**`calc_errors` is the gate; latency is recorded, not thresholded.** A round either comes back 200
with a `results[]` or it does not, and that means the same thing everywhere. Round *time* does not:

| measured | machine | rounds | min | max | median |
|---|---|---|---|---|---|
| 2026-08-06 | workstation | 7 | 12.9s | 28.2s | 14.0s |
| 2026-08-14 | another, loaded | 12 over 3 runs | 27.1s | 89.0s | 36.5–70s |

Both were healthy backends returning five correct scores, at the same `VUS=2`. Note the last
column: the median moved by 2× *between runs on one machine*. The old default of `p(95)<60000`
failed the second machine outright — 8 of 8 checks passed, `calc_errors` 0.00%, k6 exited 99. That
is the original 3s/30s defect in a milder form, so the default is gone rather than re-guessed. Set
`P95_MS` from a baseline you measured on the machine you are gating, once you have more than one
run. `TIMEOUT` is the real upper bound in the meantime: a round that exceeds it fails as an error,
which *does* trip the gate.

Raise `VUS` (and `TIMEOUT` with it) to find the per-replica ceiling.

### What replicas buy — measured 2026-08-14

Eight runs, live cluster, `calc_errors` 0.00% throughout. At a fixed offered load of `VUS=4`:

| replicas | rounds done | median | max | throughput |
|---|---|---|---|---|
| 1 | 7, 8, 7 | ~70s | 87–117s | 2.31–2.72/min |
| 2 | 11 | 41.2s | 50.2s | 4.71/min |
| 3 | 11 | 26.5s | 63.6s | 5.41/min |

**Read the median and rounds-done columns, not throughput.** `iterations.rate` divides by
wall-clock including ramp-up and drain, and the drain is longer for slower configurations, so it
understates throughput and understates it most at one replica. The median falling 70s → 41s → 27s
at unchanged offered load is the clean signal.

The **second** replica is worth the most; the third cuts latency further without completing more
rounds.

### It is not GeoServer — tested, same day the guess was made

GeoServer looked like the shared limit: one instance, `cpu: "1"`, five coverages published per
round. Measured from cgroup v2 `cpu.stat` inside the pods during a load run at three replicas:

| offered load | GeoServer | each calculation pod (limit 2) | rounds |
|---|---|---|---|
| VUS=4 | **0.11** cores of 1 | 0.65 / 0.73 / 0.71 | 9 |
| VUS=8 | **0.07** cores of 1 | 0.52 / 0.93 / 0.40 | 14 |

GeoServer never exceeded 11% of its single core. Nothing else is saturated either — ~1.9–2.1 cores
of the 6 those pods may use. **No CPU limit is being reached anywhere, so raising one buys
nothing.**

Two things this does show:

* **Doubling the load completed more rounds** (9 → 14). There was headroom the VUS=4 sweep couldn't
  reveal, so the 1 → 2 → 3 table above measures what replicas do *at that offered load*, not their
  ceiling.
* **Per-pod CPU is uneven** — 0.40 against 0.93 cores in one run. That's the shape of clients being
  pinned to upstream pods by connection reuse rather than spread across them, the same effect
  already recorded for plot fetches, where `Connection: close` turned an 11-of-12 result into
  16-of-30. If replicas scale sub-linearly here, that's the next thing to test, and it's a
  load-balancing question rather than a capacity one.

No metrics-server in the kind cluster, so this reads `usage_usec` from `/sys/fs/cgroup/cpu.stat`
before and after a run and divides by elapsed wall time — average cores actually used. Watch the
units: `date +%s%6N` on this host emits **nanoseconds**, not microseconds, and the first version of
this reported a 37-hour window.

Sweeping load against a **single** replica: `VUS=1` → 1.91/min at a 22.3s median, `VUS=2` →
2.89/min at 35.5s, `VUS=4` → ~2.5/min at ~70s. **One replica saturates near two concurrent
players** — past that, latency grows and throughput does not.

Two reasons these are conservative. `FIELDS` defaults to **812** but the browser posts **465**; at
465 one replica does 2.89/min at a 59.7s median, so a real round is 10–25% cheaper than the table.
And this was a single-node kind cluster on a 12-core workstation with every pod sharing those
cores.

A first attempt at this table concluded that replicas bought *nothing* — 2.46, 2.24, 2.40/min for
1, 2, 3. That run had a Playwright suite competing for the same cores (load average 5.5–7.3) while
the calculation pod is capped at `cpu: "2"`, so three replicas wanted 6 of 12 cores that were not
free. Re-run on a quiet machine it reversed completely. **Check `/proc/loadavg` before believing a
capacity measurement taken on a workstation.**

**Clean up afterwards when running locally.** Each iteration creates a GeoServer workspace by
design (`game_id` is per-VU-per-iteration), so a long run leaves state behind. CI does not need
this — it deletes the whole cluster two steps later.

```sh
PW=$(kubectl get secret esgame-geoserver-admin -o jsonpath='{.data.password}' | base64 -d)
curl -s -u "admin:$PW" -H 'Host: esgame-geoserver.local' \
  http://127.0.0.1:8880/geoserver/rest/workspaces.json |
  python3 -c 'import sys,json; [print(w["name"]) for w in json.load(sys.stdin)["workspaces"]["workspace"] if "k6-" in w["name"]]' |
  while read -r w; do
    curl -s -X DELETE -u "admin:$PW" -H 'Host: esgame-geoserver.local' \
      "http://127.0.0.1:8880/geoserver/rest/workspaces/$w?recurse=true"
  done
```

Install k6: https://k6.io/docs/get-started/installation/

## Frontend load — Lighthouse CI

The production build is **within** its `initial` budget. Measured on Angular 22.0.8
(`ng build --configuration production`):

| Entry-point file | Size |
|---|---|
| `main-*.js` | 610,307 B |
| `styles-*.css` | 105,750 B |
| `polyfills-*.js` | 35,784 B |
| **initial total** | **751,842 B** |

The budgets in `v2/angular.json` are `maximumWarning: 1mb` / `maximumError: 2mb`, and
Angular reports them in decimal units (1 mb = 1,000,000 bytes). The build emitted the
warning on every run until the two non-game routes were made lazy:

| Change | initial total |
|---|---|
| (before) | 1,106,956 B |
| `/configurator` lazy | 976,723 B |
| `/config` lazy | 817,134 B |
| `@angular/animations` dropped | **751,842 B** |

a 355,114 B reduction (−32%). There is now ~248 kB of headroom under the warning.

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

## Client render — `v2/e2e/render-timing.spec.ts` (Playwright)

Lighthouse gates the **build**. It stops looking once the page has loaded, and the heavy client op
— decoding five GeoTIFFs into 466-hexagon SVG boards — happens entirely after that. This spec
covers the gap, and runs on **every PR** with the rest of the e2e suite.

**The gate is a count, not a clock.** Each coverage URL must be fetched exactly once per round.
That is true or false on any machine at any load, and it is the shape most client performance
regressions actually take — a board re-decoded, or a TIFF re-fetched, changes an integer.

**The timings are printed and deliberately not asserted.** A ceiling was written and then removed
once it was measured. Same machine, same build, same commit:

| | first render | decode after the round |
|---|---|---|
| spec run alone | 3.0–3.4s | 0.5–0.9s |
| in the full e2e suite | 11.4s | 0.9s |

A **3.4× swing from Playwright's own concurrency**, before any CI runner is involved. Any ceiling
tight enough to mean something fails on a busy runner; one loose enough to survive asserts nothing
that a hang does not already trigger — and the hang is already covered, because `fieldsSettle`
throws `hexagon count never settled at >= N; last saw M`, which says how far the render got rather
than just that a number was exceeded.

Recorded on a developer machine, 2026-08-14: **3262 hexagons across 7 boards** on first render,
**5592 across 12** after a round. Compare A/B in one sitting, never against a different day.

One trap worth knowing if you extend this. Measuring "when did rendering finish" by waiting for
stillness needs a floor: the first version returned **0 hexagons in 0.8s**, because 0 is perfectly
still before Angular renders anything, and a detector watching only for stillness cannot tell
"has not started" from "has finished".
