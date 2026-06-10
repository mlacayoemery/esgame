==================
Container runtime
==================

This page is the reference for how **esgame** is packaged and run as a container:
the multi-stage frontend image, the tuned nginx server, the runtime-config entrypoint
hook, and the self-contained ``esgame-dynamic`` Compose stack (frontend + FastAPI
calculator + GeoServer + a one-shot seeder).

The design goal throughout is *one image, any deployment*: the build is configuration-free,
and a specific backend or dataset is selected at **run time** — by mounting
:file:`assets/config.json` or by setting the ``CALC_URL`` environment variable — never by
rebuilding. See :doc:`/data-flow` for the meaning of the individual config fields;
this page covers only the container plumbing.


The frontend image
==================

The frontend image is defined by :file:`v2/Dockerfile`. It is a two-stage build: an
Angular production build on Node, then a minimal nginx runtime that serves the static
``dist`` output.

Build stage
-----------

.. code-block:: dockerfile

   FROM node:22-alpine AS build
   WORKDIR /app
   COPY package.json package-lock.json ./
   RUN npm ci
   COPY . .
   RUN npm run build -- --base-href / --configuration production

Notable points:

* **Base image** ``node:22-alpine``. Node 22.22.3+ is required by Angular 22
  (the package ``engines`` constraint is ``^22.22.3 || ^24.15.0 || >=26``).
* **Layer caching.** ``package.json`` and ``package-lock.json`` are copied first and
  ``npm ci`` is run before the rest of the source, so dependency installation is only
  re-run when the lockfile changes.
* **Base href.** The build is run with ``--base-href /`` because the image serves from
  the domain root; a reverse proxy is expected to map a host/path to this container.
* **Production configuration.** ``--configuration production`` enables (among other
  things) ``outputHashing: "all"`` — every JS/CSS asset is content-hashed, which is what
  makes the immutable-cache rule in nginx safe.

Build output is written to ``dist/tradeoff-v2`` (``angular.json`` →
``architect.build.options.outputPath``: ``base = "dist/tradeoff-v2"``,
``browser = ""``). Because ``browser`` is the empty string, the output is **flat** — there
is no ``browser/`` subdirectory — so ``index.html``, the hashed bundles, and the ``assets/``
tree all sit directly under ``dist/tradeoff-v2/``.

Runtime stage
-------------

.. code-block:: dockerfile

   FROM nginx:alpine
   COPY nginx.conf /etc/nginx/conf.d/default.conf
   COPY --from=build /app/dist/tradeoff-v2/ /usr/share/nginx/html
   COPY docker-entrypoint.sh /docker-entrypoint.d/40-esgame-config.sh
   RUN chmod +x /docker-entrypoint.d/40-esgame-config.sh
   EXPOSE 80

The runtime is plain ``nginx:alpine``. The tuned server config replaces the stock
``default.conf``, the flat ``dist`` tree is copied into nginx's document root
(:file:`/usr/share/nginx/html`), and the runtime-config script is installed as a
``/docker-entrypoint.d`` hook (see :ref:`container-entrypoint`).

Healthcheck
-----------

.. code-block:: dockerfile

   HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
     CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

.. list-table:: Healthcheck parameters
   :header-rows: 1
   :widths: 25 20 55

   * - Flag
     - Value
     - Notes
   * - ``--interval``
     - ``15s``
     - Time between probes once running.
   * - ``--timeout``
     - ``3s``
     - Per-probe timeout.
   * - ``--start-period``
     - ``5s``
     - Grace window during which failures don't count.
   * - ``--retries``
     - ``3``
     - Consecutive failures before the container is marked *unhealthy*.

The probe deliberately uses ``http://127.0.0.1/`` rather than ``localhost`` so it does not
resolve to IPv6 ``[::1]`` before nginx is reachable.


The nginx configuration
=======================

:file:`v2/nginx.conf` is installed as ``/etc/nginx/conf.d/default.conf``. It is a single
``server`` block on port 80 (IPv4 and IPv6), with document root
:file:`/usr/share/nginx/html` and ``index index.html``.

