=========================================
Static or dynamic, grid or SVG: two axes
=========================================

.. Where this document's section-local :file: paths resolve from; see
.. docs/_checks/check-file-paths.py.
.. file-base: v2/src/assets
.. file-base: v2/src/assets/images
.. file-base: examples

A game in esgame is described by **two independent characteristics**, and conflating them is the
single most reliable source of confusion in this repository:

**Type of data** — where the numbers for the next round come from.
   *Static*: the browser has everything it needs. The rasters ship with the game and
   ``ScoreService`` scores the allocation locally.

   *Dynamic*: a calculator scores the round. The browser POSTs its allocation and gets back a
   score per indicator and a URL per consequence raster, which become the next level's boards.

**Unit selection** — what a player clicks.
   *Raster grid*: a lattice of square cells generated from ``gameBoardColumns`` ×
   ``gameBoardRows``. No geometry files; the board is implied by two numbers.

   *Vector SVG*: polygons traced from a zone raster (the ``Drawing`` map) by
   :file:`v2/src/app/shared/helpers/svg/tiffToSvgPaths.js`. One path per distinct raster value.

The two are orthogonal **as ideas**. They are not orthogonal **in this implementation**, and that
is worth stating plainly rather than discovering:

.. list-table::
   :header-rows: 1
   :widths: 20 40 40

   * -
     - Raster grid units
     - Vector SVG units
   * - **Static data**
     - :file:`dataStaticGridRect.json` — the shipped grid game, playable from a file with no
       network at all.
     - **Not reachable.** ``GameService.goToNextLevel`` refuses: an SVG game with no ``calcUrl``
       alerts *"This game needs a calculation backend, and none is configured."*
   * - **Dynamic data**
     - **Not implemented.** The same function only POSTs when ``mode == 'SVG'``; the GRID branch
       of ``prepareNextLevel`` builds its boards from local rasters and never reads a
       ``CalculationResult``.
     - :file:`dataDynamicGridRect.json` (this game), and :file:`v2/src/assets/data.json` /
       :file:`v2/src/assets/dataRect.json` (the six-type Dutch model).

**A vector-SVG unit is one zone.** ``elementSize`` greater than 1 groups cells by stepping
through ``gameBoardColumns`` (``GameService.getAssociatedFields``), so it means something only
where the zones are laid out as a rectangular grid -- which is what the *GridRect* in
:file:`dataDynamicGridRect.json` records. That board is 812 zones, one per cell of 28 x 29,
selected two-by-two so a piece matches the grid game's. A board of irregular zones, such as the
465 hexagons of :file:`v2/src/assets/data.json`, must leave ``elementSize`` at 1, and nothing in
the data would catch it if it did not.

Both empty cells trace to one function, ``GameService.goToNextLevel``, and each was a deliberate
fix rather than an oversight: the GRID branch stopped POSTing because a stack that set ``CALC_URL``
without ``DEFAULT_MODE`` served the client-side grid game wired to a calculator, gaining nothing
but a way to fail; the SVG branch started refusing because without a backend it fetched
placeholder consequence URLs, they 404'd, and the player got a spinner that never cleared.

So today **the mode is the axis**, and the names of the two shipped examples say so. What the
names do *not* say is that the data type is settled by the **deployment**, not by the dataset:
``calcUrl`` is a ``config.json`` key that :file:`v2/docker-entrypoint.sh` injects, so the same
:file:`dataDynamicGridRect.json` is a backend game under ``make esgame-ag-up`` and an
unadvanceable one on GitHub Pages, where ``calcUrl`` is ``""``.


The two shipped examples
========================

Both are the **Agriculture Edition**: two production types over the same 28 × 29 landscape,
weighing suitability against four ecosystem-service consequences. They are the same game
content — a property pinned by :file:`v2/src/app/shared/dynamic-matches-static.spec.ts`, not
merely intended — differing on both axes at once.

At a glance
-----------

