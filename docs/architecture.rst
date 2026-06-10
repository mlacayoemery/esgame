============
Architecture
============

**esgame** is the canonical implementation of the *Tradeoff / Ecosystem-Services*
land-use allocation game: an Angular single-page application in which players
allocate a fixed budget of production types (e.g. arable land, livestock) across a
landscape and immediately see the ecosystem-service trade-offs that result.

The defining property of the system is that **one codebase and one container image
serve every deployment**. There is no per-deployment fork of the application source.
A deployment is expressed entirely as *configuration and data* — a mounted
:file:`assets/config.json`, a game-settings JSON, some map rasters, and (for the
dynamic mode) a calculation backend. This page explains the single codebase and its
two modes, the runtime-config pattern that makes one image reusable, the three
deployment shapes built on top of it, and the overall container topology.

See :doc:`data-flow` for the request/response detail of a scoring round and
:doc:`game-mechanics` for the gameplay rules. Role-specific instructions live in the
:doc:`guides/user`, :doc:`guides/developer`, :doc:`guides/builder`, and
:doc:`guides/deployer` guides.

.. note::

   This page supersedes the older :file:`docs/ARCHITECTURE.md` with a richer,
   reference-grade overview.


One Angular codebase, two modes
===============================

The application is the Angular SPA under :file:`v2/` (Angular 22; the build requires
Node ``22.22.3+``, per :file:`v2/Dockerfile`). Routing is **hash-based**
(``useHash`` routing), so no server rewrite rules are required for the SPA to work
under any base path.

The routes are declared in :file:`v2/src/app/app-routing.module.ts`:

.. list-table:: Routes (``AppRoutingModule``)
   :header-rows: 1
   :widths: 22 30 48

   * - Path
     - Component
     - Purpose
   * - ``''`` (root)
     - ``HomeComponent``
     - Landing route; launches the grid **or** dynamic game per ``config.json``
       ``defaultMode`` (default ``static``), keeping a clean ``/`` URL.
   * - ``config``
     - ``StartComponent``
     - The start / configuration landing page.
   * - ``static-game``
     - ``GridLevelComponent``
     - The **GRID / "static"** game (client-side scoring).
   * - ``dynamic-game``
     - ``SvgLevelComponent``
     - The **SVG / "dynamic"** game (backend scoring).
   * - ``configurator``
     - ``ConfiguratorComponent``
     - Authoring/configuration view.
   * - ``**``
     - *(redirect)*
     - Unknown paths fall back to the root route ``''``.

The same build ships both modes. Which one the root launches is a runtime decision:
``HomeComponent`` reads ``config.appConfig.defaultMode`` and renders the dynamic game
when it equals ``'dynamic'`` (otherwise the grid game), keeping the ``/`` URL clean.

GRID / "static" mode
--------------------

The grid game (``GridLevelComponent``, route ``static-game``) computes every score
**entirely in the browser**. It needs **no backend** and no GeoServer. This is the
mode published to GitHub Pages, and it is what the canonical Pages build runs with an
empty ``calcUrl``.

SVG / "dynamic" mode
--------------------

The SVG game (``SvgLevelComponent``, route ``dynamic-game``) delegates scoring to an
external **calculation backend**. On each level submission the browser POSTs the
allocation to the URL in ``calcUrl``; the backend returns, per consequence map, a
score plus a **GeoServer WCS GetCoverage** URL for a consequence raster, which the SVG
view then displays. This mode requires the full Docker/Kubernetes stack (frontend +
calculator + GeoServer). The request/response contract is detailed in
:doc:`data-flow`.


Runtime configuration (the key design point)
============================================

Game configuration is **loaded at runtime, not bundled at build time**. This is the
single mechanism that lets one build / one container image serve any deployment.

``ConfigService`` and ``APP_INITIALIZER``
-----------------------------------------

