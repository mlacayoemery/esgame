================================
Calculator backends (reference)
================================

.. Where this document's section-local :file: paths resolve from; see
.. docs/_checks/check-file-paths.py.
.. file-base: v2/src
.. file-base: examples/esgame-dynamic
.. file-base: examples/esgame-dynamic/geoserver

The **dynamic** (SVG) mode of the esgame frontend posts each level submission to
a *calculator* backend at the URL given by ``calcUrl`` in
:file:`assets/config.json`. The calculator turns a land-use allocation into one
raster per ecosystem-service "consequence" map, publishes those rasters as
GeoServer coverages (or, in the toy example, points at pre-seeded coverages), and
returns, for each consequence-map id, a numeric ``score`` plus a WCS
``GetCoverage`` ``url`` the browser fetches to draw the result layer.

Two implementations exist:

* a **minimal FastAPI example**
  (:file:`esgame/examples/esgame-dynamic/calculator/app.py`) — stateless, no
  raster maths, no GeoServer writes; it only echoes scores and URLs of
  pre-seeded coverages. It documents the request/response contract.
* the **real R plumber engines** — the legacy
  :file:`esgame/tools/R/calculator.r` and the production deployment fork
  :file:`places/calculation/calculation.r` — which run the full
  ecosystem-service model, write GeoTIFFs to disk, and publish a fresh
  GeoServer workspace per game/round.

All three speak the same JSON shape: a request carrying an ``allocation`` and a
response of the form ``{"results": [ {id, name, score, url}, ... ]}``.

.. contents:: On this page
   :local:
   :depth: 2


The request/response contract
==============================

Request
-------

The frontend POSTs a JSON body. Fields consumed across the backends:

.. list-table::
   :header-rows: 1
   :widths: 18 14 68

   * - Field
     - Type
     - Meaning
   * - ``allocation``
     - array
     - The player's land-use map. In the FastAPI example, an array of objects
       each carrying an ``lulc`` code (read as a string: ``"10"`` = agriculture,
       ``"20"`` = ranch). In the R engines it is passed straight into
       ``raster::reclassify(LU_hexa, map_AG, ...)`` as the reclassification
       matrix that recodes the base hexagon raster. Each entry's ``id`` is the
       hexagon's **raster value**, not a positional index — SVG field ids come
       from ``tiffToSvgPaths``, which keys on the pixel value. See
       :ref:`allocation-id-space` for which ids are yours to allocate.
   * - ``game_id``
     - scalar
     - Game identifier; used by the R engines for output filenames and the
       GeoServer workspace name. *(R only.)*
   * - ``round``
     - scalar
     - Round identifier; same uses as ``game_id``. *(R only.)*
   * - ``score``
     - scalar / object
     - Prisoner's-dilemma score (``score_PD``) carried through the R engines but
       not used in the raster maths. *(R only.)*

Response
--------

A JSON object ``{"results": [...]}``. Each element:

