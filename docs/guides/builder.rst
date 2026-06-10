=============
Builder guide
=============

This guide explains how to **build** every artifact that makes up the **esgame**
(Tradeoff / Ecosystem-Services) project: the Angular v2 single-page app, the
production Docker frontend image, and the example calculator and GeoServer images
that back the *dynamic* (SVG) mode. It also documents the CI build gate and the
GitHub Container Registry (ghcr) publish, plus the reproducibility guarantees that
make a build deterministic.

The guiding principle is **one image, any deployment**: the build is
configuration-free, and a specific backend or dataset is selected at *run time*,
never by rebuilding. For the run-time container plumbing (nginx tuning, the
``CALC_URL`` entrypoint hook, the Compose stacks) see :doc:`/reference/containers`.


Building the Angular app
========================

The app lives under :file:`esgame/v2` and is the Angular project ``Tradeoff-V2``
(package name ``tradeoff-v2``, version ``2.0.0``). All commands in this section run
from inside :file:`esgame/v2`.

Two steps produce a build:

.. code-block:: console

   $ npm ci
   $ npm run build

``npm run build`` is defined in :file:`v2/package.json` as ``ng build``. The
``build`` architect target in :file:`v2/angular.json` uses the **esbuild-based
application builder** ``@angular/build:application`` (not the older
``@angular-devkit/build-angular:browser`` webpack builder) and its
``defaultConfiguration`` is ``production`` — so a bare ``ng build`` is already a
production build.

npm scripts
-----------

The scripts in :file:`v2/package.json`:

.. list-table::
   :header-rows: 1
   :widths: 18 32 50

   * - Script
     - Command
     - Purpose
   * - ``ng``
     - ``ng``
     - Raw Angular CLI passthrough.
   * - ``start``
     - ``ng serve``
     - Dev server (``@angular/build:dev-server``, default ``development``).
   * - ``build``
     - ``ng build``
     - Production build (default configuration ``production``).
   * - ``watch``
     - ``ng build --watch --configuration development``
     - Incremental rebuild for local development.
   * - ``test``
     - ``ng test``
     - Karma unit tests (``@angular/build:karma``).
   * - ``e2e``
     - ``ng build && playwright test``
     - Build, then run the Playwright end-to-end suite.

Build configurations
---------------------

The ``build`` target defines two configurations in :file:`v2/angular.json`:

.. list-table::
   :header-rows: 1
   :widths: 20 80

   * - Configuration
     - Effect
   * - ``production`` *(default)*
     - ``outputHashing: "all"`` (every JS/CSS asset is content-hashed) plus
       budgets: ``initial`` warning ``1mb`` / error ``2mb``;
       ``anyComponentStyle`` warning ``2kb`` / error ``4kb``.
   * - ``development``
     - ``optimization: false``, ``extractLicenses: false``, ``sourceMap: true``.

Because ``production`` is the default, you only pass ``--configuration production``
explicitly where the surrounding command might otherwise be ambiguous (the
Dockerfile and CI both do so for clarity). To force a development build, pass
``--configuration development``.

The ``--base-href`` flag
------------------------

The same source builds for two very different URL roots, selected purely by
``--base-href``:

.. list-table::
   :header-rows: 1
   :widths: 26 30 44

   * - Command
     - ``<base href>``
     - Used by
   * - ``npm run build -- --base-href /``
     - ``/``
     - The Docker frontend image (serves from the domain root behind a reverse
       proxy). See :file:`v2/Dockerfile`.
   * - ``npm run build -- --base-href /esgame/``
     - ``/esgame/``
     - GitHub Pages, published at ``https://<owner>.github.io/esgame/``. See
       :file:`.github/workflows/deploy.yml`.

The ``--`` separates the ``npm run`` arguments from the arguments forwarded to
``ng build``. Choosing the wrong ``--base-href`` produces an app whose asset and
router URLs resolve against the wrong path prefix (blank page / 404s on assets),
so this is the single most important build flag to get right for a given
deployment target.

The esbuild application builder
-------------------------------

``@angular/build:application`` is the modern esbuild/Vite-based builder. Relevant
options from the ``build`` target:

* ``index``: ``src/index.html``
* ``browser`` (entry point): ``src/main.ts``
* ``polyfills``: ``["zone.js"]``
* ``tsConfig``: ``tsconfig.app.json``
* ``inlineStyleLanguage``: ``scss``; ``stylePreprocessorOptions.includePaths``:
  ``["src/styles"]``
* ``styles``: ``@angular/material/prebuilt-themes/indigo-pink.css`` and
  ``src/styles.scss``
