Configuration 2: static grid versus the dynamic example
=======================================================

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
     - ``http://localhost:8000`` (the FastAPI calculator)
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

* Static: ``calcUrl`` is empty, so ``GameService.goToNextLevel`` never makes a
  network call — it scores the allocation locally with ``ScoreService`` and renders
  the next level immediately. The game is fully offline.
* Dynamic: ``calcUrl`` points at the calculator, so on each level submit the
  frontend ``POST``\ s the allocation
  ``{ allocation: [{id, lulc}], round, score, game_id }`` and consumes the returned
  ``CalculationResult`` (per consequence map: a ``score`` and a GeoServer WCS
  ``url``). The consequence rasters are then fetched from GeoServer and decoded by
  ``TiffService``. The exact request/response shapes are in :doc:`data-flow`.

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