Compression
-----------

.. code-block:: nginx

   gzip            on;
   gzip_min_length 1024;
   gzip_types      text/plain text/css application/javascript application/json image/svg+xml;

gzip is enabled for responses of at least 1024 bytes, for the listed MIME types
(plain text, CSS, JavaScript, JSON, and SVG).

Cache strategy
--------------

Three location blocks set distinct caching policies, ordered from most to least volatile:

.. list-table:: nginx cache rules (location order)
   :header-rows: 1
   :widths: 42 30 28

   * - Path pattern
     - Header / expiry
     - Intent
   * - ``/assets/(config|data|dataGridExample)\.json$``
     - ``Cache-Control: no-store``
     - Runtime config & game data — never cached, so a mounted or entrypoint-injected override takes effect on the next page load with no rebuild.
   * - ``\.(js|css|woff2?|ttf|eot)$``
     - ``Cache-Control: public, max-age=31536000, immutable``
     - Content-hashed build assets are immutable — cached for one year.
   * - ``\.(png|jpe?g|gif|ico|svg|tif|tiff)$``
     - ``expires 1h``
     - Images and GeoTIFF game data — cacheable but allowed to revalidate.

The ``no-store`` rule is the linchpin of the run-time-config design: it guarantees that an
override of :file:`assets/config.json` (a new ``calcUrl`` or dataset) is seen immediately
rather than being served from a stale browser cache. The same applies to
:file:`assets/data.json` and :file:`assets/dataGridExample.json`.

SPA fallback
------------

.. code-block:: nginx

   location / {
       try_files $uri $uri/ /index.html;
   }

The catch-all serves the requested file if it exists, otherwise falls back to
:file:`index.html`. This is harmless with the app's hash-based routing and future-proofs a
switch to path-based routing. The two JSON/asset blocks above instead use
``try_files $uri =404`` so a missing config or data file yields a clean 404 rather than the
SPA shell.


.. _container-entrypoint:

The runtime-config entrypoint hook
==================================

:file:`v2/docker-entrypoint.sh` is installed into the image as
``/docker-entrypoint.d/40-esgame-config.sh``. The stock ``nginx`` entrypoint runs every
executable script in ``/docker-entrypoint.d/`` (in lexical order, as root) **before** nginx
starts; the ``40-`` prefix slots this hook into that sequence.

Its single job is to inject the calculation backend URL into the served
:file:`assets/config.json` so that one image can target any backend without a rebuild. It
reads exactly one environment variable:

.. list-table:: Entrypoint environment variable
   :header-rows: 1
   :widths: 18 82

   * - Variable
     - Effect
   * - ``CALC_URL``
     - Overrides the ``calcUrl`` field in :file:`assets/config.json`. An empty string forces fully client-side play (no backend).

The exact mechanism:

.. code-block:: sh

   #!/bin/sh
   set -e

   CONFIG=/usr/share/nginx/html/assets/config.json

   if [ -f "$CONFIG" ] && [ -n "${CALC_URL+x}" ]; then
     tmp="$(mktemp)"
     # '#' delimiter avoids clashing with the '/' in URLs.
     sed "s#\"calcUrl\"[[:space:]]*:[[:space:]]*\"[^\"]*\"#\"calcUrl\": \"${CALC_URL}\"#" "$CONFIG" > "$tmp"
     mv "$tmp" "$CONFIG"
     # mktemp creates a 0600 root-owned file; restore world-read so the nginx worker can serve it.
     chmod 644 "$CONFIG"
     echo "[esgame] runtime config: calcUrl=\"${CALC_URL}\""
   fi

Step by step:

#. The hook runs only when :file:`assets/config.json` **exists** and ``CALC_URL`` is **set**.
   The test ``[ -n "${CALC_URL+x}" ]`` distinguishes *set* (including the empty string)
   from *unset* — so ``CALC_URL=""`` is a deliberate "no backend" signal and will still
   rewrite the file, whereas leaving the variable unset skips the hook entirely.
