=========================================
Data Flow: Values Passed Between Services
=========================================

This page is the authoritative reference for **every data contract** that crosses a
process or container boundary in esgame. It documents the exact field names, types, and
endpoints that connect the Angular frontend (:file:`v2/`), the runtime configuration, the
calculation backend (the FastAPI example calculator and the R calculator), and GeoServer.

esgame runs in one of two modes (selected per game-data file, see
:ref:`game-data <game-data>`):

* **GRID / "static"** — ``mapMode != "svg"`` in the game data, which maps to
  ``Settings.mode == 'GRID'``. Fully client-side: scoring happens in the browser, no
  network calls leave for a backend. ``calcUrl`` is empty/absent.
* **SVG / "dynamic"** — ``mapMode == "svg"`` → ``Settings.mode == 'SVG'``. On level
  submit the browser POSTs the current allocation to a calculation backend (``calcUrl``)
  and renders the GeoTIFF rasters that backend serves from GeoServer.

All client-side code paths referenced below live in
:file:`v2/src/app/services/`; the example backend lives under
:file:`examples/esgame-dynamic/`.

.. contents:: On this page
   :local:
   :depth: 2

Overview
========

The data flow for one SVG/dynamic level submit, end to end:

#. The browser loads runtime config from :file:`assets/config.json`
   (``ConfigService.load``) and the game-data JSON for the mode
   (``ConfigService.getGameData``).
#. On *Next Level*, ``GameService.goToNextLevel`` builds an ``inputData`` object and
   POSTs it to ``Settings.calcUrl`` via ``ApiService.postRequest``.
#. The calculator returns a ``CalculationResult`` whose ``results[]`` carry, per
   consequence map, a score and a **WCS GetCoverage URL** (``image/tiff``).
#. ``GameService.prepareNextLevel`` stores each URL on the matching consequence map
   (``urlToData``); ``TiffService`` fetches the GeoTIFF directly from GeoServer and
   renders it.
#. GeoServer serves those coverages, which were previously registered by a one-shot
   seeding job (``seed.py`` REST calls) or by the R calculator's live uploads.

See also :doc:`reference/calculator`, :doc:`reference/geoserver`, and
:doc:`reference/containers`.

.. _app-config:

(a) Runtime config: ``config.json`` (AppConfig) + ``CALC_URL`` injection
========================================================================

Source: :file:`v2/src/app/services/config.service.ts`,
:file:`v2/docker-entrypoint.sh`.

``ConfigService.load()`` is run once at startup (via ``APP_INITIALIZER``). It GETs
:file:`assets/config.json` (relative to ``<base href>``), and on any error falls back to
``DEFAULT_CONFIG``. The fetched object is merged over the defaults:
``{ ...DEFAULT_CONFIG, ...cfg }``. This means a single build/image serves any deployment —
mount or override :file:`assets/config.json` (and the data files it references); no
rebuild required.

**AppConfig fields** (interface ``AppConfig``):

.. list-table::
   :header-rows: 1
   :widths: 22 12 18 48

   * - Field
     - Type
     - Default
     - Meaning
   * - ``staticDataUrl``
     - ``string``
     - ``assets/dataGridExample.json``
     - URL (relative to ``<base href>``) of the GRID/"static" game-data JSON.
   * - ``dynamicDataUrl``
     - ``string``
     - ``assets/data.json``
     - URL (relative to ``<base href>``) of the SVG/"dynamic" game-data JSON.
   * - ``calcUrl``
     - ``string?``
     - *(unset)*
     - Optional override for the calculation backend URL. When **present** it replaces
       the ``calcUrl`` baked into the game data (see ``getGameData`` below). An **empty
       string** forces fully client-side play (no backend) — used by the static GitHub
       Pages deployment.
   * - ``defaultMode``
     - ``'static' | 'dynamic'?``
     - ``static``
     - Which game the site root (``/``) launches. The start page stays at ``/config``
       either way.
   * - ``gridLineColor``
     - ``string?``
     - *(unset)*
     - SVG-mode cell border (grid line) color override.
   * - ``gridLineWidth``
     - ``string?``
     - *(unset)*
     - SVG-mode cell border width, e.g. ``"0.05px"``.
   * - ``highlightWidth``
     - ``string?``
     - *(unset)*
     - SVG-mode hover-highlight border width (board units), e.g. ``"1"``.

