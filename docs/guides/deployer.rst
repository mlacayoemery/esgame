==============
Deployer guide
==============

This guide explains how to **deploy** the **esgame** (Tradeoff /
Ecosystem-Services) land-use allocation game to a running, public environment.
It covers the three supported deployment paths, in increasing order of moving
parts:

#. **Static GitHub Pages** — the canonical *grid* (client-side) game, published
   automatically by CI. No backend, no Docker.
#. **A single Docker container** — the same frontend image, optionally pointed
   at a calculation backend, plus the self-contained *dynamic* (SVG) example
   Compose stack (frontend + calculator + GeoServer).
#. **A downstream deployment (places)** — a thin overlay image built ``FROM``
   the esgame image, deployed either with Docker Compose or as a Kubernetes
   Kustomize overlay on the esgame base.

The guiding principle is **one image, any deployment**: the published frontend
image is configuration-free and selects a specific backend or dataset at *run
time* (via the ``CALC_URL`` environment variable and/or a mounted
:file:`assets/config.json`), never by rebuilding. For how those artifacts are
**built**, see :doc:`/guides/builder`. For the container plumbing referenced
throughout (nginx tuning, the entrypoint hook, the Compose stacks) see
:doc:`/reference/containers`, and for how an allocation flows from the browser
through the calculator to GeoServer and back see :doc:`/data-flow`.

.. contents:: On this page
   :local:
   :depth: 2


Choosing a deployment path
===========================

The canonical esgame game is **grid mode**: it runs entirely client-side, needs
no backend, and is exactly what GitHub Pages serves. You only need a calculation
backend (and therefore Docker or Kubernetes) for the **dynamic** (SVG) mode.

.. list-table::
   :header-rows: 1
   :widths: 22 16 30 32

   * - Path
     - Mode
     - What runs
     - Use when
   * - GitHub Pages
     - grid (static)
     - frontend only, served from ``/esgame/``
     - You want the public, zero-cost, zero-ops canonical game.
   * - Single container
     - grid or dynamic
     - one nginx container (``+`` optional backend)
     - You self-host the frontend, or want a frontend-only deployment behind a
       reverse proxy.
   * - Compose example
     - dynamic
     - frontend ``+`` calculator ``+`` GeoServer ``+`` seeder
     - You want the full dynamic stack on one host for a demo or local run.
   * - places (overlay)
     - dynamic
     - overlay frontend ``+`` calculation ``+`` GeoServer
     - You are a downstream deployment with your own data and geodata.

The :file:`assets/config.json` runtime file selects the mode and the backend.
Its fields (read by ``ConfigService`` via an ``APP_INITIALIZER`` before the app
starts) are:

.. list-table::
   :header-rows: 1
   :widths: 24 16 60

   * - Field
     - Default
     - Meaning
   * - ``staticDataUrl``
     - ``assets/dataGridExample.json``
     - Grid-mode dataset URL.
   * - ``dynamicDataUrl``
     - ``assets/data.json``
     - SVG-mode dataset URL.
   * - ``calcUrl``
     - ``""``
     - Calculation backend the browser POSTs to. **Empty string = fully
       client-side** (grid only, no backend call).
   * - ``defaultMode``
     - ``static``
     - Which mode loads first — ``static`` (grid) or ``dynamic`` (SVG).

The shipped default (:file:`esgame/v2/src/assets/config.json`) is
``defaultMode: "static"`` with an empty ``calcUrl`` — i.e. the client-side grid
game. The dynamic paths below change exactly those two fields, either by mounting
a different ``config.json`` or by injecting ``calcUrl`` from the ``CALC_URL``
environment variable.


Path 1 — Static GitHub Pages
============================

The Angular v2 app is published to GitHub Pages by the workflow
:file:`esgame/.github/workflows/deploy.yml` (*"Deploy v2 to GitHub Pages"*). The
result is served at ``https://<owner>.github.io/esgame/``, with the legacy
vanilla-JS v1 game archived alongside it at ``/esgame/v1/``.