.. list-table::
   :header-rows: 1
   :widths: 14 12 74

   * - Field
     - Type
     - Meaning
   * - ``id``
     - string / int
     - Consequence-map id, matched against the frontend's ``data.json``.
   * - ``name``
     - string
     - Coverage / file name (without extension in the R engines' WCS URL).
   * - ``score``
     - number
     - Per-consequence score, 0–100 in the R engines, 0–1 (× factor) in the
       example.
   * - ``url``
     - string
     - GeoServer WCS ``GetCoverage`` URL. (places' ``calculation.r`` still returns an
       ``/images/`` static-asset URL for its spider plot; esgame's ``calculator.r`` stopped
       rendering one on 2026-08-07 — see below.)


FastAPI example (``app.py``)
============================

:file:`esgame/examples/esgame-dynamic/calculator/app.py` — a ``FastAPI`` app
titled ``"esgame example calculator"`` with permissive CORS
(``allow_origins=["*"]``). It is deliberately **stateless**: it does *not* seed
GeoServer (that is the separate one-shot :file:`geoserver/seed.py`) and never
writes rasters. It just returns scores and URLs for coverages that GeoServer
already serves.

Module-level configuration
---------------------------

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Name
     - Value / source
   * - ``GEOSERVER_PUBLIC_URL``
     - ``os.environ.get("GEOSERVER_PUBLIC_URL", "http://localhost:8080/geoserver")``
       — the browser-facing GeoServer base URL.
   * - ``WORKSPACE``
     - ``"esgame"`` — the workspace the seeded coverages live in.
   * - ``CONSEQUENCES``
     - dict mapping consequence-map id → ``(coverage name, factor)``.
   * - ``AG_IDS``
     - ``{"110", "111", "112", "113"}`` — the ids treated as agriculture.

The ``CONSEQUENCES`` table (id → coverage, per-service score factor):

.. list-table::
   :header-rows: 1
   :widths: 12 26 14 14

   * - id
     - coverage
     - factor
     - group
   * - ``110``
     - ``ag_carbon``
     - 0.8
     - ag
   * - ``111``
     - ``ag_habitat``
     - 1.0
     - ag
   * - ``112``
     - ``ag_water``
     - 0.6
     - ag
   * - ``113``
     - ``ag_hunt``
     - 0.4
     - ag
   * - ``120``
     - ``ranch_carbon``
     - 0.8
     - ranch
   * - ``121``
     - ``ranch_habitat``
     - 1.0
     - ranch
   * - ``122``
     - ``ranch_water``
     - 0.6
     - ranch
   * - ``123``
     - ``ranch_hunt``
     - 0.4
     - ranch

Endpoints
---------

``GET /`` — ``health()``
~~~~~~~~~~~~~~~~~~~~~~~~~~

* **Signature:** ``def health()``
* **Inputs:** none.
* **Output:** ``{"status": "ok"}``.
* **Side effects:** none.

``POST /`` — ``calculate(req: Request)``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

* **Signature:** ``async def calculate(req: Request)``
* **Inputs:** JSON body ``{"allocation": [...]}``. Each allocation entry is
  inspected for ``a.get("lulc")``.
* **Logic:**

  * ``n_ag`` = count of entries with ``str(lulc) == "10"``.
  * ``n_ranch`` = count of entries with ``str(lulc) == "20"``.
  * ``total = max(len(alloc), 1)`` (guards divide-by-zero).
  * For each ``cid, (coverage, factor)`` in ``CONSEQUENCES``: ``count`` is
    ``n_ag`` if ``cid in AG_IDS`` else ``n_ranch``;
    ``score = round(count / total * factor, 3)``.

* **WCS URL construction** (per result)::

    {GEOSERVER_PUBLIC_URL}/wcs?service=WCS&version=2.0.1&request=GetCoverage
    &coverageId={WORKSPACE}__{coverage}&format=image/tiff

  Note the **double underscore** separator (``esgame__ag_carbon``) and WCS
  ``version=2.0.1``.

* **Output:** ``{"results": [{"id", "name", "score", "url"}, ...]}``.
* **Side effects:** none — no files written, no GeoServer mutation.

This example is the contract reference. Everything below is the real engine that
actually computes and publishes the rasters.


R plumber engines
=================

Both R files are `plumber <https://www.rplumber.io/>`_ APIs. They share a common
skeleton and diverge in the science. Each begins by installing ``geosapi`` from
GitHub (``remotes::install_github('eblondel/geosapi')``) and defines:

* a ``cors`` filter (``#* @filter cors``) setting
  ``Access-Control-Allow-Origin: *`` and short-circuiting ``OPTIONS``
  preflight with status 200;
* a static asset mount ``#* @assets /app/data /images`` so written PNGs/TIFFs
  are reachable under ``/images/``;
* the ``#* @post /esgame`` endpoint with ``#* @serializer unboxedJSON``.

:file:`places/calculation/calculation.r` additionally sets
``options("plumber.port" = 5555)`` and imports ``landscapemetrics`` and
``terra`` on top of the legacy stack.

``esgame(req, json_in='{}')`` — the ``POST /esgame`` endpoint
-------------------------------------------------------------

* **Plumber annotations:** ``#* @post /esgame`` and
  ``#* @serializer unboxedJSON``.
* **Signature:** ``esgame <- function(req, json_in='{}')``.
* **Inputs:** the request ``req``; optionally a ``json_in`` string. If
  ``json_in`` is non-empty (not ``''`` or ``'{}'``) it is parsed with
  ``jsonlite::fromJSON(json_in, simplifyVector = T)``; otherwise the fields are
  read from ``req$body``. Either way it extracts:

  * ``game_id``  ← ``game_id``
  * ``round_id`` ← ``round``
  * ``score_PD`` ← ``score``
  * ``map_AG``   ← ``allocation``

* **GeoServer URL source:** two addresses, and they are not interchangeable.

  * ``GEOSERVER`` — server-to-server. Coverages are published over GeoServer's REST
    API from inside the cluster, so this is the in-cluster Service name.
    ``calculator.r`` reads
    ``Sys.getenv("GEOSERVER", "http://localhost:8080/geoserver")``;
    ``calculation.r`` reads ``Sys.getenv("GEOSERVER")`` (no default).

    **The default is local since 2026-08-15, and it used to be a third-party host** —
    ``https://esgame-geoserver.azurewebsites.net/geoserver``. A deployment that said
    nothing therefore tried to publish every round to a server this repository does
    not control, and handed the browser URLs there. The v2 compose stack did exactly
    that until the same day. A wrong local address fails where the operator can see
    it; a wrong remote one does not.
  * ``GEOSERVER_PUBLIC_URL`` — browser-facing. The WCS ``GetCoverage`` URLs in the
    response are built from this and fetched by the **client**, which cannot resolve
    a Service name. Both R engines default it to ``GEOSERVER`` and log a warning, so
    an existing single-address deployment is unchanged; set it to the geoserver
    ingress host. Leave it equal and every round still returns ``200`` — with
    coverage URLs nothing outside the cluster can load.

* **Where a round's rasters go:** ``ESGAME_PUBLISH``, one of three, **stated rather than
  inferred**, and the URL scheme in the response says which one produced it.

  ================  =================================================  ==========================
  Mode              Rasters go                                         ``url`` in the response
  ================  =================================================  ==========================
  ``geoserver``     published over GeoServer's REST API (the default)   ``http(s)://`` WCS
  ``fileserver``    written to ``ESGAME_FILES_DIR``, served by others   ``http(s)://…/name.tif``
  ``files``         written to ``ESGAME_FILES_DIR``, nothing serving    ``file:///…/name.tif``
  ================  =================================================  ==========================

  The mode is explicit because inferring it from whichever variables happen to be set is how a
  deployment ends up in a mode nobody chose — setting ``ESGAME_FILES_DIR`` does **not** quietly
  switch a GeoServer deployment over. ``fileserver`` additionally requires ``ESGAME_FILES_URL``,
  which is the address the *browser* asks for the rasters at and is not the directory they are
  written to; the two are as different as ``GEOSERVER`` and ``GEOSERVER_PUBLIC_URL``, and
  ``publish.R`` refuses an ``ESGAME_FILES_URL`` that is not ``http(s)://``.

  The file modes are cheap because the five GeoTIFFs **already exist** before anything is
  published: ``calculate()`` writes them with ``writeRaster()`` and only then uploads them. A file
  publisher copies what is already there and builds a different URL.

  ``ESGAME_FILES_DIR`` is deliberately not ``/app/data``. That directory holds the base raster and
  ``bounds.json``, and serving it would publish the calculator's inputs alongside its outputs —
  which is why ``#* @assets /app/data /images`` was removed from ``calculator.r`` in the first
  place. The image ships ``/srv/rounds`` owned by uid 10001 so a docker named volume mounted there
  is writable; a volume takes its ownership from the image directory it covers, unlike a
  Kubernetes ``emptyDir``, which is root-owned regardless and needs ``fsGroup``.

  Everything is checked at startup — an unknown mode, a missing directory, a directory that cannot
  be created or written, a ``fileserver`` with no URL. A publisher that is wrong is wrong on every
  round, and the score is computed *before* anything is published, so the failure would otherwise
  be a ``200`` carrying five URLs that fetch nothing.

  :file:`v2/docker-compose.files.yml` is the stack with no GeoServer at all: the calculator writes
  into a named volume and the frontend's own nginx serves it at ``/rounds``. It layers on
  :file:`v2/docker-compose.yml` alone rather than on the dynamic overlay, because Compose can add
  services to a merged stack but not remove them.

* **GeoServer credentials:** ``GEOSERVER_USER`` and ``GEOSERVER_PASSWORD``, both
  **mandatory with no default** since 2026-08-15. ``calculator.r`` refuses to start
  without them, naming whichever is missing.

  They were hardcoded as ``admin``/``geoserver`` once, then defaulted to it with a
  warning. That is the stock GeoServer credential, and guessing it is what turned
  publishing to the wrong host into an *attempt* rather than an obvious failure.
  ``deploy/k8s`` injects both from the ``esgame-geoserver-admin`` Secret;
  :file:`v2/docker-compose.dynamic.yml` states them for the local stack, where they
  genuinely are the stock values — saying so out loud is the point.

  Enforced by :file:`.github/workflows/manifests.yml`, which fails a PR if the two
  ConfigMap values are equal, if the public one names the Service, if the calculation
  container does not receive it, or if ``raster_url`` is built from ``gs_url`` again.

* **Output:** delegates to and returns
  ``calculate(req, geoserver_url, game_id, round_id, score_PD, map_AG)``.
* **Side effects:** none directly — all work happens in ``calculate``.

``calculate(req, geoserver_url, game_id, round_id, score_PD, map_AG)``
----------------------------------------------------------------------

The engine. It ``setwd("/app/data")``, reads the base raster
``LU_and_NEW_hexa.tif`` and reclassifies it with the player's allocation
(``LU_complete <- reclassify(LU_hexa, map_AG, right=F)``), runs one model block
per ecosystem service, writes one normalised GeoTIFF per service, renders a
spider-plot PNG, and uploads everything to a fresh GeoServer workspace.

**Land-use class codes** (shared by both engines):

.. list-table::
   :header-rows: 1
   :widths: 30 14 56

   * - Variable
     - Code
     - Land use
   * - ``ext_arable``
     - 10
     - extensive arable
   * - ``ext_livest``
     - 20
     - extensive livestock
   * - ``int_arable``
     - 30
     - intensive arable
   * - ``int_livest``
     - 40
     - intensive livestock
   * - ``agropark``
     - 50
     - agropark
   * - ``add_nat``
     - 60
     - additional nature

Outputs and consequence-map ids
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Each model block builds a normalised raster, writes it with
``writeRaster(..., overwrite=TRUE, NAflag=-9999)`` to a file named
``<PREFIX>_Game_<game_id>_Round_<round_id>.tif``, and records a list
``{name, id, score}``.

**The raster and the score are on different scales, deliberately** (*2026-08-07*). The published
raster is still rescaled to the round's own min and max, because what it answers is *where,
within this round*, the consequence falls. The **score** is the mean of the **raw** masked
concentration against **fixed per-indicator bounds** from :file:`tools/R/bounds.json`, because
what it answers is *how this round compares to another one* — a question the round's own range
cannot answer.

.. code-block:: text

   score_HH <- esgame_score(values(HH), bounds$HH$lo, bounds$HH$hi)   # tools/R/model.R

The bounds are derived from the deployment's own base raster by
:file:`tools/R/derive-bounds.R`, which sweeps two extreme allocations — every hexagon nature
(no sources, so exposure is zero) and every hexagon agropark (the largest amplitude). See
:doc:`../verification-status` for what the previous round-relative scoring got wrong, which
included ranking the most intensive agriculture as *better* for human health than the least.

The two engines compute **different services and ids**.

:file:`tools/R/calculator.r` (legacy / 5 services):

.. list-table::
   :header-rows: 1
   :widths: 12 28 12 48

   * - Prefix
     - Service (``*_info``)
     - id
     - Normalisation / scoring
   * - ``HH``
     - human health
     - 11
     - raster min–max ×100; ``score = esgame_score(values(HH), 0, 32.472)``
   * - ``NP``
     - nutrient pollution
     - 22
     - raster min–max ×100; score against ``[0, 38.2291]``
   * - ``WA``
     - water availability
     - 33
     - raster min–max ×100; score against ``[0, 51.2589]``
   * - ``HC``
     - habitat cohesion
     - 44
     - raster min–max ×100; score against ``[0, 35.26]``
   * - ``RV``
     - recreational value
     - 55
     - raster min–max ×100; score against ``[0, 32.2197]``

In ``calculator.r`` the "model" is a single shared air-concentration surface
``airconctot = airconc10 + airconc20 + airconc30 + airconc40 + airconc50`` (per
agriculture type, ``factor * exp(-0.005 * distance)`` with factors 10/40/70/100/130),
masked to a different ``LU_complete`` class per service (HH where ``!= 2``,
NP where ``!= 5``, WA where ``!= 4``, HC where ``!= 7``, RV where ``!= 6 & != 8``).
The upload list order is ``list(hh_info, wa_info, hc_info, np_info, rv_info, plot_info)``.

:file:`places/calculation/calculation.r` (production / 6 services):

.. list-table::
   :header-rows: 1
   :widths: 12 30 10 48

   * - Prefix
     - Service (``*_info``)
     - id
     - Normalisation (worst/best case)
   * - ``HH``
     - human health (PM2.5)
     - 11
     - ``(HH-0)/(4.2-0)*100``, capped at 100; ``score = round(mean/54*100, 0)``
   * - ``NP``
     - nutrient pollution (NH3 deposition)
     - 22
     - ``/(180)*100``, capped; ``score = round(mean/34*100, 0)``
   * - ``WE``
     - surface-water eutrophication
     - 33
     - ``/(180)*100``, capped; ``score = round(mean/38*100, 0)``
   * - ``WA``
     - water availability
     - 44
     - ``/(70)*100``; ``score = round(mean/25*100, 0)``
   * - ``HC``
     - habitat cohesion
     - 55
     - ``(tot-optimal)/(worst-optimal)*100``; ``score = round(mean/100*100, 0)``
   * - ``RV``
     - recreational value
     - 66
     - ``(1-RV_round)*100``; ``score = round(mean/85*100, 0)``
   * - ``Spider_plot``
     - spider plot PNG
     - -1
     - see below

``calculation.r`` is the full scientific model. Highlights:

* It also writes the reclassified land-use map itself
  (``LU_Game_<game_id>_Round_<round_id>.tif``) before the service blocks.
* **Human health (HH):** distance-decay of PM2.5 (and NH3 for NP) per
  agriculture type, with per-type emission factors; large patches (>350 by the
  ``lsm_p_para`` perimeter–area ratio test) are counted twice via the
  ``landscapemetrics::get_patches`` / ``lsm_p_para`` path. Masked to urban
  (``LU_complete == 2``).
* **Nutrient pollution (NP):** summed NH3 deposition, masked to nature classes
  (``5,6,7,8,60``).
* **Water eutrophication (WE):** reads ``soil_groups_hexa.tif``,
  ``trace_numbers.csv``, ``trace.tif``, ``distance_weight_trace.tif``,
  ``Water_points_ID_raster.tif``; distance-weighted leaching mass aggregated per
  sub-watershed with ``zonal`` and retention, then a 15×15 ``focal`` mean.
* **Water availability (WA):** reads ``gvg_hexa_raster.tif`` and
  ``sensi_GW_patch.tif``; per agriculture-type × GVG-class distance-decay
  extraction surfaces, multiplied by the groundwater-sensitivity mask.
* **Habitat cohesion (HC):** reads ``fix_nature_patches.tif``,
  ``fixed_HC_score.tif``, ``optimalHC_score.tif``, ``worstHC_score.tif`` and
  ``buffer_list.csv``; per-patch similarity index summed over buffer rings.
* **Recreational value (RV):** in-situ recreation quality reclass plus
  buffered "radiation" surfaces (``buffer(..., width=2500)``) for agropark,
  intensive livestock and additional nature.
* The upload list order is
  ``list(hh_info, np_info, we_info, wa_info, hc_info, rv_info, plot_info)``.

Spider plot
~~~~~~~~~~~

**esgame's** :file:`tools/R/calculator.r` no longer renders one (*2026-08-07*). The chart is
drawn in the browser by ``SpiderChartComponent`` from the five scores the response already
carries, so there is no PNG, no ``@assets`` mount, and no sixth ``id == -1`` result. See
:doc:`../verification-status` for why the pod-local file had to go — it is what stopped the
calculation deployment being scaled.

**places'** ``calculation.r`` still does. It renders a polar ``ggplot`` bar chart of the
per-service scores against a background max of 100 and saves it as
``Spider_plot_Game_<game_id>_Round_<round_id>.png`` (transparent background, 5×5 cm,
``res=900``). Labels are drawn with ``grid.text``. The plot is recorded as
``plot_info <- list('name' = plot_name, 'id' = -1)`` and, because its ``id`` is ``-1``, is
**not** uploaded to GeoServer; instead its ``url`` is built as a static asset:

.. code-block:: r

   paste0(req$rook.url_scheme, "://", req$HTTP_HOST, "/images/", name)

which names whatever host the request happened to arrive on — the same defect the coverage
URLs had before ``GEOSERVER_PUBLIC_URL`` split them.

GeoServer upload (side effects)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Both engines connect with ``geosapi``:

.. code-block:: r

   gsman <- GSManager$new(url = gs_url, user = "admin", pwd = "geoserver", logger = NULL)

Then, **per game/round**, they recreate a dedicated workspace:

* ``ws_name <- paste0("esgame_game", game_id, "_round", round_id)``
* ``gsman$deleteWorkspace(ws_name, recurse = TRUE)`` — drops any prior workspace
  (and its coverages) for this game/round.
* ``gsman$createWorkspace(ws_name, <uri>)`` — namespace URI is
  ``https://esgame.unige.ch/<ws_name>`` in ``calculator.r`` and
  ``paste0(geoserver_url, ws_name)`` in ``calculation.r``.

For every raster entry (``id != -1``), with ``short_name`` = file name minus the
``.tif`` extension:

* ``gsman$uploadGeoTIFF(ws = ws_name, cs = short_name, endpoint = "file",
  configure = "none", update = "overwrite", filename = "<dir>/<name>")`` —
  uploads the GeoTIFF.
* a ``GSCoverage`` is built (name, native name, title, description, three
  keywords, two ``GSMetadataLink`` entries) with:

  * SRS / native CRS ``EPSG:28992`` (``raster_epsg <- 28992``),
    ``ProjectionPolicy = FORCE_DECLARED``;
  * lat/lon bounding box (EPSG:4326) ``5.0332222794293484,
    51.5304424429716477, 5.7127527056648306, 51.8315979727805569``;
  * native bounding box from ``xmin/ymin/xmax/ymax`` of ``LU_complete``.

* ``gsman$createCoverage(ws = ws_name, cs = short_name, coverage = cov)`` —
  publishes the coverage.
* the result ``url`` is the WCS ``GetCoverage`` link:

  .. code-block:: text

     <gs_url>/wcs?service=WCS&version=<V>&request=GetCoverage&coverageId=<ws_name>:<short_name>&format=image%2Fgeotiff

  with WCS ``version=2.0.0`` in ``calculator.r`` and ``2.0.1`` in
  ``calculation.r``. Note the **single colon** ``<ws_name>:<short_name>`` and
  ``format=image/geotiff`` (URL-encoded), versus the example's ``__`` separator
  and ``format=image/tiff``.

* **Return value:** ``list(results = calculated_rasters)`` — the list of
  ``{name, id, score, url}`` entries — one per service, plus the spider plot in
  ``calculation.r`` only — serialised as unboxed JSON.

**Filesystem side effects (per call):** writes one ``.tif`` per service (plus
``LU_*.tif`` in ``calculation.r``) and one ``Spider_plot_*.png`` into
:file:`/app/data`. **GeoServer side effects (per call):** deletes and recreates
the ``esgame_game<game_id>_round<round_id>`` workspace and publishes one coverage
per service raster into it.


Example vs. real engine — summary
=================================

.. list-table::
   :header-rows: 1
   :widths: 30 33 37

   * - Aspect
     - FastAPI ``app.py``
     - R ``calculator.r`` / ``calculation.r``
   * - Endpoint
     - ``GET /`` (health), ``POST /``
     - ``POST /esgame``
   * - Raster maths
     - none (constant factors only)
     - full ecosystem-service model
   * - Files written
     - none
     - GeoTIFFs + spider PNG in :file:`/app/data`
   * - GeoServer writes
     - none (reads pre-seeded coverages)
     - per-round workspace + coverages
   * - Workspace
     - fixed ``esgame``
     - ``esgame_game<game_id>_round<round_id>``
   * - Coverage id in URL
     - ``esgame__<coverage>`` (``__``)
     - ``<ws_name>:<short_name>`` (``:``)
   * - WCS version / format
     - 2.0.1 / ``image/tiff``
     - 2.0.0 (legacy) or 2.0.1 / ``image/geotiff``
   * - Services / ids
     - 8 ids (110–113, 120–123)
     - 5 ids (11/22/33/44/55) or 6 ids (11/22/33/44/55/66)
   * - Score range
     - 0–1 × factor
     - 0–100

.. _allocation-id-space:

Which hexagons may be allocated
--------------------------------

The board raster and the calculator's base raster are **not** the same id space, and
the difference matters.

.. list-table::
   :header-rows: 1
   :widths: 42 16 42

   * - Raster
     - Distinct ids
     - Role
   * - ``New_hexagons.tif`` (the ``Drawing`` map)
     - 465
     - The playable board: ``100``, ``200`` … ``46500``, in hundreds. These are the
       ids the frontend sends.
   * - ``LU_and_NEW_hexa.tif`` — **data release**
     - 472
     - The same 465, **plus 7** low values (``2``–``8``).
   * - ``LU_and_NEW_hexa.tif`` — **committed in the repos**
     - 462
     - ``10``–``474`` consecutive, plus the same 7. A **different id space** — see below.

Those seven extra values are fixed landscape features, not playable hexagons. The
frontend never allocates them, and neither should anything else calling this endpoint:
reclassifying them to a production-type code overwrites the features the model scores
against.

.. warning::

   **There are two different rasters called** ``LU_and_NEW_hexa.tif``, and only one of them
   shares an id space with the board.

   The copy committed at :file:`v2/src/assets/images/LU_and_NEW_hexa.tif` (and identically at
   places' ``frontend/assets/images/``) numbers its hexagons ``10``–``474`` consecutively.
   The board numbers its own ``100``–``46500`` in hundreds. **Exactly 4 ids overlap**
   (``100``, ``200``, ``300``, ``400``) out of 465 — the two rasters share an extent and a
   100 m resolution, and nothing else.

   Only the copy in the **data release** (the one ``places/scripts/fetch-geodata.sh``
   fetches) uses the board's numbering, and it is the one a deployment must supply.

   Feeding the committed copy a real frontend allocation therefore does not fail — the
   request returns ``200``, the rasters are produced and published, the scores are finite —
   it just reclassifies 4 hexagons out of 465 and silently leaves the rest untouched. Measured
   on 2026-07-30 against ``tools/R``. The committed copy is fine for exercising the plumbing
   and useless for a real game; do not read a green round against it as the model working.

Doing so does not fail — the request still returns ``200``, the rasters are still
produced, published and served. **Every score comes back ``NaN``.**

Measured against ``tools/R`` on 2026-07-30, the same 465 board ids under three different
land-use patterns, against each raster in turn:

.. list-table::
   :header-rows: 1
   :widths: 22 22 56

   * - ``LU_and_NEW_hexa.tif``
     - Allocation
     - HH / NP / WA / HC / RV
   * - committed (462)
     - mixed 6 types
     - 42 / 45 / 48 / 50 / 44
   * - committed (462)
     - all ``10`` (arable)
     - 42 / 45 / 48 / 50 / 44
   * - committed (462)
     - all ``60`` (nature)
     - 42 / 45 / 48 / 50 / 44
   * - release (472)
     - mixed 6 types
     - 14 / 14 / 20 / 16 / 14
   * - release (472)
     - all ``10`` (arable)
     - 49 / 53 / 73 / 50 / 48
   * - release (472)
     - all ``60`` (nature)
     - ``NaN`` × 5

Read the top three rows carefully. Against the committed raster the scores are **identical
under every allocation** — the player's choices change nothing, because only 4 of their 465
ids exist in that raster. ``42 / 45 / 48 / 50 / 44`` is not a result; it is that raster's
constant. Earlier revisions of this page quoted it as evidence of a working round.

Against the release raster the same three allocations give three different answers, which is
what a responsive model looks like. Note also that an all-``60`` (Extra Nature everywhere)
allocation — a legal move — returns ``NaN`` there; the agricultural indicators have no
agriculture left to score.

So a round that ignores its input looks exactly like one that worked, and so does a silently
unscored one. **Two checks are worth more than reading the scores:** vary the allocation and
confirm the numbers move, and confirm they are numbers at all.