* ``assets``: ``src/favicon.ico``, ``src/404.html``, ``src/assets``

The ``src/assets`` entry is what carries :file:`assets/config.json` (the runtime
config consumed by ``ConfigService`` via the ``APP_INITIALIZER``) into the build
output, so it is present to be patched at run time. The ``src/404.html`` asset is
the SPA-redirect page used by the GitHub Pages deploy — because it is part of the
``assets`` list it is emitted automatically and needs no separate copy step.

Build output layout
--------------------

The ``build`` target's ``outputPath`` is an object, not a plain string:

.. code-block:: json

   "outputPath": {
     "base": "dist/tradeoff-v2",
     "browser": ""
   }

Because ``browser`` is the **empty string**, the output is **flat** — there is no
``browser/`` subdirectory. ``index.html``, the content-hashed bundles, and the
``assets/`` tree all sit directly under :file:`dist/tradeoff-v2/`:

.. code-block:: text

   v2/dist/tradeoff-v2/
   ├── index.html
   ├── 404.html
   ├── favicon.ico
   ├── main-<hash>.js
   ├── styles-<hash>.css
   └── assets/
       ├── config.json
       └── ...

This flat layout matters downstream: the Dockerfile copies
``/app/dist/tradeoff-v2/`` straight into ``/usr/share/nginx/html`` and the deploy
workflow uploads ``v2/dist/tradeoff-v2`` directly as the Pages artifact — neither
has to descend into a ``browser/`` folder.


Building the Docker frontend image
==================================

The production frontend image is defined by :file:`v2/Dockerfile`. It is a
two-stage build: an Angular production build on Node, followed by a minimal nginx
runtime that serves the static ``dist`` output. The full run-time behaviour (nginx
config, healthcheck, the ``CALC_URL`` entrypoint hook) is documented in
:doc:`/reference/containers`; this section covers only what happens at *build*
time.

Build stage
-----------

.. code-block:: dockerfile

   FROM node:22-alpine AS build
   WORKDIR /app
   COPY package.json package-lock.json ./
   RUN npm ci
   COPY . .
   RUN npm run build -- --base-href / --configuration production

Key points:

* **Base image** ``node:22-alpine``. Node ``22.22.3+`` is required by Angular 22;
  the package ``engines`` constraint is ``^22.22.3 || ^24.15.0 || >=26``.
* **Layer caching.** ``package.json`` and ``package-lock.json`` are copied *before*
  the rest of the source and ``npm ci`` runs against just the lockfile, so the
  dependency-install layer is only invalidated when the lockfile changes — editing
  application source does not re-run ``npm ci``.
* **Base href ``/``.** The image serves from the domain root; a reverse proxy maps
  a host/path to this container.
* **Production configuration.** ``--configuration production`` is passed
  explicitly. Its ``outputHashing: "all"`` is what makes nginx's immutable-cache
  rule on hashed assets safe.

Runtime stage
-------------

.. code-block:: dockerfile

   FROM nginx:alpine
   COPY nginx.conf /etc/nginx/conf.d/default.conf
   COPY --from=build /app/dist/tradeoff-v2/ /usr/share/nginx/html
   COPY docker-entrypoint.sh /docker-entrypoint.d/40-esgame-config.sh
   RUN chmod +x /docker-entrypoint.d/40-esgame-config.sh
   EXPOSE 80

The build output is copied from the flat ``/app/dist/tradeoff-v2/`` directory into
the nginx web root.

``CALC_URL`` is runtime, not build
----------------------------------

The image contains **no** baked-in backend address. The calculator URL is selected
when the container starts, not when the image is built. Two mechanisms exist, both
acting on :file:`/usr/share/nginx/html/assets/config.json`:

* Set the ``CALC_URL`` environment variable. The entrypoint hook
  :file:`docker-entrypoint.sh` (installed as
  ``/docker-entrypoint.d/40-esgame-config.sh``) rewrites the ``"calcUrl"`` field in
  ``config.json`` before nginx starts.
* Bind-mount a complete ``config.json`` over the served file (this is what the
  example stack does; ``CALC_URL`` injection is then unused).

The shipped :file:`v2/src/assets/config.json` defaults are:

.. code-block:: json

   {
     "staticDataUrl": "assets/dataGridExample.json",
     "dynamicDataUrl": "assets/data.json",
     "calcUrl": "",
     "defaultMode": "static"
   }

An empty ``calcUrl`` means fully client-side (GRID / static mode, no backend); a
non-empty ``calcUrl`` selects the SVG / dynamic mode that POSTs to the calculator.
Because this is a run-time choice, **one image serves any backend or dataset
without a rebuild** — see :doc:`/reference/containers` for the entrypoint hook in
detail.

