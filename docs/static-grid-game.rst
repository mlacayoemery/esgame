=================================
The static game on a raster grid
=================================

.. Where this document's section-local :file: paths resolve from; see
.. docs/_checks/check-file-paths.py.
.. file-base: examples
.. file-base: v2/src/assets
.. file-base: v2/src/assets/images
.. file-base: v2/src/app

:file:`dataStaticGridRect.json` is the **Tradeoff: Agriculture Edition** as a client-side game:
**static data** on **raster-grid units**, in the terms of :doc:`static-vs-dynamic`. It is what
https://mlacayoemery.github.io/esgame/ serves by default, it needs no backend, and it will play
from a file:// URL with the network switched off.

Its counterpart is :doc:`dynamic-svg-game` — the same landscape and the same rasters, played
through the dynamic pipeline.

.. contents::
   :local:
   :depth: 2


Where the data comes from
=========================

Ten maps, each a GeoTIFF under :file:`v2/src/assets/images`, and nothing else. There is no
geometry file: the board is two numbers.

.. list-table::
   :header-rows: 1
   :widths: 6 22 16 12 44

   * - id
     - Name
     - Type
     - Gradient
     - Raster
   * - ``2``
     - Arable land
     - Suitability
     - green
     - :file:`esgame_img_ag.tif`
   * - ``3``
     - Livestock
     - Suitability
     - orange
     - :file:`esgame_img_ranch.tif`
   * - ``4`` / ``8``
     - Carbon
     - Consequence
     - yellow
     - :file:`esgame_img_ag_carbon.tif` / :file:`esgame_img_ranch_carbon.tif`
   * - ``5`` / ``9``
     - Habitat
     - Consequence
     - purple
     - :file:`esgame_img_ag_habitat.tif` / :file:`esgame_img_ranch_habitat.tif`
   * - ``6`` / ``10``
     - Water
     - Consequence
     - blue
     - :file:`esgame_img_ag_water.tif` / :file:`esgame_img_ranch_water.tif`
   * - ``7`` / ``11``
     - Hunt
     - Consequence
     - red
     - :file:`esgame_img_ag_hunt.tif` / :file:`esgame_img_ranch_hunt.tif`

**Two rasters per indicator, one per production type.** Carbon is not one map scored differently
depending on what covers a cell; arable carbon and livestock carbon are separate surfaces, which
is why there are eight consequence maps for four indicators. A map declares which production
types it belongs to (``productionTypes``), and that is what pairs them.

These are the 2013 game's grids. :doc:`reference/static-calculator` reproduces that model over
HTTP from a pack extracted from :file:`calc_files/game.js`, and the pack's ten grids are
**byte-identical** to the GeoTIFFs above — asserted, not assumed, by
``PackMatchesTheShippedRasters``. :file:`v2/e2e/grid-calculator-agrees.spec.ts` then plays a real
allocation in a browser and compares the score board against the service, so "the app and the
1996 model agree" is a measurement rather than a lineage claim.


How a cell is selected
======================

The board is a lattice of ``gameBoardColumns`` × ``gameBoardRows`` = **28 × 29 = 812** cells,
generated from those two numbers. A cell's id is its row-major index.

``elementSize`` is ``2``, so a click places a **2 × 2 piece**, not a cell.
``GameService.getAssociatedFields`` turns the clicked id into the four the piece covers:

.. code-block:: text

   id        id + 1
   id + 28   id + 29          (+1 is one cell right, +gameBoardColumns is one row down)

**Pieces clamp rather than refuse.** A click within one cell of the right edge or bottom row
slides the anchor back so the footprint stays on the board:

.. code-block:: javascript

   if (columns - (id % columns) < elementSize) id = id - (id % columns) + columns - elementSize;
   if (id >= (columns * rows - (elementSize - 1) * columns)) id = columns * (rows - elementSize) + (id % columns);

So the distinct anchors are 27 × 28 = **756**, not 812 — the number
:doc:`reference/optimizer` searches over.

**Overlap is an id-set intersection.** ``canFieldBePlaced`` refuses a piece that shares any id
with one already placed, of either production type, and refuses it once the type is out of
pieces. Nothing geometric is computed at any point.

Each production type allows ``maxElements: 4``, so a full board is four 2 × 2 pieces per type —
**16 cells each, 32 of 812 allocated**. That 16 is ``ScoreService.PIECE_CELLS``, and it is the
denominator behind every percentage the game shows: a map's worst reachable total is 16 cells at
its highest value.


Rounds
======

``infiniteLevels`` is ``false``, so the game is two rounds and stops.

**Round one shows the suitability maps alone.** The level is built from
``gameBoardType == SuitabilityMap``, so a player allocating in round one is optimising
*production* with no way to see what it costs. **Round two adds the consequence boards** —
``prepareNextLevel`` sets ``showConsequenceMaps = true`` — and scores the same allocation net of
them.

The gap between those two answers is the lesson the game teaches, and it is quantified in
:doc:`reference/optimizer`: the best round-one board is worth 9775 in production and 4200 once the
costs appear, against 5175 for a board that knew about them.


How it is scored
================

Entirely in the browser, from values the board already holds. Every field on every map carries
that cell's raster value; ``SelectedField`` records them per map as pieces are placed, and
``ScoreService.calculateScore`` sums each map's entry across the placed fields. Production maps
add, consequence maps are the costs charged against the production that caused them, and the
round's net is production minus costs — the same arithmetic
:doc:`reference/static-calculator` performs server-side, golden-tested against the original.

Nothing is fetched, so the numbers move the moment a piece lands.


It never calls a backend
========================

``GameService.goToNextLevel`` branches on the **mode first**, then ``calcUrl``:

.. code-block:: typescript

   if (this.settings.value.mode == 'SVG' && this.settings.value.calcUrl) { ... }
   else if (this.settings.value.mode == 'SVG') { /* refuses: no backend configured */ }
   else { this.prepareNextLevel(); }

A grid game with a ``calcUrl`` configured does not post to it. That is deliberate: the GRID
branch of ``prepareNextLevel`` builds the next board from the local rasters and never reads a
``CalculationResult``, so the request could only add a way to fail — and did, on 2026-09-02, when
a stack that set ``CALC_URL`` without ``DEFAULT_MODE`` served this game wired to a calculator,
got a 404 on round two and showed *"Something went wrong"* on a game that had every number it
needed in the browser already.


Running it
==========

.. code-block:: console

   $ make esgame-up          # the frontend alone, on http://localhost:81
   $ npm start               # or the dev server, from v2/

:file:`v2/src/assets/config.json` selects it with ``defaultMode: "static"`` and
``staticDataUrl: "assets/dataStaticGridRect.json"``. The file itself is authored in
:file:`examples` and copied into ``assets/`` by ``scripts/sync-examples.mjs`` at build time —
see :doc:`guides/builder`.
