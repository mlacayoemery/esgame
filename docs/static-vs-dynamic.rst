Configuration 2: static grid versus the dynamic example
=======================================================

.. Where this document's section-local :file: paths resolve from; see
.. docs/_checks/check-file-paths.py.
.. file-base: v2/src/assets
.. file-base: examples/esgame-dynamic/frontend/assets/images

esgame ships its flagship scenario, **Configuration 2 — "Tradeoff: Agriculture
Edition"**, in two forms that are deliberately the *same game content shown two
ways*. Comparing them is the clearest way to understand what the GRID/"static" and
SVG/"dynamic" modes actually change, because everything *except* the mode is held
roughly constant.

* **Static Configuration 2** — the client-side grid game published on GitHub Pages.
  Game data: :file:`v2/src/assets/dataGridExample.json`; selected by
  :file:`v2/src/assets/config.json` (``defaultMode: "static"``).
* **The dynamic example** (``examples/esgame-dynamic``) — *the same scenario rebuilt
  for SVG/dynamic mode* with a real backend. Game data:
  :file:`examples/esgame-dynamic/frontend/data.json`; selected by that example's
  mounted :file:`config.json` (``defaultMode: "dynamic"``). Its README states the
  data.json is "built from the static grid data".

.. note::

   "Configuration 2" is the *Static maps* configuration on the start page — the
   grid game (:doc:`reference/frontend-components` ``GridLevelComponent``). The
   dynamic example takes that scenario's data and adapts it to the SVG game
   (``SvgLevelComponent``); it is **not** a different game, it is the same
   allocation problem played through the dynamic pipeline.

.. important::

   There is a **third** form, and it is the one to reach for when the question is
   "the same game, scored by a backend": :file:`v2/src/assets/dataAgDynamic.json`,
   run by ``make esgame-ag-up``. See `The faithful dynamic board`_ below.

   Do not confuse either of these with :file:`v2/src/assets/data.json`, which is a
   **different game** — the six-production-type Dutch/PLACES landscape model on a
   468 × 335 raster, scored by :file:`tools/R/calculator.r`. It shares a title with
   the agriculture game and nothing else, which has misled people before.


At a glance
-----------

.. list-table::
   :header-rows: 1
   :widths: 26 37 37

   * - Aspect
     - Static Configuration 2
     - Dynamic example
   * - Game data file
     - ``assets/dataGridExample.json``
     - ``examples/esgame-dynamic/frontend/data.json``
   * - ``mapMode``
     - ``grid``
     - ``svg``
   * - Board size
     - 28 × 29
     - 28 × 29 (identical)
   * - Production types
     - ``10`` (arable), ``20`` (livestock)
     - ``10`` (arable), ``20`` (livestock) — identical ids
   * - ``elementSize``
     - ``2``
     - ``1``
   * - ``maxElements`` (per type)
     - ``4``
     - ``700``
   * - ``minSelected``
     - *unset* (no gate)
     - ``1``
   * - ``calcUrl``
     - ``""`` (none — scored in the browser)
     - ``http://localhost:8000`` (the FastAPI calculator, which serves ``/``)
   * - ``defaultMode``
     - ``static``
     - ``dynamic``
   * - Maps
     - 2 Suitability + 8 Consequence, rendered as grid cells with client-side
       gradients (no image files)
     - a ``Drawing`` zone map + a ``Background`` + 2 Suitability + 8 Consequence,
       each a georeferenced GeoTIFF
   * - Where rasters come from
     - n/a — there are none
     - GeoServer (WCS ``GetCoverage``), seeded from
       :file:`examples/esgame-dynamic/geoserver/rasters`
   * - Scoring
     - client-side ``ScoreService`` (instant, offline)
     - backend ``POST`` to ``calcUrl`` → ``CalculationResult``
   * - Deployment
     - static files on GitHub Pages (or any web server)
     - ``docker compose``: frontend + calculator + GeoServer + one-shot seeder


What is the same
----------------