#. A ``sed`` substitution replaces the existing ``"calcUrl": "<anything>"`` pair with the
   new value. The substitution uses ``#`` as the delimiter (not ``/``) precisely because
   the value is typically a URL containing slashes, and the pattern tolerates arbitrary
   whitespace around the colon.
#. The edit is written to a ``mktemp`` file and then ``mv``-ed over the original (atomic
   replace).
#. ``mktemp`` produces a ``0600`` root-owned file, so the hook explicitly ``chmod 644``\ s
   the result; otherwise the unprivileged nginx worker could not read it.
#. A confirmation line is printed to the container log.

Because ``calcUrl`` flows through ``ConfigService`` and ``getGameData()`` in the app, the
injected value overrides whatever ``calcUrl`` is baked into the game-data JSON. This is the
preferred override path for image-only deployments. When :file:`config.json` is instead
**bind-mounted** with a ``calcUrl`` already set (as the Compose example does), the
``CALC_URL`` injection is simply not used — the two mechanisms are alternatives, not layers.


The ``esgame-dynamic`` Compose stack
====================================

:file:`examples/esgame-dynamic/docker-compose.yml` (Compose project name
``esgame-dynamic-example``) is a self-contained demonstration of the dynamic (SVG/backend)
mode. It wires the esgame frontend image to a tiny FastAPI calculator and a GeoServer that
serves the consequence rasters. Bring it up with:

.. code-block:: console

   $ ESGAME_IMAGE=local/esgame-core:latest \
       docker compose -p esgame-dynamic-example up -d --build

Services
--------

.. list-table:: Compose services
   :header-rows: 1
   :widths: 16 22 14 26 22

   * - Service
     - Image / build
     - Host port
     - Volumes
     - depends_on
   * - ``frontend``
     - build ``./frontend`` (arg ``ESGAME_IMAGE``, default ``ghcr.io/mlacayoemery/esgame:master``) → ``esgame-dynamic-example-frontend``
     - ``81:80``
     - ``./frontend/config.json`` → :file:`/usr/share/nginx/html/assets/config.json` ``:ro``
     - ``calculator``
   * - ``calculator``
     - build ``./calculator`` → ``esgame-dynamic-example-calculator``
     - ``8000:8000``
     - —
     - —
   * - ``geoserver``
     - ``docker.osgeo.org/geoserver:2.28.4``
     - ``8080:8080``
     - ``geoserver-data`` → :file:`/opt/geoserver_data`; ``./geoserver/rasters`` → :file:`/rasters` ``:ro``
     - —
   * - ``geoserver-seed``
     - build ``./geoserver`` → ``esgame-dynamic-example-seeder``
     - —
     - ``./geoserver/rasters`` → :file:`/rasters` ``:ro``; ``./geoserver/palettes.json`` → :file:`/palettes.json` ``:ro``
     - ``geoserver``

A single named volume, ``geoserver-data``, persists the GeoServer catalog (the sidecar
config) so it survives a reboot without re-seeding.

frontend
~~~~~~~~

Built from :file:`examples/esgame-dynamic/frontend/Dockerfile`, which layers this example's
SVG configuration on top of the upstream esgame image:

.. code-block:: dockerfile

   ARG ESGAME_IMAGE=ghcr.io/mlacayoemery/esgame:master
   FROM ${ESGAME_IMAGE}
   COPY data.json config.json /usr/share/nginx/html/assets/
   COPY assets/images/ /usr/share/nginx/html/assets/images/

The example's :file:`frontend/config.json` selects dynamic mode and points at the
sibling calculator:

.. code-block:: json

   {
     "staticDataUrl": "assets/dataGridExample.json",
     "dynamicDataUrl": "assets/data.json",
     "calcUrl": "http://localhost:8000",
     "defaultMode": "dynamic",
     "gridLineColor": "#9e9e9e",
     "gridLineWidth": "0.05px",
     "highlightWidth": "1"
   }