Example :file:`assets/config.json` (the dynamic example,
:file:`examples/esgame-dynamic/frontend/config.json`):

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

``CALC_URL`` injection (entrypoint)
-----------------------------------

:file:`v2/docker-entrypoint.sh` runs (as root) via nginx's
``/docker-entrypoint.d/`` hook before nginx starts. If
:file:`/usr/share/nginx/html/assets/config.json` exists **and** the environment
variable ``CALC_URL`` is set (``-n "${CALC_URL+x}"``, so even an empty string counts),
it rewrites the ``"calcUrl"`` value in place with ``sed`` (using ``#`` as the delimiter
so URL slashes don't clash) and restores ``chmod 644``:

.. code-block:: sh

   sed "s#\"calcUrl\"[[:space:]]*:[[:space:]]*\"[^\"]*\"#\"calcUrl\": \"${CALC_URL}\"#" "$CONFIG" > "$tmp"

This lets the same image target any backend (``CALC_URL=https://…``) or force fully
client-side play (``CALC_URL=""``) without a rebuild. In the example
``docker-compose.yml`` the entrypoint injection is **not** used — ``config.json`` is
bind-mounted with ``calcUrl`` already set, so re-creating the container re-reads it.

.. _game-data:

(b) Game-data JSON (static vs dynamic) from ``getGameData``
===========================================================

Source: ``ConfigService.getGameData`` and ``Settings.mapData``
(:file:`v2/src/app/shared/models/settings.ts`).

``getGameData(mode)`` GETs ``staticDataUrl`` (mode ``'static'``) or ``dynamicDataUrl``
(mode ``'dynamic'``), then **overlays AppConfig overrides** onto the result. For each of
``calcUrl``, ``gridLineColor``, ``gridLineWidth``, ``highlightWidth``: if the AppConfig
value ``!== undefined``, it replaces the game-data field. Critically, an AppConfig
``calcUrl`` of ``""`` (empty string) is *defined*, so it overrides the data's ``calcUrl``
and disables the backend.

The raw object is then passed to ``new Settings(translate, data)`` →
``mapData(data)``, which maps the JSON onto the ``Settings`` class. Key fields read by
``mapData``:

.. list-table::
   :header-rows: 1
   :widths: 26 18 56

   * - JSON field
     - Settings field / type
     - Notes
   * - ``mapMode``
     - ``mode: 'GRID' | 'SVG'``
     - ``"svg"`` → ``'SVG'``; anything else → ``'GRID'``.
   * - ``calcUrl``
     - ``calcUrl: string``
     - The calculation backend POST target. Empty/absent ⇒ client-side only.
   * - ``imageMode``
     - ``imageMode: boolean``
     -
   * - ``elementSize``
     - ``elementSize: number``
     - Placed-element footprint in cells.
   * - ``gameBoardColumns`` / ``gameBoardRows``
     - ``gameBoardColumns`` / ``gameBoardRows`` ``: number``
     - Board grid dimensions.
   * - ``minValue`` / ``maxValue``
     - ``minValue`` / ``maxValue`` ``: number``
     - Raster value range used to color GeoTIFFs.
   * - ``minSelected``
     - ``minSelected: number``
     -
   * - ``defaultProductionType``
     - ``defaultProductionType: number``
     - ``Number.parseInt`` of the JSON string. Used as the ``lulc`` for unselected
       fields (see ``inputData.allocation`` below).
   * - ``infiniteLevels``
     - ``infiniteLevels: boolean``
     -
   * - ``highlightColor``
     - ``highlightColor: string``
     -
   * - ``gridLineColor`` / ``gridLineWidth`` / ``highlightWidth``
     - same names, ``string?``
     - SVG-mode visual overrides (also settable from AppConfig).
   * - ``productionTypes[]``
     - ``{ id:number, name:LanguageString, fieldColor:string, urlToIcon:string, maxElements:number }[]``
     - ``id`` parsed with ``Number.parseInt``.
   * - ``maps[]``
     - ``{ id:string, name:LanguageString, gradient, customColorId:string, gameBoardType, productionTypes:number[], urlToData:string }[]``
     - ``gameBoardType`` mapped from ``"Suitability"|"Consequence"|"Drawing"|"Background"``;
       ``urlToData`` is the GeoTIFF source (local asset, or a backend WCS URL after a
       calc round).
   * - ``customColors[]``
     - ``{ id:string, colors:{ number:number, color:string }[] }[]``
     -
   * - ``title``, ``basicInstructions``, ``advancedInstructions``
     - per-language ``Record<string,string>``
     - Fed to ``ngx-translate``.
   * - ``basicInstructionsImageUrl`` / ``advancedInstructionsImageUrl``
     - ``string``
     -
   * - ``visualOptions``
     - ``VisualOptions``
     - Merged over ``DEFAULT_VISUAL_OPTIONS`` (``consequenceFieldOpacity``,
       ``highlightFocusedBoard``, ``neutralScoreColors``; all ``false`` by default).
   * - ``gradientOverrides``
     - *(not stored)*
     - Passed to ``applyGradientOverrides``.

``GameBoardType`` mapping (``convertGameBoardType``):

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - JSON ``gameBoardType``
     - ``GameBoardType``
   * - ``"Suitability"``
     - ``SuitabilityMap`` (the placeable input layers)
   * - ``"Consequence"``
     - ``ConsequenceMap`` (the result layers; ``urlToData`` is set from the calc result)
   * - ``"Drawing"``
     - ``DrawingMap`` (the zone/overlay layer)
   * - ``"Background"``
     - ``BackgroundMap``
   * - *(other / missing)*
     - ``SuitabilityMap`` (default)

**Static vs dynamic game data.** Both modes share this schema; the difference is
``mapMode`` and whether ``calcUrl`` / ``Consequence`` maps point at a backend. The
dynamic example (:file:`examples/esgame-dynamic/frontend/data.json`) uses
``"mapMode": "svg"``, ``"calcUrl": "http://localhost:8000"``, a 28×29 board
(``gameBoardColumns: 28``, ``gameBoardRows: 29``), ``minValue: 0`` / ``maxValue: 375``,
two production types ``id "10"`` (Arable land) and ``id "20"`` (Livestock) each with
``maxElements: 700``, and ``defaultProductionType: "10"``. Its consequence-map ids
(``110``–``113`` for arable, ``120``–``123`` for livestock) are exactly the ids the
calculator returns in ``results[]``.

Abbreviated dynamic game data:

.. code-block:: json

   {
       "title": { "en": "Tradeoff: Example (dynamic)" },
       "mapMode": "svg",
       "imageMode": false,
       "elementSize": 1,
       "gameBoardColumns": 28,
       "gameBoardRows": 29,
       "minValue": 0,
       "maxValue": 375,
       "minSelected": 1,
       "defaultProductionType": "10",
       "calcUrl": "http://localhost:8000",
       "productionTypes": [
           { "id": "10", "fieldColor": "#40916c", "maxElements": 700 },
           { "id": "20", "fieldColor": "#ff9900", "maxElements": 700 }
       ],
       "maps": [
           { "id": "1",   "gameBoardType": "Drawing",    "urlToData": "./assets/images/example_zones.tif" },
           { "id": "999", "gameBoardType": "Background",  "urlToData": "./assets/images/example_background.tif" },
           { "id": "2",   "gameBoardType": "Suitability", "productionTypes": ["10"], "urlToData": "./assets/images/esgame_img_ag.tif" },
           { "id": "110", "gameBoardType": "Consequence", "productionTypes": ["10"], "urlToData": "./assets/images/esgame_img_ag_carbon.tif" }
       ]
   }

.. _calc-contract:

(c) The calculation request and response
========================================

Source: ``GameService.goToNextLevel`` and ``GameService.prepareNextLevel``
(:file:`v2/src/app/services/game.service.ts`),
``CalculationResult`` (:file:`v2/src/app/shared/models/calculation-result.ts`),
``ApiService.postRequest`` (:file:`v2/src/app/services/api.service.ts`),
``examples/esgame-dynamic/calculator/app.py``.

Transport: ``ApiService.postRequest(url, body)`` is ``HttpClient.post(url, body)`` —
an HTTP ``POST`` of JSON to ``Settings.calcUrl``. It only fires on the **last** level
when ``Settings.calcUrl`` is truthy; otherwise ``prepareNextLevel()`` runs purely
client-side.

Request body (``inputData``)
----------------------------

``goToNextLevel`` builds, typed as
``{ allocation: { id: number, lulc: number }[], round: number, score: number, game_id: string }``:

.. list-table::
   :header-rows: 1
   :widths: 18 26 56

   * - Field
     - Type
     - How it is built
   * - ``allocation``
     - ``{ id:number, lulc:number }[]``
     - All board fields = selected ∪ not-selected. For each, ``id`` is
       ``fields[0].id`` (the cell id) and ``lulc`` is the field's
       ``productionType?.id`` **or** ``Settings.defaultProductionType`` when none.
   * - ``round``
     - ``number``
     - ``currentLevel.levelNumber``.
   * - ``score``
     - ``number``
     - Sum of per-board score entries: ``scoreService`` builds empty entries for the
       ``SuitabilityMap`` boards, ``calculateScore`` fills them, then
       ``entries.reduce((a,b) => a + b.score, 0)``.
   * - ``game_id``
     - ``string``
     - ``GameService.gameId``, a ``uuid.v4()`` generated once per game instance.

Example request body:

.. code-block:: json

   {
       "allocation": [
           { "id": 0, "lulc": 10 },
           { "id": 1, "lulc": 20 },
           { "id": 2, "lulc": 10 }
       ],
       "round": 1,
       "score": 42,
       "game_id": "9f1c2b3a-…-uuid-v4"
   }

The example FastAPI calculator (``POST /``) reads ``body.get("allocation", [])`` and
counts ``lulc == "10"`` (arable) vs ``lulc == "20"`` (livestock) — i.e. ``lulc`` must
match the production-type ids in the game data.

Response (``CalculationResult``)
--------------------------------

The frontend casts the response to ``CalculationResult``:

.. code-block:: typescript

   class CalculationResult { results: Result[]; }
   class Result { name: string; id: string; score: number; url: string; }

.. list-table::
   :header-rows: 1
   :widths: 14 12 74

   * - Field
     - Type
     - Meaning
   * - ``results``
     - ``Result[]``
     - One entry per consequence map (plus optionally one ``id == "-1"`` image entry).
   * - ``results[].id``
     - ``string``
     - Matches a ``Consequence`` map ``id`` from the game data. The special id
       ``"-1"`` is the score/summary **image** (e.g. the R spider plot), not a map; the
       id ``"-1"`` is also explicitly filtered out of the score list.
   * - ``results[].name``
     - ``string``
     - Coverage / human name (informational).
   * - ``results[].score``
     - ``number``
     - Per-service score. ``NaN`` is coerced to ``0``. For map entries the level score
       becomes ``-(score * 100)``.
   * - ``results[].url``
     - ``string``
     - The GeoTIFF source URL (a GeoServer WCS GetCoverage ``image/tiff`` URL). Stored
       onto the matching consequence map's ``urlToData``.

How the response is consumed (``prepareNextLevel``, SVG branch):

* ``consequences.forEach(m => m.urlToData = calculationResult.results.find(c => c.id == m.id)?.url!)``
  — each consequence map's ``urlToData`` is set to its result ``url``.
* ``calculationResult.results.forEach(c => c.score = isNaN(c.score) ? 0 : c.score)`` —
  ``NaN`` → ``0``.
* ``level.scores = [{ id:"all", score: previousScore }, ...results.filter(c => c.id != "-1").map(c => ({ score: -((c.score ?? 0)*100), id: c.id }))]``
  — the submitted ``score`` becomes the ``"all"`` entry; each map score is negated and
  scaled by 100.
* ``const image = results.find(c => c.id == "-1")`` — if present,
  ``level.scoreImage = image.url`` (the summary image).

Example response:

.. code-block:: json

   {
       "results": [
           { "id": "110", "name": "ag_carbon",  "score": 0.8, "url": "http://localhost:8080/geoserver/wcs?service=WCS&version=2.0.1&request=GetCoverage&coverageId=esgame__ag_carbon&format=image/tiff" },
           { "id": "111", "name": "ag_habitat", "score": 1.0, "url": "http://localhost:8080/geoserver/wcs?service=WCS&version=2.0.1&request=GetCoverage&coverageId=esgame__ag_habitat&format=image/tiff" },
           { "id": "-1",  "name": "spider_plot","score": 0,   "url": "https://…/images/Spider_plot_Game_<uuid>_Round_1.png" }
       ]
   }

.. _wcs-fetch:

(d) Raster/score results, WCS GetCoverage URLs, and TiffService fetch
=====================================================================

Source: ``examples/esgame-dynamic/calculator/app.py``,
``tools/R/calculator.r``, ``v2/src/app/services/tiff.service.ts``.

The calculator does **not** stream the raster bytes itself. Each ``results[].url`` is a
**GeoServer WCS GetCoverage** URL pointing at a coverage; the browser fetches the
GeoTIFF directly from GeoServer.

WCS GetCoverage URL shape
-------------------------

FastAPI example (``GEOSERVER_PUBLIC_URL`` is the *browser-facing* base, default
``http://localhost:8080/geoserver``, ``WORKSPACE = "esgame"``):

.. code-block:: text

   {GEOSERVER_PUBLIC_URL}/wcs?service=WCS&version=2.0.1&request=GetCoverage
       &coverageId={WORKSPACE}__{coverage}&format=image/tiff

.. list-table::
   :header-rows: 1
   :widths: 24 18 58

   * - Query param
     - Value (example)
     - Notes
   * - ``service``
     - ``WCS``
     -
   * - ``version``
     - ``2.0.1``
     - The FastAPI example uses ``2.0.1``; the R calculator uses ``2.0.0``.
   * - ``request``
     - ``GetCoverage``
     -
   * - ``coverageId``
     - ``esgame__ag_carbon``
     - WCS 2.0 flattens ``workspace:layer`` to ``workspace__layer`` (double underscore).
       The R calculator instead uses ``{ws_name}:{short_name}`` (single colon).
   * - ``format``
     - ``image/tiff``
     - The R calculator URL-encodes ``image%2Fgeotiff``.

The example calculator maps consequence ids → ``(coverage, factor)``:

.. list-table::
   :header-rows: 1
   :widths: 18 22 14 18 28

   * - id
     - coverage
     - factor
     - id
     - coverage / factor
   * - ``110``
     - ``ag_carbon``
     - ``0.8``
     - ``120``
     - ``ranch_carbon`` / ``0.8``
   * - ``111``
     - ``ag_habitat``
     - ``1.0``
     - ``121``
     - ``ranch_habitat`` / ``1.0``
   * - ``112``
     - ``ag_water``
     - ``0.6``
     - ``122``
     - ``ranch_water`` / ``0.6``
   * - ``113``
     - ``ag_hunt``
     - ``0.4``
     - ``123``
     - ``ranch_hunt`` / ``0.4``

Score is ``round(count / total * factor, 3)`` where ``count`` is the number of arable
(ids in ``AG_IDS = {110,111,112,113}``) or livestock allocations and
``total = max(len(alloc), 1)``.

TiffService fetch
-----------------

``GameService.prepareNextLevel`` passes each consequence map's ``urlToData`` (now a WCS
URL) into ``TiffService``. The relevant fetch paths, all using the ``geotiff`` library:

* ``prepareDataUrl(url, …)`` — ``await fetch(url).then(r => r.blob())`` then
  ``fromBlob(blob)`` (the comment notes ``fromURL throws error`` for these). Reads
  ``image.readRasters({ interleave: true })``, ``image.getWidth()``,
  ``image.getHeight()``, ``image.getGDALNoData()``, and renders a colored data-URL via
  the map's gradient/custom colors and ``minValue``/``maxValue``.
* ``tiffToPaths(url)`` / ``tiffToArray(url)`` — ``await fromUrl(url)`` then
  ``image.getImage()`` / ``readRasters``.

The summary-image result (``id == "-1"``, e.g. the spider plot PNG) is shown directly
via ``level.scoreImage`` and is **not** parsed as a GeoTIFF.

.. _geoserver-seed:

(e) GeoServer REST seeding calls
================================

Source: :file:`examples/esgame-dynamic/geoserver/seed.py` and the palettes config
:file:`examples/esgame-dynamic/geoserver/palettes.json`.

``seed.py`` is a one-shot, idempotent job. It targets ``GEOSERVER_URL``
(default ``http://geoserver:8080/geoserver`` — the **internal** service name, not the
browser-facing URL), workspace ``WS = "esgame"``, and authenticates with HTTP Basic
``admin:geoserver``. It registers each :file:`/rasters/*.tif` as an **external** GeoTIFF
coverage (GeoServer references the file in place), creates one raster style per palette,
and sets each coverage's default style.

REST calls made (all under ``GS = GEOSERVER_URL``):

.. list-table::
   :header-rows: 1
   :widths: 10 56 34

   * - Method
     - Path
     - Purpose / body
   * - ``GET``
     - ``/rest/about/version.json``
     - ``wait_for_geoserver`` readiness poll (up to 120 × 2 s).
   * - ``GET``
     - ``/rest/workspaces/{WS}.json``
     - ``exists`` check before creating the workspace.
   * - ``POST``
     - ``/rest/workspaces``
     - Create workspace; body ``<workspace><name>esgame</name></workspace>``
       (``text/xml``).
   * - ``GET``
     - ``/rest/workspaces/{WS}/coveragestores/{name}.json``
     - Skip if the coverage store already exists.
   * - ``PUT``
     - ``/rest/workspaces/{WS}/coveragestores/{name}/external.geotiff?coverageName={name}``
     - Register external GeoTIFF; body ``file:///rasters/{fn}`` (``text/plain``).
   * - ``GET``
     - ``/rest/workspaces/{WS}/styles/{pname}.json``
     - Determine create vs update for a style.
   * - ``POST``
     - ``/rest/workspaces/{WS}/styles?name={pname}``
     - Create style; SLD body (``application/vnd.ogc.sld+xml``).
   * - ``PUT``
     - ``/rest/workspaces/{WS}/styles/{pname}``
     - Update existing style; SLD body (``application/vnd.ogc.sld+xml``).
   * - ``PUT``
     - ``/rest/layers/{WS}:{cov}``
     - Set default style; body
       ``<layer><defaultStyle><name>esgame:{pal}</name></defaultStyle></layer>``
       (``text/xml``).

Styles come from :file:`palettes.json`: ``valueRange`` (``min: 0``, ``max: 125``),
the ``palettes`` color ramps, and ``coverageStyles`` mapping each coverage to a palette
(``ag_carbon → yellow``, ``ag_habitat → purple``, ``ag_water → blue``, ``ag_hunt → red``,
and the ``ranch_*`` equivalents). The SLD ``ColorMap`` quantities are spread evenly over
``[vmin, vmax]``.

R calculator: live GeoServer upload
-----------------------------------

In contrast to the stateless example calculator, :file:`tools/R/calculator.r`
(``POST /esgame``, ``unboxedJSON``) **computes and uploads** rasters per request using
the ``geosapi`` ``GSManager`` (``user = "admin"``, ``pwd = "geoserver"``, base
``Sys.getenv("GEOSERVER", …)``). For each request it:

* parses ``json_in`` / ``req$body`` into ``game_id``, ``round`` (``round_id``),
  ``score``, and ``allocation`` (``map_AG``);
* deletes and re-creates a workspace ``esgame_game{game_id}_round{round_id}``;
* ``uploadGeoTIFF`` + ``createCoverage`` for each result raster;
* returns ``list(results = calculated_rasters)`` where each entry has
  ``name``, ``id``, ``score``, and a ``url`` of the form
  ``{gs_url}/wcs?service=WCS&version=2.0.0&request=GetCoverage&coverageId={ws_name}:{short_name}&format=image%2Fgeotiff``.

The summary entry uses ``id = -1`` and a ``url`` under ``/images/`` (the plumber asset
mount) rather than a WCS URL — matching the frontend's ``id == "-1"`` image handling.

.. _container-wiring:

(f) Container-to-container wiring (service names, ports, env)
=============================================================

Source: :file:`examples/esgame-dynamic/docker-compose.yml`
(project name ``esgame-dynamic-example``). See also :doc:`reference/containers`.

.. list-table::
   :header-rows: 1
   :widths: 16 34 14 36

   * - Service
     - Image
     - Ports (host:container)
     - Key env / volumes
   * - ``frontend``
     - built from ``./frontend`` (``ESGAME_IMAGE``, default
       ``ghcr.io/mlacayoemery/esgame:master``)
     - ``81:80``
     - Bind-mounts ``./frontend/config.json`` →
       ``/usr/share/nginx/html/assets/config.json:ro``. ``depends_on: [calculator]``.
   * - ``calculator``
     - built from ``./calculator`` (FastAPI)
     - ``8000:8000``
     - ``GEOSERVER_PUBLIC_URL=http://localhost:8080/geoserver`` (browser-facing; baked
       into the WCS URLs it returns).
   * - ``geoserver``
     - ``docker.osgeo.org/geoserver:2.28.4``
     - ``8080:8080``
     - ``CORS_ENABLED=true``; volume ``geoserver-data:/opt/geoserver_data``
       (persistent catalog) and ``./geoserver/rasters:/rasters:ro``.
   * - ``geoserver-seed``
     - built from ``./geoserver`` (``seed.py``)
     - *(none)*
     - ``GEOSERVER_URL=http://geoserver:8080/geoserver`` (internal). Mounts
       ``./geoserver/rasters:/rasters:ro`` and ``./geoserver/palettes.json``.
       ``depends_on: [geoserver]``, ``restart: "no"``.

**The two GeoServer URLs.** This split is essential to the data flow:

* The seeder talks to GeoServer over the Docker network by **service name**:
  ``GEOSERVER_URL = http://geoserver:8080/geoserver``.
* The WCS URLs handed to the **browser** must be reachable from the host, so the
  calculator uses ``GEOSERVER_PUBLIC_URL = http://localhost:8080/geoserver`` (the
  published ``8080`` port). The frontend itself is published on host port ``81``.

**Browser-side flow:** browser → ``frontend`` (``:81``) for assets and config;
browser → ``calculator`` (``:8000``, the ``calcUrl``) for the POST; browser →
``geoserver`` (``:8080``) for the WCS GetCoverage GeoTIFFs returned in the response.
``CORS_ENABLED`` on GeoServer and the calculator's permissive CORS middleware
(``allow_origins=["*"]``) make those cross-origin fetches succeed.

See also
========

* :doc:`reference/calculator` — calculator endpoints and scoring detail.
* :doc:`reference/geoserver` — GeoServer setup, coverages, and styling.
* :doc:`reference/containers` — full container/service reference.