Both are the **Agriculture Edition**: the player allocates two production types —
arable land (id ``10``) and livestock (id ``20``) — across the *same* 28 × 29
landscape, weighing suitability against the ecosystem-service consequences (carbon,
habitat, water, hunting). The production-type ids, the board dimensions, the
four-language scaffolding, and the overall "place pieces → advance level → see
consequences" loop are shared. The dynamic example was generated *from* the static
grid data precisely so that the only meaningful variable is the **mode**.


What changes, and why
---------------------

Map representation: cells vs. traced zones
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

In GRID mode the board is a regular lattice of square cells. In SVG mode the
playable units are **zones traced from a raster** (the ``Drawing`` map,
:file:`example_zones.tif`): contiguous pixels of equal value become one polygon.
The static config therefore needs no image files at all — the grid is generated
from ``gameBoardColumns`` × ``gameBoardRows`` — whereas the dynamic example ships a
zone map, a background, and a suitability/consequence GeoTIFF per map. See
:doc:`game-mechanics` for how a "field" is defined in each mode.

Piece granularity: ``elementSize`` and ``maxElements``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The two files set very different piece limits, and that is a direct consequence of
the representation:

* Static: ``elementSize: 2`` and ``maxElements: 4``. A grid "piece" covers a
  2-unit footprint and a player gets only a handful per type — a coarse, board-game
  feel.
* Dynamic: ``elementSize: 1`` and ``maxElements: 700``. SVG zones are fine-grained,
  so a single allocation touches far more units and the per-type cap is raised
  accordingly.

The *mechanism* that fixes the number of pieces is identical (``maxElements`` on the
production type, enforced in ``GameService``); only the values differ. See
:doc:`game-mechanics` for where this is enforced.

Scoring: client-side vs. a backend
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

This is the defining difference.

* Static: ``GameService.goToNextLevel`` never makes a network call — it scores the
  allocation locally with ``ScoreService`` and renders the next level immediately.
  The game is fully offline. This follows from the **mode**, not from ``calcUrl``
  happening to be empty: the grid branch of ``prepareNextLevel`` never reads a
  ``CalculationResult``, so a static deployment that also sets ``calcUrl`` still
  scores in the browser and makes no request. It used to branch the other way round,
  which made a configured backend able to break a game that did not need it.
* Dynamic: ``calcUrl`` points at the calculator, so on each level submit the
  frontend ``POST``\ s the allocation
  ``{ allocation: [{id, lulc}], round, score, game_id }`` and consumes the returned
  ``CalculationResult`` (per consequence map: a ``score`` and a GeoServer WCS
  ``url``). The consequence rasters are then fetched from GeoServer and decoded by
  ``TiffService``. The exact request/response shapes are in :doc:`data-flow`.

.. important::

   ``calcUrl`` is the **endpoint** the browser POSTs to, not the origin the
   calculator runs on. The app passes it to ``HttpClient.post`` unchanged and
   appends no path of its own, and it cannot: the calculators in this repository serve
   different routes on purpose — ``tools/R/calculator.r`` and ``tools/calculator``
   both serve ``/esgame``, the FastAPI example serves ``/``. So a deployment backed by
   either ``/esgame`` calculator must
   set ``CALC_URL`` to ``https://…/esgame``; a value ending at the hostname returns
   404 on every round.

   That 404 is quiet. It goes to the calculator's port, so the frontend's access log
   never sees it, and it is rejected before reaching the handler, so the calculator's
   log does not record it either. The player gets only "Something went wrong, please
   try again later". ``v2/e2e-stack`` exists to catch this: it POSTs to the
   ``calcUrl`` the deployment actually serves, rather than comparing that value with
   the variable it was injected from.

The ``minSelected: 1`` gate in the dynamic example also means a level cannot be
submitted with nothing allocated, whereas the static config sets no minimum.


Deployment contrast
--------------------

The two forms have very different runtime footprints:

* **Static** is just files. The :doc:`Pages deploy <guides/deployer>` uploads the
  built app and it is served from a CDN with no server-side moving parts. One
  ``config.json`` (``calcUrl: ""``) makes it self-contained.