This file is **bind-mounted** read-only over the baked-in config so that ``calcUrl``,
``defaultMode``, ``gridLineWidth``, ``gridLineColor`` and ``highlightWidth`` can be tweaked
without rebuilding the image. Because ``calcUrl`` is set here, the ``CALC_URL`` entrypoint
injection (see :ref:`container-entrypoint`) is not exercised in this stack. Note the host
port mapping is ``81:80``, so the frontend is reached at ``http://localhost:81/``.

calculator
~~~~~~~~~~

A stateless FastAPI stand-in built from :file:`calculator/Dockerfile`
(``python:3.12-slim``; ``fastapi==0.115.6`` and ``uvicorn[standard]==0.34.0``), launched as
``uvicorn app:app --host 0.0.0.0 --port 8000``. It exposes:

* ``GET /`` — health, returns ``{"status": "ok"}``.
* ``POST /`` — the per-level calculate call the frontend makes to ``calcUrl``. For each
  consequence-map id it returns a GeoServer **WCS GetCoverage** URL plus a simple
  allocation-based ``score``.

It reads one environment variable, ``GEOSERVER_PUBLIC_URL``, set in Compose to
``http://localhost:8080/geoserver`` — the **browser-facing** base URL embedded in the WCS
links it returns (so they must be reachable from the user's browser, not from inside the
Compose network).

geoserver
~~~~~~~~~

Stock ``docker.osgeo.org/geoserver:2.28.4`` with ``CORS_ENABLED: "true"`` (so the browser
may fetch coverages cross-origin). Two volumes: the persistent ``geoserver-data`` catalog,
and the raster folder ``./geoserver/rasters`` mounted read-only at :file:`/rasters` and
referenced *in place* by the external coverages the seeder registers.

geoserver-seed (one-shot)
~~~~~~~~~~~~~~~~~~~~~~~~~~

Built from :file:`geoserver/Dockerfile` (``python:3.12-slim``, stdlib only,
``ENTRYPOINT ["python3", "/seed.py"]``) with ``restart: "no"`` — it runs once and exits.
It ``depends_on: [geoserver]`` and reaches it via the **in-network** URL
``GEOSERVER_URL: http://geoserver:8080/geoserver`` (contrast the calculator's
browser-facing public URL).

The seeder (:file:`geoserver/seed.py`) is **idempotent**: it waits for GeoServer's REST
API, creates the ``esgame`` workspace if absent, registers each :file:`/rasters/*.tif` as
an **external** GeoTIFF coverage (GeoServer references the file in place and stores only
catalog config in its data dir), then builds one SLD raster style per palette from
:file:`palettes.json` and assigns it as the matching coverage's default style. After the
first run GeoServer reloads everything from its persistent data dir on boot, so re-seeding
is skipped — coverage/style creation is guarded by existence checks.


.. _container-bindmount-gotcha:

Gotcha: single-file bind-mount inode aliasing
=============================================

The frontend mounts a **single file** (``./frontend/config.json`` →
:file:`/usr/share/nginx/html/assets/config.json`). A single-file bind mount binds the host
file's **inode** into the container, and many editors replace a file by writing a new inode
(write-to-temp then rename) rather than rewriting in place. When that happens the container
keeps pointing at the old inode and **does not** see the edit live.

To apply an edit to a mounted ``config.json``, re-create the container so the mount is
re-resolved:

.. code-block:: console

   $ docker compose -p esgame-dynamic-example up -d --force-recreate frontend

Then reload the page in the browser (the ``no-store`` header on
:file:`/assets/config.json` ensures the newly served file is fetched fresh, not pulled from
cache). The same caveat applies to any other single-file bind mount in the stack.


See also
========

* :doc:`/data-flow` — the :file:`assets/config.json` schema and field semantics.
* :doc:`../reference/calculator` — the calculation backend contract the ``calcUrl`` POST targets.