.. list-table::
   :header-rows: 1
   :widths: 26 37 37

   * - Aspect
     - :file:`dataStaticGridRect.json`
     - :file:`dataDynamicGridRect.json`
   * - Data type
     - static — scored in the browser, no backend
     - dynamic — a calculator scores the round and returns the next level's rasters
   * - Unit selection
     - raster grid (``mapMode: grid``)
     - vector SVG (``mapMode: svg``), zones traced from :file:`esgame_ag_zones.tif`
   * - Board
     - 28 × 29
     - 28 × 29, one zone per cell (812)
   * - Production types
     - ``10`` (arable), ``20`` (livestock), ``maxElements`` 4 each
     - identical — the ids match on purpose, so one calculator serves either board
   * - ``elementSize``
     - ``2``
     - ``2`` — the same 2 × 2 piece, which is why the SVG board is *GridRect*
   * - Maps
     - 2 Suitability + 8 Consequence (10)
     - the same 10, plus a ``Drawing`` zone map and a ``Background`` (12)
   * - Rasters
     - the same GeoTIFFs under :file:`v2/src/assets/images`, drawn as grid cells
     - the same GeoTIFFs, drawn as traced polygons
   * - Live score
     - always — the grid game has never done anything else
     - ``clientScored: true``, so the numbers move as pieces are placed rather than only
       when the round is submitted
   * - Advancing a level
     - local; ``prepareNextLevel`` builds the next board from the shipped rasters
     - ``POST`` to ``calcUrl``; without one the game says so and stays put
   * - Extras
     - —
     - ``paletted``, ``scoreByConversion``, ``editablePreviousRounds``,
       ``autoOpenInstructions: false``, and an ``optimalSolutionUrl`` that puts the
       optimiser's answer behind a checkmark
   * - Deployment
     - static files on GitHub Pages, or opened from disk
     - ``make esgame-ag-up`` — the frontend plus :doc:`reference/static-calculator`

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
:file:`esgame_ag_zones.tif`): contiguous pixels of equal value become one polygon.
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

:file:`examples/dataDynamicGridRect.json` is the agriculture game in SVG mode, scored
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
     - ``dataDynamicGridRect.json``
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

A paletted board colours a value by its **index** in the list of classes, not by the
value itself, and that is a sharper edge than it sounds. Every gradient here is six
colours: ``colors[0]`` is ``#d2b188``, the tan a grid map gives its first distinct value,
and the remaining five are the ramp. So the number of classes decides which ramp entry
each value lands on, and two boards drawn from the same raster disagree the moment they
count classes differently.

That is exactly how the consequence maps came to be drawn in colours the static game
never shows. Every consequence map was given a declared scale,
``values: [0, 25, 50, 75, 100, 125]``, so that each legend would list a 125 class. The
declared scale has six entries; the livestock rasters hold five; so on those boards every
value moved one step along the gradient and all four maps came out wrong. Removing it
restores agreement byte for byte — measured, e.g. Carbon as
``#F8F27D``/``#F7D068``/``#F6A825``/``#AE5322`` on both stacks.

The 125 was not imagined, though. The rasters are asymmetric by design:

.. list-table::
   :header-rows: 1
   :widths: 40 60

   * - Raster
     - Classes
   * - :file:`images/esgame_img_ag.tif` (arable suitability)
     - ``0, 75, 150, 225, 300, 375``
   * - :file:`images/esgame_img_ranch.tif` (livestock suitability)
     - ``0, 50, 100, 150, 200, 250``
   * - :file:`images/esgame_img_ag_*.tif` (arable consequences)
     - ``0, 25, 50, 75, 100, 125``
   * - :file:`images/esgame_img_ranch_*.tif` (livestock consequences)
     - ``0, 25, 50, 75, 100``

Arable both yields more and costs more, and only its consequence maps reach 125. Reading
each raster's own classes shows the right legend for whichever conversion is selected —
five swatches under arable, four under livestock — which a single declared scale could
not do for both. :file:`v2/src/app/shared/dynamic-matches-static.spec.ts` pins this:
it names the offending map whenever the two datasets disagree about anything that decides
a colour, including a declared scale on one and not the other.

A related consequence of the same asymmetry, since it reads as a bug and is not: the
livestock Hunt map is nearly empty. :file:`images/esgame_img_ranch_hunt.tif` holds
``0`` in 674 of its 812 cells, so 138 cells carry a cost; the arable one carries 378.
The static game draws exactly the same sparse map — checked by extracting all 812 cells
from every board on both stacks and diffing them, which agreed everywhere except the two
cells under the pieces.

The score sheet
~~~~~~~~~~~~~~~

``scoreByConversion`` lays the sheet out as one column per production type — what that
conversion gains, then what it costs — instead of one row per map name. It is opt-in
because the alternative is not merely a different look: grouping by name **sums** the maps
that share one. That is the only sensible reading where a consequence map belongs to
several production types at once, as :file:`data.json`'s do, and the wrong one here, where
it left a single Carbon row that could not say which conversion incurred it.

Each row also states its score as a share of what that map could hold: ``PIECE_CELLS``
(sixteen — four 2 × 2 pieces) times the map's own top class, read from its legend rather
than written down. That is what the spider chart was for, so a dataset laying the sheet out
this way draws no chart; the numbers sit in the place the player is already reading.

Cell index 0 — the top-left — is a normal zone with an outline, like any other. It was
not always: ``tiffToSvgPaths`` hard-coded ``0`` as its structural sentinel, so the cell
numbered 0 had no path, no outline and could not be built on. The fix was to let the
caller name the sentinel (``undefinedValue``, from the raster's own ``GDAL_NODATA``)
**and** to fill the tracer's border with that same value. Changing only the first hangs
the tracer outright — 812 groups in 11 ms against a run that never returns, measured —
because the border it walks is then made of what it is looking for.