Building it
-----------

Directly:

.. code-block:: console

   $ docker build -t esgame-frontend v2

Or via the :file:`esgame/Makefile`, which drives the Compose stacks (the frontend
publishes on host port ``81``):

.. code-block:: console

   $ make esgame-build        # build the frontend image only
   $ make esgame-up           # build + start the static 'esgame' stack


Building the example calculator and GeoServer images
====================================================

The self-contained dynamic example under
:file:`esgame/examples/esgame-dynamic` is what makes the SVG mode playable end to
end without external infrastructure. It has three buildable images plus the
upstream esgame frontend.

Example frontend overlay
------------------------

:file:`examples/esgame-dynamic/frontend/Dockerfile` does **not** rebuild Angular —
it layers this example's SVG config on top of the already-built esgame image:

.. code-block:: dockerfile

   ARG ESGAME_IMAGE=ghcr.io/mlacayoemery/esgame:master
   FROM ${ESGAME_IMAGE}
   COPY data.json config.json /usr/share/nginx/html/assets/
   COPY assets/images/ /usr/share/nginx/html/assets/images/

The ``ESGAME_IMAGE`` build arg defaults to the published ghcr image but is overridden
by the Makefile to ``local/esgame-core:latest`` so the example builds fully offline
(no need to pull the private ghcr image). The suitability and consequence source
rasters (``esgame_img_*``) already ship in the base image; only the generated
zone/background maps and the SVG ``config.json`` / ``data.json`` are overlaid here.

Example calculator (FastAPI)
----------------------------

:file:`examples/esgame-dynamic/calculator/Dockerfile`:

.. code-block:: dockerfile

   FROM python:3.12-slim
   WORKDIR /app
   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt
   COPY app.py .
   EXPOSE 8000
   CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]