When it runs
------------

The workflow triggers on a ``push`` to ``master`` that touches ``v2/**`` or the
workflow file itself (plus the legacy v1 assets ``index.html``, ``calc.html``,
``wc.htm``, ``calc_files/**``, ``images/**``), and can also be launched manually
via ``workflow_dispatch``. Concurrency is pinned to a single ``pages`` group with
``cancel-in-progress: true``, so a newer push supersedes an in-flight run.

What the build does
-------------------

The ``build`` job runs on ``ubuntu-latest`` and:

#. checks out the repo and sets up Node **22.22.3** (Angular 22 requires
   ``^22.22.3 || ^24.15.0 || >=26``), with ``npm`` caching keyed on
   :file:`v2/package-lock.json`;
#. installs with ``npm ci`` (working directory :file:`v2`);
#. builds **with the project base href**:

   .. code-block:: console

      $ npm run build -- --base-href /esgame/ --configuration production

   The ``--base-href /esgame/`` is essential: Pages serves a *project site* under
   the ``/esgame/`` path segment, so every asset and route must be prefixed with
   it.
#. archives the legacy v1 under ``/v1/`` by copying ``index.html``,
   ``calc.html``, ``wc.htm``, ``calc_files`` and ``images`` into
   :file:`v2/dist/tradeoff-v2/v1/`;
#. uploads :file:`v2/dist/tradeoff-v2` as the Pages artifact
   (``actions/upload-pages-artifact@v3``).

The ``deploy`` job then publishes that artifact with
``actions/deploy-pages@v4`` into the ``github-pages`` environment. The required
permissions are ``contents: read``, ``pages: write`` and ``id-token: write``.

The clean-URL 404 trick (spa-github-pages)
------------------------------------------

GitHub Pages has no SPA fallback: a deep link like ``/esgame/some/route``
returns a 404 because there is no such file. esgame uses the
`spa-github-pages <https://github.com/rafgraph/spa-github-pages>`_ (MIT) trick.
The file :file:`esgame/v2/src/404.html` is **built into the output** by the
``angular.json`` assets list (so no copy step is needed in the workflow), and
Pages serves it on any unknown path. Its script rewrites the deep-link path into
a query string and redirects back to the SPA, where a companion script in
``index.html`` restores the original path. The key parameter is::

   var pathSegmentsToKeep = 1;

which preserves the ``/esgame/`` project-site base segment while encoding the
rest of the path. (This redirect is **unused under nginx/Docker**, where the
nginx SPA fallback handles deep links instead — see Path 2.)

One-time repository setup
-------------------------

In the repository, set **Settings → Pages → Build and deployment → Source** to
**GitHub Actions** (not "Deploy from a branch"). After that, every qualifying
push to ``master`` republishes automatically; the deployed URL is surfaced as the
``github-pages`` environment URL on the run.

.. note::

   The Pages build emits an empty ``calcUrl`` (the shipped default), so the
   published site is the **client-side grid game** with no backend. There is no
   calculator on Pages.


Path 2 — Single Docker container
================================

The production frontend image (built from :file:`esgame/v2/Dockerfile`) is a
multi-stage build: it compiles the app with ``--base-href /`` (served from the
domain root; a reverse proxy maps host/path to the container) and serves the
output from ``nginx:alpine`` on port **80**. See :doc:`/reference/containers` for
the full container reference.

Run the frontend
----------------

Pull or build the image, then run it. Assuming a published image:

.. code-block:: console

   $ docker run -d --name esgame -p 8080:80 ghcr.io/mlacayoemery/esgame:master

The site is then reachable at ``http://localhost:8080/``. With no environment
variables this serves the **grid** game (empty ``calcUrl``).

Pointing the frontend at a backend (``CALC_URL``)
-------------------------------------------------

To run the **dynamic** mode you must inject a backend URL. The image's
entrypoint :file:`esgame/v2/docker-entrypoint.sh` (installed as
:file:`/docker-entrypoint.d/40-esgame-config.sh` and run by nginx's
``/docker-entrypoint.d/`` hook as root before nginx starts) substitutes the
``CALC_URL`` environment variable into ``calcUrl`` inside
:file:`/usr/share/nginx/html/assets/config.json`:

.. code-block:: console

   $ docker run -d --name esgame -p 8080:80 \
       -e CALC_URL=https://esgame-calculation.example.com \
       ghcr.io/mlacayoemery/esgame:master

On start it logs, for example::

   [esgame] runtime config: calcUrl="https://esgame-calculation.example.com"

Mechanics worth knowing:

- The substitution is a ``sed`` rewrite of the ``"calcUrl": "..."`` field using a
  ``#`` delimiter (so it does not clash with the ``/`` in URLs). It only fires
  when the config file exists **and** ``CALC_URL`` is set (``${CALC_URL+x}``);
  setting ``CALC_URL=""`` explicitly writes an empty backend (grid-only).
- The temp file ``mktemp`` produces is ``0600`` root-owned, so the script
  ``chmod 644``\ s the result, restoring world-read so the nginx worker can serve
  it.
- **No rebuild is ever required to change the backend** — the same image targets
  any environment by env var alone.

The no-store config rule
------------------------

nginx (:file:`esgame/v2/nginx.conf`) serves the runtime config and game data
with ``Cache-Control: no-store``::

   location ~* /assets/(config|data|dataGridExample)\.json$ {
       add_header Cache-Control "no-store";
       try_files $uri =404;
   }

so an entrypoint-injected (or mounted) override takes effect on the **next page
load** without a rebuild or cache-bust. By contrast, content-hashed build assets
(``js``/``css``/``woff2``/``ttf``/``eot``) are served
``public, max-age=31536000, immutable``, and images/GeoTIFFs
(``png``/``jpg``/``svg``/``tif`` …) get a revalidatable ``expires 1h``. The
``location /`` block is an SPA fallback (``try_files $uri $uri/ /index.html``) —
harmless with the app's hash routing and future-proof for path routing.

Healthcheck
-----------

The image declares a Docker ``HEALTHCHECK``:

.. list-table::
   :header-rows: 1
   :widths: 28 72

   * - Parameter
     - Value
   * - Command
     - ``wget -q -O /dev/null http://127.0.0.1/ || exit 1``
   * - ``--interval``
     - ``15s``
   * - ``--timeout``
     - ``3s``
   * - ``--start-period``
     - ``5s``
   * - ``--retries``
     - ``3``

It probes ``127.0.0.1`` (not ``localhost``) so it does not resolve to IPv6
``[::1]`` before nginx is reachable. Check container health with
``docker ps`` (the ``STATUS`` column shows ``(healthy)``) or
``docker inspect --format '{{.State.Health.Status}}' esgame``.

The dynamic example Compose stack
---------------------------------

For the **full dynamic stack** on one host, use the self-contained example
:file:`esgame/examples/esgame-dynamic/docker-compose.yml`. It uses esgame's own
bundled (grid) data, so no external/proprietary geodata is needed, and
demonstrates the architecture that real deployments specialize. Four services
make up the project ``esgame-dynamic-example``:

.. list-table::
   :header-rows: 1
   :widths: 22 18 60

   * - Service
     - Host port
     - Role
   * - ``frontend``
     - ``81:80``
     - The esgame image ``+`` this example's SVG config and generated zone/
       background maps.
   * - ``calculator``
     - ``8000:8000``
     - A tiny stateless **FastAPI** stand-in: per-level submit returns a WCS URL
       per consequence map ``+`` a simple allocation-based score.
   * - ``geoserver``
     - ``8080:8080``
     - Serves the consequence rasters; ``docker.osgeo.org/geoserver:2.28.4``,
       ``CORS_ENABLED=true``.
   * - ``geoserver-seed``
     - —
     - One-shot job that registers the rasters as **external coverages**, then
       exits (``restart: "no"``).

Bring it up and down. The repository ships ``make`` targets that build the
esgame base locally (so no ghcr image is required):

.. code-block:: console

   $ make esgame-dynamic-example-up
   # open http://localhost:81/ -> place arable/livestock on the zones, press Next Level.
   # Round 2 shows consequence maps served from GeoServer.

   $ make esgame-dynamic-example-down   # stop + remove

Equivalently, directly with Compose (the ``ESGAME_IMAGE`` build arg selects the
base image; it defaults to ``ghcr.io/mlacayoemery/esgame:master``):

.. code-block:: console

   $ ESGAME_IMAGE=local/esgame-core:latest \
       docker compose -p esgame-dynamic-example up -d --build

The one-shot seeder, the volume, and persistence
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

GeoServer's catalog lives on a **persistent named volume**, ``geoserver-data``,
mounted at ``/opt/geoserver_data``, and the rasters are bind-mounted read-only at
``/rasters``. The ``geoserver-seed`` service registers each
``/rasters/*.tif`` as an **external** coverage (GeoServer references the file in
place and writes only the catalog *sidecar* config into its data dir), builds an
SLD raster style per palette, and exits. It is **idempotent**: if the workspace
already exists it does nothing. Consequently:

- on reboot / restart / recreate of GeoServer it reloads coverages from the
  persistent data dir — no re-seeding, fast (the seeder re-runs but no-ops);
- the durable source of truth is the committed ``geoserver/rasters/`` folder
  ``+`` the persisted catalog;
- to wipe and re-seed from scratch, remove the volume:

  .. code-block:: console

     $ docker compose -p esgame-dynamic-example down -v   # removes geoserver-data
     $ docker compose -p esgame-dynamic-example up -d

Editing the mounted config (the ``--force-recreate`` gotcha)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

In this stack ``config.json`` is **bind-mounted** into the frontend (read-only)
rather than only baked into the image::

   volumes:
     - ./frontend/config.json:/usr/share/nginx/html/assets/config.json:ro

so you can tweak settings **without rebuilding the image** — e.g.
``gridLineWidth`` / ``gridLineColor`` (the SVG cell border), ``defaultMode`` or
``calcUrl`` (which is why the ``CALC_URL`` entrypoint injection is **not** used
here — the backend URL lives in the mounted file). The example's config sets
``defaultMode: "dynamic"`` and ``calcUrl: "http://localhost:8000"``.

The gotcha: a **single-file bind mount won't pick up in-place edits live**.
Editors that replace the file's inode need the container re-created to re-read
it. Apply an edit with:

.. code-block:: console

   $ docker compose -p esgame-dynamic-example up -d --force-recreate frontend
   # then reload the page

No image rebuild is needed either way.

.. seealso::

   The Compose example mirrors production data flow: the browser POSTs the
   allocation to the calculator (``calcUrl``), which returns
   ``{results:[{id, score, url}]}`` where each ``url`` is a GeoServer **WCS
   GetCoverage** GeoTIFF of a consequence raster. See :doc:`/data-flow`.


Path 3 — places (downstream overlay)
====================================

The ``places`` deployment (a fork at :file:`places`) is the reference downstream
deployment. It contains **no Angular source fork**: the whole app (nginx,
entrypoint, runtime-config) comes from the upstream esgame image, and only the
place-specific game data and map TIFFs are overlaid. This is the
re-convergence target: **one upstream image ``+`` base, parameterized per
deployment**.

The overlay image (``FROM`` esgame)
-----------------------------------

:file:`places/frontend/Dockerfile` is a thin overlay built ``FROM`` the esgame
image and pinned via the ``ESGAME_IMAGE`` build arg:

.. code-block:: dockerfile

   ARG ESGAME_IMAGE=ghcr.io/mlacayoemery/esgame:master
   FROM ${ESGAME_IMAGE}

   # Overlay PLACES' dynamic-game config (data.json carries its visualOptions +
   # gradientOverrides) and its map rasters. nginx serves assets/*.json as
   # no-store, so config still applies on reload.
   COPY data.json config.json /usr/share/nginx/html/assets/
   COPY assets/images/ /usr/share/nginx/html/assets/images/

Because nginx serves ``assets/*.json`` as ``no-store``, the overlaid config still
applies on reload. ``calcUrl`` stays **runtime** — the upstream entrypoint
injects it from the ``CALC_URL`` env var, so it is not baked into the overlay.

.. important::

   ``ESGAME_IMAGE`` must point at an esgame build that has the runtime-config
   ``+`` ``visualOptions`` / ``gradientOverrides`` support (i.e. ``>= 2.0.0`` /
   today's ``master``). The ``1.9.0`` tag **predates** it. Pin to ``:2.0.0``
   once that esgame release is tagged. Build locally against a local base image
   with:

   .. code-block:: console

      $ docker build --build-arg ESGAME_IMAGE=local/esgame-core:latest \
          -t places-frontend places/frontend

places with Docker Compose
---------------------------

:file:`places/deploy/compose/docker-compose.places.yml` (project ``places``)
runs the overlay frontend ``+`` places' own calculation ``+`` GeoServer:

.. list-table::
   :header-rows: 1
   :widths: 26 16 58

   * - Service
     - Host port
     - Notes
   * - ``places-frontend``
     - ``81:80``
     - Built from ``../../frontend``; ``CALC_URL`` env (default
       ``http://localhost:8000``) injected into ``config.json`` at start.
   * - ``places-calculation``
     - ``8000:8000``
     - Built from ``../../calculation``; ``GEOSERVER`` env from
       ``GEOSERVER_URL`` (default ``http://localhost:8080/geoserver``).
   * - ``places-geoserver``
     - ``8080:8080``
     - ``docker.osgeo.org/geoserver:2.24.x``, ``CORS_ENABLED=true``.

Copy the example env file and bring the stack up:

.. code-block:: console

   $ cp places/deploy/compose/.env.places.example places/deploy/compose/.env.places
   # edit ESGAME_IMAGE / CALC_URL / GEOSERVER_URL as needed, then:
   $ docker compose -p places --env-file deploy/compose/.env.places \
       -f deploy/compose/docker-compose.places.yml up -d --build

The three tunable variables (from :file:`.env.places.example`) are:

.. list-table::
   :header-rows: 1
   :widths: 22 78

   * - Variable
     - Purpose
   * - ``ESGAME_IMAGE``
     - Upstream esgame frontend image the overlay builds ``FROM``
       (default ``ghcr.io/mlacayoemery/esgame:master``; pin to ``:2.0.0`` once
       released — ``1.9.0`` predates the runtime-config ``+`` theming).
   * - ``CALC_URL``
     - **Public** URL the browser POSTs game state to. Local full stack:
       ``http://localhost:8000``; prod example:
       ``https://esgame-calculation.containers.wurnet.nl/esgame``.
   * - ``GEOSERVER_URL``
     - GeoServer URL the calculation backend uses **server-to-server**
       (``http://localhost:8080/geoserver``).

.. note::

   A real calculation needs places' geodata loaded into GeoServer / the
   calculator. **The geodata is no longer in git** — supply it from your object
   storage / data release.

places on Kubernetes (Kustomize overlay)
----------------------------------------

:file:`places/deploy/k8s/kustomization.yaml` consumes the esgame Kubernetes
**base** remotely and layers only place-specific bits on top — no forked
manifests:

.. code-block:: yaml

   resources:
     - https://github.com/mlacayoemery/esgame//deploy/k8s/base?ref=master
     - pvc.yaml

The base (:file:`esgame/deploy/k8s/base`) ships three components — the
``esgame-angular`` frontend, the ``esgame-calculation`` backend (R Plumber;
dynamic mode only) and ``esgame-geoserver`` — plus an ``esgame-config``
ConfigMap, services and ingresses. The overlay does four things:

#. **Repoints images** to the places registry via a single ``images:`` block
   (the base references *logical* image names ``esgame-angular`` /
   ``esgame-calculation`` so they can be rewritten without patching each
   manifest):

   .. code-block:: yaml

      images:
        - name: esgame-angular
          newName: CHANGE-ME-registry/places-frontend     # built from ../../frontend
          newTag: latest
        - name: esgame-calculation
          newName: CHANGE-ME-registry/places-calculation   # built from ../../calculation
          newTag: latest

#. **Overrides the config** (``patch-config.yaml``) — the places backend
   ``CALC_URL`` and ``GEOSERVER_URL`` in the ConfigMap. ``CALC_URL`` must be the
   **public** calculation ingress host (the browser posts there client-side, so
   it must be externally reachable — *not* the in-cluster service name); set
   ``CALC_URL: ""`` for a client-side-only grid deployment.
#. **Adds geodata** (``patch-calculation.yaml`` ``+`` ``pvc.yaml``) — swaps the
   base's ephemeral ``emptyDir`` (mounted at ``/app/data``) for a
   ``persistentVolumeClaim`` named ``places-geodata`` (a 10Gi ``ReadWriteOnce``
   PVC), and adds an ``initContainers`` ``load-geodata`` that fetches the geodata
   into ``/data`` at startup. The shipped init container is a **placeholder**
   (an ``alpine:3.20`` ``echo 'TODO: fetch places geodata …'``) — **replace it
   with the real loader** that pulls from your object storage / data release.
#. **Sets ingress hosts** via JSON-patch ``replace`` ops on the three base
   ingresses (``esgame-angular-ingress``, ``esgame-calculation-ingress``,
   ``esgame-geoserver-ingress``), replacing the ``CHANGE-ME-*.example.com``
   placeholders.

Apply with Kustomize:

.. code-block:: console

   $ kubectl apply -k places/deploy/k8s

Before applying, you must replace every ``CHANGE-ME-*`` placeholder: the two
image ``newName`` registries and the three ingress hosts, and swap the
placeholder ``load-geodata`` init container for the real loader.

.. important::

   Pin the base ``ref`` (currently ``?ref=master``) to ``v2.0.0`` once that
   esgame release is tagged. ``master`` is used until then; the ``1.9.0`` tag
   predates :file:`deploy/k8s/base` entirely. For reproducible GeoServer deploys,
   also pin the base's ``docker.osgeo.org/geoserver:2.24.x`` to a specific patch
   (e.g. ``2.24.4``).

External geodata
~~~~~~~~~~~~~~~~~

Across every places path the rule is the same: **the geodata is not in git**.
The Compose stack expects it loaded into GeoServer / the calculator out of band;
the Kubernetes overlay provides the *shape* (a PVC ``+`` an init container) but
leaves the actual fetch to you. Supply it from your object storage or data
release and wire it into the ``load-geodata`` init container before the
calculation backend can return real consequence maps.


Runtime configuration cheatsheet
=================================

Whatever the path, the backend and dataset are chosen at run time, not by
rebuilding. The two mechanisms are:

.. list-table::
   :header-rows: 1
   :widths: 26 30 44

   * - Mechanism
     - Where
     - Effect
   * - ``CALC_URL`` env var
     - Docker ``-e``, Compose ``environment:``, k8s ConfigMap
     - Entrypoint rewrites ``calcUrl`` in :file:`assets/config.json` before
       nginx starts (logs ``[esgame] runtime config: calcUrl="…"``).
   * - Mounted/overlaid ``config.json``
     - Compose bind mount, overlay ``COPY``, k8s ConfigMap on ``assets/``
     - Replaces the whole runtime config (``defaultMode``, ``calcUrl``, grid
       line styling, …). Served ``no-store`` so it applies on the next reload.

For a frontend-only (grid) deployment, run **just** the frontend with
``CALC_URL: ""`` (or the default empty ``calcUrl``) — no calculator or GeoServer
needed. The full container reference, including the nginx cache classes and the
Compose stacks, is in :doc:`/reference/containers`; the request/response path
through the calculator and GeoServer is in :doc:`/data-flow`.