At startup, an ``APP_INITIALIZER`` provider in :file:`v2/src/app/app.module.ts` runs
``ConfigService.load()`` before the app bootstraps::

   {
     provide: APP_INITIALIZER,
     useFactory: (config: ConfigService) => () => config.load(),
     deps: [ConfigService],
   }

``ConfigService`` (:file:`v2/src/app/services/config.service.ts`) fetches
:file:`assets/config.json`, merges it over a ``DEFAULT_CONFIG``, and falls back to the
defaults if the file is absent (``catchError`` returns ``{}``). The shipped
:file:`v2/src/assets/config.json` is:

.. code-block:: json

   {
       "staticDataUrl": "assets/dataGridExample.json",
       "dynamicDataUrl": "assets/data.json",
       "calcUrl": "",
       "defaultMode": "static"
   }

The ``AppConfig`` interface defines these runtime fields:

.. list-table:: ``AppConfig`` fields (``config.service.ts``)
   :header-rows: 1
   :widths: 26 18 56

   * - Field
     - Default
     - Meaning
   * - ``staticDataUrl``
     - ``assets/dataGridExample.json``
     - Game-settings JSON loaded for the **grid** mode.
   * - ``dynamicDataUrl``
     - ``assets/data.json``
     - Game-settings JSON loaded for the **SVG** mode.
   * - ``calcUrl``
     - ``""``
     - Calculation backend URL. **Empty string = fully client-side** (the canonical
       Pages build). When present, it overrides the ``calcUrl`` baked into the game
       data, so one build can target any backend or none.
   * - ``defaultMode``
     - ``static``
     - Which game the site root (``/``) launches: ``static`` or ``dynamic``. The
       start page stays at ``/config`` either way.
   * - ``gridLineColor``
     - *(unset)*
     - Optional SVG-mode cell border (grid line) color override.
   * - ``gridLineWidth``
     - *(unset)*
     - Optional SVG-mode cell border width, e.g. ``"0.05px"``.
   * - ``highlightWidth``
     - *(unset)*
     - Optional SVG-mode hover-highlight border width (board units), e.g. ``"1"``.

How config and data combine
---------------------------

``ConfigService.getGameData(mode)`` fetches the per-mode settings JSON
(``staticDataUrl`` or ``dynamicDataUrl``) and then overlays any present config values
onto the loaded data — ``calcUrl``, ``gridLineColor``, ``gridLineWidth``, and
``highlightWidth`` from ``config.json`` replace whatever the data file declared. The
result is handed to the game's existing settings loader.

.. important::

   To customize a deployment you change **config + data — never the source**. Mount or
   overwrite :file:`assets/config.json` and the referenced data/TIFFs. Asset URLs
   inside the settings JSON must be **relative** (``assets/...`` or ``./assets/...``),
   never absolute (``/assets/...``), so they resolve under a sub-path base-href.

Two complementary override channels
-----------------------------------

There are two ways to inject the runtime config into a running image, both of which
avoid a rebuild:

#. **Mount the file.** Bind-mount or ``COPY`` a replacement
   :file:`assets/config.json` (and the data/rasters it references). nginx is
   configured to serve these as ``no-store`` (see below), so an updated file applies
   on the next page load.

#. **Inject from an env var.** The image's entrypoint
   :file:`v2/docker-entrypoint.sh` (installed as
   :file:`/docker-entrypoint.d/40-esgame-config.sh`) rewrites ``calcUrl`` in
   :file:`assets/config.json` from the ``CALC_URL`` environment variable before nginx
   starts, using a ``sed`` substitution with a ``#`` delimiter. This is how the same
   image is pointed at any backend purely via ``CALC_URL`` — no rebuild, no mounted
   file required.

nginx caching policy
--------------------

:file:`v2/nginx.conf` is tuned so that the runtime override actually takes effect:

.. list-table:: nginx cache behavior
   :header-rows: 1
   :widths: 44 56

   * - Match
     - ``Cache-Control`` / behavior
   * - ``/assets/(config|data|dataGridExample).json``
     - ``no-store`` — never cached, so mounted/injected overrides apply immediately.
   * - ``*.js *.css *.woff2? *.ttf *.eot``
     - ``public, max-age=31536000, immutable`` (content-hashed build assets).
   * - ``*.png *.jpg *.gif *.ico *.svg *.tif *.tiff``
     - ``expires 1h`` — cacheable, allowed to revalidate (images & GeoTIFFs).
   * - ``location /``
     - SPA fallback ``try_files $uri $uri/ /index.html`` (harmless with hash routing;
       future-proofs path routing).

The image also enables ``gzip`` for text/CSS/JS/JSON/SVG and ships a ``HEALTHCHECK``
that probes ``http://127.0.0.1/`` (IPv4, deliberately not ``localhost``).


The shared image
================

:file:`v2/Dockerfile` is a two-stage build:

* **Build stage** — ``node:22-alpine``; ``npm ci`` from the lockfile, then
  ``npm run build -- --base-href / --configuration production``. The image serves from
  the domain root; a reverse proxy maps host/path to the container.
* **Runtime stage** — ``nginx:alpine`` serving ``dist/tradeoff-v2/`` from
  :file:`/usr/share/nginx/html`, with the tuned :file:`nginx.conf` and the config
  entrypoint installed into :file:`/docker-entrypoint.d/`.

This image is the single artifact that all three deployment shapes consume.


Three deployment shapes
========================

(a) Static GitHub Pages — client-side, no backend
--------------------------------------------------

The grid mode is published as a fully static site to GitHub Pages. There is **no
backend and no GeoServer**: ``calcUrl`` is the empty string, so all scoring happens in
the browser. The CI build sets ``--base-href /esgame/`` and adds an SPA ``404.html``;
hash routing means no server rewrite rules are needed. This is the lowest-cost way to
publish a playable grid game.

(b) ``examples/esgame-dynamic`` — self-contained dynamic stack
--------------------------------------------------------------

:file:`examples/esgame-dynamic/` is a runnable, self-contained example of the full
**dynamic** stack, built on esgame's own bundled (static-grid) data so it needs no
external/proprietary geodata. It demonstrates the architecture that real deployments
specialize. The :file:`docker-compose.yml` (project ``esgame-dynamic-example``)
defines four services:

.. list-table:: ``examples/esgame-dynamic`` services
   :header-rows: 1
   :widths: 20 14 66

   * - Service
     - Port
     - Role
   * - ``frontend``
     - ``81:80``
     - A thin overlay built ``FROM`` the esgame image
       (``ESGAME_IMAGE``, default ``ghcr.io/mlacayoemery/esgame:master``), adding this
       example's SVG ``data.json`` (a generated 28×29 zone map + background).
       :file:`config.json` is **bind-mounted** at
       :file:`/usr/share/nginx/html/assets/config.json` so ``gridLineWidth`` /
       ``gridLineColor`` / ``calcUrl`` / ``defaultMode`` can be tweaked without an
       image rebuild. Here ``calcUrl`` lives in ``config.json``, so the ``CALC_URL``
       entrypoint injection is not used.
   * - ``calculator``
     - ``8000:8000``
     - A tiny **stateless FastAPI** stand-in. Per level submit it returns, per
       consequence map, a GeoServer **WCS** URL + a simple allocation-based score
       (``{results:[{id, score, url}]}``). ``GEOSERVER_PUBLIC_URL`` is the
       browser-facing GeoServer base (``http://localhost:8080/geoserver``). It does
       **not** seed.
   * - ``geoserver``
     - ``8080:8080``
     - ``docker.osgeo.org/geoserver:2.28.4`` serving the consequence rasters. Its
       catalog lives on the persistent named volume ``geoserver-data`` →
       :file:`/opt/geoserver_data`; the TIFF folder is bind-mounted read-only at
       :file:`/rasters`. ``CORS_ENABLED=true``.
   * - ``geoserver-seed``
     - *(one-shot)*
     - Idempotent job (``restart: "no"``) that registers
       :file:`/rasters/*.tif` as **external** coverages and builds an SLD raster style
       per palette. GeoServer reloads everything from its data dir on reboot, so it
       only seeds once; ``down -v`` (removing the volume) wipes and re-seeds.

Run it from the repo root with ``make esgame-dynamic-example-up`` (builds the esgame
base locally, so no ghcr image is needed) and open ``http://localhost:81/``;
``make esgame-dynamic-example-down`` stops and removes it. See the example's
``README.md`` for the seeding/persistence detail.

(c) ``places`` — thin overlay deployment (compose & Kubernetes)
---------------------------------------------------------------

**PLACES** (*Participatory Landscape Configuration Effects Simulator*) is a real
deployment that re-converges onto esgame as a **thin overlay** — it vendors **zero
Angular source**. Its frontend is the upstream esgame image with only its game config
and map assets layered on top, and its visual customizations are now upstream esgame
config flags (``visualOptions``, ``gradientOverrides``) carried in its ``data.json``.

**Overlay image** — :file:`places/frontend/Dockerfile`:

.. code-block:: docker

   ARG ESGAME_IMAGE=ghcr.io/mlacayoemery/esgame:master
   FROM ${ESGAME_IMAGE}
   COPY data.json config.json /usr/share/nginx/html/assets/
   COPY assets/images/ /usr/share/nginx/html/assets/images/

Because the whole app (nginx, entrypoint, runtime-config) comes from the upstream
image, ``calcUrl`` stays runtime: the upstream entrypoint injects it from the
``CALC_URL`` env var, and nginx serves ``assets/*.json`` as ``no-store`` so the
overlaid config still applies on reload. ``ESGAME_IMAGE`` should be pinned to a
released tag (``:2.0.0`` once tagged; ``1.9.0`` predates the runtime-config + theming
support).

**Calculation backend** — PLACES ships its **own R Plumber** calculation service
(:file:`places/calculation/calculation.r`), the production counterpart of the example
stack's FastAPI stand-in. The R service exposes a ``POST /esgame`` endpoint (with a
CORS filter) that reads ``game_id`` / ``round`` / ``score`` / ``allocation`` from the
request body and returns scores + GeoServer WCS coverage URLs; the GeoServer base
comes from the ``GEOSERVER`` env var. The canonical R reference implementation lives
at :file:`tools/R/calculator.r`.

**docker compose** — :file:`places/deploy/compose/docker-compose.places.yml`
(project ``places``) runs three services:

.. list-table:: ``places`` compose services
   :header-rows: 1
   :widths: 26 12 62

   * - Service
     - Port
     - Role
   * - ``places-frontend``
     - ``81:80``
     - Built from :file:`../../frontend` (the overlay ``FROM`` ``ESGAME_IMAGE``);
       ``CALC_URL`` defaults to ``http://localhost:8000``.
   * - ``places-calculation``
     - ``8000:8000``
     - PLACES' R Plumber backend; ``GEOSERVER`` defaults to
       ``http://localhost:8080/geoserver``.
   * - ``places-geoserver``
     - ``8080:8080``
     - ``docker.osgeo.org/geoserver:2.24.x`` with ``CORS_ENABLED=true``.

Configuration is supplied via :file:`deploy/compose/.env.places` (copied from
``.env.places.example``): ``ESGAME_IMAGE``, ``CALC_URL`` (the public URL the browser
POSTs to), and ``GEOSERVER_URL`` (server-to-server). A *real* run also needs PLACES'
geodata loaded into GeoServer/the calculator; that geodata and any secrets are **not
in git** and are supplied at deploy time.

**Kubernetes (Kustomize)** — :file:`places/deploy/k8s/` is a Kustomize overlay that
references the esgame base
(``https://github.com/mlacayoemery/esgame//deploy/k8s/base?ref=master``) and adds only
PLACES-specific patches — no forked manifests:

* ``images:`` re-point the base's logical names ``esgame-angular`` →
  ``places-frontend`` and ``esgame-calculation`` → ``places-calculation``.
* :file:`patch-config.yaml` overrides the ``esgame-config`` ConfigMap (``CALC_URL``,
  ``GEOSERVER_URL``).
* :file:`patch-calculation.yaml` swaps the base's ephemeral ``emptyDir`` for the
  ``places-geodata`` PVC (:file:`pvc.yaml`, ``10Gi``, ``ReadWriteOnce``) and adds a
  ``load-geodata`` init container that loads PLACES' geodata into :file:`/data` at
  startup.
* Ingress-host ``replace`` patches for the frontend, calculation, and geoserver
  ingresses.

Deploy with ``kubectl apply -k deploy/k8s`` after setting the ``CHANGE-ME-*``
placeholders.

Comparison
----------

.. list-table:: Deployment shapes at a glance
   :header-rows: 1
   :widths: 24 16 22 38

   * - Shape
     - Mode
     - Backend
     - Orchestration
   * - GitHub Pages
     - GRID / static
     - none (``calcUrl=""``)
     - static site, ``--base-href /esgame/``
   * - ``examples/esgame-dynamic``
     - SVG / dynamic
     - FastAPI stand-in
     - docker compose (frontend + calculator + GeoServer + seed)
   * - ``places``
     - SVG / dynamic
     - R Plumber
     - docker compose **and** k8s Kustomize (overlay on esgame base)


Container / component topology
==============================

The dynamic deployments share one shape: the browser runs the Angular SPA from the
nginx-served esgame image, POSTs allocations to a calculation backend, and renders
consequence rasters fetched directly from GeoServer via WCS.

.. code-block:: text

   ┌──────────────────────────── Browser (client) ────────────────────────────┐
   │  Angular SPA  (esgame image, hash routing)                                │
   │   APP_INITIALIZER → ConfigService.load()  ──fetch──▶ assets/config.json   │
   │     ├─ staticDataUrl / dynamicDataUrl / calcUrl / defaultMode             │
   │   HomeComponent (defaultMode) ─▶ GridLevelComponent  (static-game)        │
   │                                └▶ SvgLevelComponent   (dynamic-game)      │
   └───────┬───────────────────────────────────────────────┬──────────────────┘
           │ GET assets/* (config, data, rasters)           │ POST allocation
           │ Cache-Control: no-store on *.json              │ (dynamic mode only)
           ▼                                                ▼
   ┌──────────────────────┐                  ┌──────────────────────────────────┐
   │  Frontend (nginx)    │                  │  Calculation backend             │
   │  esgame image        │   CALC_URL env   │   FastAPI  (example) │ R Plumber  │
   │  /docker-entrypoint.d│ ───injects────▶  │   POST /esgame                    │
   │   40-esgame-config.sh│   calcUrl        │   returns {results:[{id,score,    │
   │  serves SPA + assets │                  │            url}]}  (WCS URLs)     │
   └──────────────────────┘                  └───────────────┬──────────────────┘
                                                             │ server-to-server
                                                             │ (GEOSERVER / GEOSERVER_URL)
                                                             ▼
                                              ┌───────────────────────────────────┐
                                              │  GeoServer                        │
                                              │   consequence rasters (GeoTIFF)   │
                                              │   external coverages + SLD styles │
                                              └───────────────────────────────────┘
                                                             ▲
                                                             │ WCS GetCoverage
                                                             │ (browser fetches each `url`)
                                              ────────────────┘  back to the SPA

In GRID / static mode only the **Frontend (nginx)** box exists: there is no
calculation backend and no GeoServer, and scoring happens inside the browser. In SVG /
dynamic mode all three tiers are present, and the only difference between the example
stack and ``places`` is which calculation backend implementation (FastAPI vs. R
Plumber) sits in the middle tier. The per-round request/response payloads are
documented in :doc:`data-flow`, and the scoring rules in :doc:`game-mechanics`.