It is a small, **stateless** FastAPI service (``FastAPI(title="esgame example
calculator")``). On each level submit — the POST the frontend makes to ``calcUrl``
— it returns, per consequence-map id, a GeoServer WCS ``GetCoverage`` URL plus a
simple allocation-based score. Pinned dependencies in
:file:`calculator/requirements.txt`:

.. list-table::
   :header-rows: 1
   :widths: 40 60

   * - Package
     - Version
   * - ``fastapi``
     - ``0.115.6``
   * - ``uvicorn[standard]``
     - ``0.34.0``

The browser-facing GeoServer base URL is supplied at run time via the
``GEOSERVER_PUBLIC_URL`` environment variable (default
``http://localhost:8080/geoserver``), so the calculator image, too, is built once
and configured at run time.

GeoServer and the seeder
------------------------

GeoServer itself is **not built** — the example pulls the official image
``docker.osgeo.org/geoserver:2.28.4`` and serves the consequence rasters from a
persistent data dir (volume ``geoserver-data`` at ``/opt/geoserver_data``), which
is reloaded on every boot.

What *is* built is the one-shot **seeder**,
:file:`examples/esgame-dynamic/geoserver/Dockerfile`:

.. code-block:: dockerfile

   FROM python:3.12-slim
   COPY seed.py /seed.py
   ENTRYPOINT ["python3", "/seed.py"]

It uses the Python standard library only (no ``pip install``), registers the
``/rasters/*.tif`` files as external coverages plus palette styles, then exits. It
is idempotent — on reboot GeoServer simply reloads the catalog from its data dir
rather than re-seeding.

Building the example stack
--------------------------

The Makefile builds the local esgame base first, then the example images, so the
whole thing runs without pulling from ghcr:

.. code-block:: console

   $ make esgame-dynamic-example-build   # build local base + example images
   $ make esgame-dynamic-example-up      # build + start the playable example

This resolves to:

.. code-block:: console

   $ docker build -t local/esgame-core:latest v2
   $ ESGAME_IMAGE=local/esgame-core:latest \
       docker compose -p esgame-dynamic-example \
       -f examples/esgame-dynamic/docker-compose.yml build

Once up, the frontend is on host port ``81``, the calculator on ``8000``, and
GeoServer on ``8080`` (allow ~30–60 s for GeoServer to start and be seeded before
round 2 works).


Continuous integration: the build gate
=======================================

:file:`.github/workflows/ci.yml` is the **CI build/test gate** for the v2 app. It
runs on pull requests and on pushes to ``master``, scoped by path to ``v2/**`` and
the workflow file itself, so unrelated changes do not trigger it.

The job runs from the ``v2`` working directory and proceeds in order:

.. list-table::
   :header-rows: 1
   :widths: 26 74

   * - Step
     - Command
   * - Checkout
     - ``actions/checkout@v4``
   * - Node
     - ``actions/setup-node@v4`` with ``node-version: 20``, ``cache: npm``,
       ``cache-dependency-path: v2/package-lock.json``
   * - Install
     - ``npm ci``
   * - Build
     - ``npm run build -- --configuration production``
   * - Unit tests
     - ``npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox``
   * - E2E (Playwright)
     - ``npm run e2e``
   * - On failure
     - upload ``v2/playwright-report`` (``actions/upload-artifact@v4``,
       ``retention-days: 7``)

Karma and Playwright (``channel: chrome``) use the preinstalled Chrome via
``CHROME_BIN: /usr/bin/google-chrome``. A pull request must pass build + unit + e2e
to be mergeable.

.. note::

   CI pins ``node-version: 20`` for the build/test gate, whereas the image and
   Pages builds use Node 22 (the version Angular 22 *requires* to run). The gate
   confirms the app compiles and its tests pass; the published artifacts are built
   on the required Node 22.


Publishing the container image (ghcr)
=====================================

:file:`.github/workflows/image.yml` builds and **publishes the frontend image to
GitHub Container Registry** so downstream deployments (e.g. ``places``) consume the
*same* image instead of vendoring the source.

* **Triggers.** Push to ``master``, tags matching ``v*``, or manual
  ``workflow_dispatch``; path-scoped to ``v2/**`` and the workflow file.
* **Permissions.** ``contents: read``, ``packages: write``.
* **Login.** ``docker/login-action@v3`` to ``ghcr.io`` using ``github.actor`` and
  ``secrets.GITHUB_TOKEN``.
* **Tags.** ``docker/metadata-action@v5`` against ``ghcr.io/${{ github.repository
  }}`` produces ``type=ref,event=branch``, ``type=semver,pattern={{version}}``, and
  ``type=sha``.
* **Build & push.** ``docker/build-push-action@v5`` with ``context: v2`` and
  ``push: true`` — it builds :file:`v2/Dockerfile` and pushes all computed tags.

The resulting image (e.g. ``ghcr.io/mlacayoemery/esgame:master``) is exactly the
default ``ESGAME_IMAGE`` base that the example frontend overlay extends.

Publishing to GitHub Pages
--------------------------

A third workflow, :file:`.github/workflows/deploy.yml`, deploys the app to GitHub
Pages at ``https://<owner>.github.io/esgame/``. It installs with ``npm ci`` and
builds with ``--base-href /esgame/ --configuration production`` on Node
``22.22.3``, archives the legacy v1 game under ``dist/tradeoff-v2/v1/``, and uploads
``v2/dist/tradeoff-v2`` via ``actions/upload-pages-artifact@v3``. The ``404.html``
SPA-redirect page is emitted automatically from ``src/404.html`` (it is in the
``angular.json`` assets list), so no extra fallback-copy step is needed.


Reproducibility
===============

The build is deterministic across local, CI, image, and Pages contexts because the
same constraints are applied everywhere:

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Mechanism
     - Guarantee
   * - ``npm ci`` (never ``npm install``)
     - Installs exactly the versions locked in :file:`v2/package-lock.json`,
       failing if ``package.json`` and the lockfile disagree. Used identically in
       the Dockerfile, ``ci.yml``, and ``deploy.yml``.
   * - Pinned Angular packages
     - All ``@angular/*`` packages and ``@angular/build`` / ``@angular/cli`` are
       pinned to ``22.0.0`` (exact, no caret) in :file:`v2/package.json`;
       ``typescript`` is pinned to ``6.0.3`` and ``zone.js`` to ``0.16.2``.
   * - Node version
     - Angular 22 requires ``^22.22.3 || ^24.15.0 || >=26``. The image uses
       ``node:22-alpine`` and Pages pins ``22.22.3``; CI's build/test gate runs on
       Node 20.
   * - Pinned image bases
     - ``node:22-alpine``, ``nginx:alpine``, ``python:3.12-slim``, and
       ``docker.osgeo.org/geoserver:2.28.4``; the example calculator pins
       ``fastapi==0.115.6`` and ``uvicorn[standard]==0.34.0``.
   * - Configuration-free build
     - No backend address is compiled in. ``CALC_URL`` (and ``config.json`` more
       broadly) is applied at *run time*, so a given image hash is reproducible and
       reusable across deployments.

The net effect is that a rebuild from a given commit — locally, in CI, or in the
ghcr workflow — yields functionally identical artifacts, and a single published
image can be retargeted to any backend or dataset without rebuilding. See
:doc:`/reference/containers` for how that run-time retargeting works.
