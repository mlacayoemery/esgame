# esgame v2 — Architecture, Deployment & Customization

This document describes how the v2 (Angular) game is structured, how it is built and
deployed, how to customize it **without forking**, and how the `places` deployment
re-converges onto this single upstream.

## Overview

- **v1** (legacy): a vanilla-JS game at the repo root. Archived to `/v1/` on the published site.
- **v2** (current): an Angular 15 SPA in [`v2/`](../v2). Two modes:
  - **Grid / "static"** (`#/static-game`) — scores entirely client-side; needs **no backend**.
  - **SVG / "dynamic"** (`#/dynamic-game`) — POSTs to a calculation backend (`calcUrl`, an R
    Plumber API) for consequence maps; needs the Docker/K8s stack.
- Routing is **hash-based** (`useHash: true`) — no server rewrite rules required.

## Runtime configuration (the key design point)

Game configuration is **loaded at runtime, not bundled at build time**. This is what lets a
single build / container image serve any deployment.

- [`v2/src/assets/config.json`](../v2/src/assets/config.json) — deployment config, fetched at
  startup by [`ConfigService`](../v2/src/app/services/config.service.ts) via an `APP_INITIALIZER`:
  ```json
  {
    "staticDataUrl": "assets/dataGridExample.json",
    "dynamicDataUrl": "assets/data.json",
    "calcUrl": ""
  }
  ```
  - `*DataUrl` — which game-settings JSON to load per mode (override to point at custom data).
  - `calcUrl` — calculation backend; **empty string = fully client-side** (the canonical Pages build).
- The game-settings JSON (`data.json` / `dataGridExample.json`) is fetched, then passed to the
  existing `GameService.loadSettings()`. **Asset URLs inside these files must be relative**
  (`assets/...` or `./assets/...`), never absolute (`/assets/...`), so they resolve under a
  subpath base-href.

**To customize a deployment, you change config + data — never the source.** Mount or overwrite
`assets/config.json` and the referenced data/TIFFs.

## Deployment

### GitHub Pages (canonical, client-side grid game)
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) builds with
`--base-href /esgame/`, archives v1 under `/v1/`, adds an SPA `404.html`, and deploys via the
GitHub Pages Action. Served at `https://<owner>.github.io/esgame/`. Requires repo
**Settings → Pages → Source = "GitHub Actions"**. (No custom domain / `CNAME`.)

### Docker (full stack, incl. dynamic mode)
[`v2/Dockerfile`](../v2/Dockerfile) is a Node 20 → nginx multi-stage build (base-href `/`).
- [`nginx.conf`](../v2/nginx.conf): gzip, immutable caching for hashed assets, **`no-store` for the
  runtime config/data** (so mounted overrides take effect), SPA fallback.
- [`docker-entrypoint.sh`](../v2/docker-entrypoint.sh): injects `CALC_URL` env → `assets/config.json`
  at container start. One image, any backend, no rebuild.
- [`docker-compose.yml`](../v2/docker-compose.yml): frontend + R calculator + GeoServer.
- [`.github/workflows/image.yml`](../.github/workflows/image.yml) publishes the image to
  `ghcr.io/<owner>/esgame`.

## Re-converging `places` onto this upstream

`places` is currently a **vendored copy** of v2 (`docker_images/esgame/`) that has drifted by a few
files. Target end-state: `places` carries **zero Angular source** and consumes the shared image.

### 1. Customizations to upstream here (so places needs no source changes)
All places drift is **visual theming** and should become config flags (defaults preserve current
esgame look):

| places change | Files | Upstream as |
|---|---|---|
| Opacity (`+7D` alpha) on consequence-map fields + a `.consequences` background overlay | `svg-field.component.ts`, `svg-game-board.component.{ts,html,scss}` | `visualOptions.consequenceFieldOpacity` (bool, default `false`) |
| Red border on the focused board | `svg-level.component.{html,scss}` (`--is-center`) | `visualOptions.highlightFocusedBoard` (bool, default `false`) |
| Neutral (black) score text instead of red/green | `svg-level.component.scss` | `visualOptions.neutralScoreColors` (bool, default `false`) |
| `red` / `yellow` gradient start/end colors | `shared/helpers/gradients.ts` | `gradientOverrides: { <name>: { start, end } }`, applied in `loadSettings()` |

Each flag is read from the loaded settings and threaded to the components; with defaults off,
esgame renders exactly as today. `places` then sets the flags + gradient overrides in **its**
`data.json` — no forked components.

### 2. places repo restructure
1. Delete `docker_images/esgame/` (the vendored Angular copy + its Dockerfile).
2. Provide only an overlay: `config.json` (`calcUrl` → its hosted calculator) + `data.json`
   (its colors, Dutch language, title, and the visual flags above) + its R `calculation/` engine.
3. **Kubernetes:** point `kubernetes_deployment/base/esgame/esgame-angular-deploy.yaml` at
   `ghcr.io/<owner>/esgame:<tag>`; mount the overlay `config.json`/`data.json` via a ConfigMap
   (nginx serves `no-store` on them, so they apply without a rebuild). Keep the geodata PVC +
   init-container and the `calculation`/`geoserver` services.
4. **docker-compose (house-style):** add a compose stack mirroring the org pattern
   (`nginx-proxy-manager` + `.env` for `CALC_URL`) for local/full-stack and hosted instances.

### 3. Verification
After places consumes the new image, **playtest dynamic mode** to confirm its theme (opacity,
overlay, border, colors, gradients) matches the previous vendored look — the only check that
can't be done from esgame alone.

## Roadmap / hygiene
- After the first Pages publish is green: move `v2/` to the repo root and `index.html`/`calc.html`/
  `images/` etc. to `legacy/`; tag releases with semver (`v2.0.0`).
- Pin floating image tags (GeoServer `2.24.x` → a specific patch).
- Optional: drop the unused `server.js` / `express` dependency.