* **Dynamic** is a small system. ``examples/esgame-dynamic/docker-compose.yml``
  brings up four containers — the frontend (port 81), the FastAPI calculator
  (8000), GeoServer (8080), and a one-shot ``geoserver-seed`` job that registers the
  rasters and their colour styles. The frontend is the **same esgame image** with a
  mounted ``config.json`` whose ``CALC_URL`` is injected at start-up; see
  :doc:`reference/containers` and :doc:`reference/geoserver`.

Crucially, the frontend **bundle is byte-for-byte the same** in both cases. Only the
mounted ``config.json`` and ``data.json`` (and, for the dynamic case, the presence of
a backend) differ — which is the whole point of the runtime-config design described
in :doc:`architecture`.


How to run each
---------------

Static Configuration 2:

.. code-block:: sh

   cd v2
   npm ci
   npm start            # http://localhost:4200/  -> the grid game
   # or visit the published build at https://mlacayoemery.github.io/esgame/

The dynamic example:

.. code-block:: sh

   # from the repo root (builds the esgame base image locally):
   make esgame-dynamic-example-up
   # open http://localhost:81/  -> place arable/livestock on the zones, press Next Level.
   # Round 2 shows consequence maps served from GeoServer.
   make esgame-dynamic-example-down


When to use which
-----------------

* Use the **static** form for teaching, demos, and wide distribution: zero
  infrastructure, instant scoring, works offline, hostable on any static site.
* Use the **dynamic** form when scoring must come from real models and georeferenced
  data — the example is the template that real deployments such as **places**
  specialize, swapping the toy FastAPI calculator for a full R/InVEST engine and the
  example rasters for real geodata. See :doc:`architecture` and
  :doc:`guides/deployer`.


The faithful dynamic board
--------------------------

:file:`v2/src/assets/dataAgDynamic.json` is the agriculture game in SVG mode, scored
by :doc:`reference/static-calculator` — the same model the grid game is checked
against. ``make esgame-ag-up``; no GeoServer, because this game's cost surfaces are
fixed and there is nothing to publish.

It differs from the dynamic example, which is a self-contained demo answered by a
FastAPI stand-in, in being *faithful* rather than merely similar:

.. list-table::
   :header-rows: 1
   :widths: 24 38 38

   * - Aspect
     - Dynamic example
     - ``dataAgDynamic.json``
   * - Scored by
     - a stand-in FastAPI calculator
     - ``tools/calculator``, the static game's own model
   * - Consequence map ids
     - ``110``–``113``, ``120``–``123``
     - ``4``–``11``, **the static dataset's ids**
   * - ``elementSize`` / ``maxElements``
     - ``1`` / ``700``
     - ``2`` / ``4`` — the grid game's piece and budget
   * - Drawing raster
     - its own zones
     - one zone per **cell**, numbered by raster index
   * - Colouring
     - stretched over ``minValue``–``maxValue``
     - ``paletted``: one palette entry per class, as the grid board does

The drawing raster matters more than it looks. Numbering a zone by its row-major
raster index puts the board in the id space ``GameService.getAssociatedFields`` does
its ``id + j * columns`` arithmetic in, so a piece may be anchored on **any** cell and
slides back on at the edges — the grid game's placement exactly, rather than snapping
to a lattice of 2 × 2 zones.

``paletted`` is a dataset flag rather than a guess. These rasters hold a handful of
classes and run to 375 against a declared maximum of 100, so stretching them clipped
every value above 100 to one colour; the grid board never had this because it ignores
``minValue``/``maxValue`` and gives each distinct value a palette entry. The flag also
switches the raster to nearest-neighbour scaling, since interpolating classified data
invents colours the legend does not list.

Cell index 0 — the top-left — is a normal zone with an outline, like any other. It was
not always: ``tiffToSvgPaths`` hard-coded ``0`` as its structural sentinel, so the cell
numbered 0 had no path, no outline and could not be built on. The fix was to let the
caller name the sentinel (``undefinedValue``, from the raster's own ``GDAL_NODATA``)
**and** to fill the tracer's border with that same value. Changing only the first hangs
the tracer outright — 812 groups in 11 ms against a run that never returns, measured —
because the border it walks is then made of what it is looking for.
