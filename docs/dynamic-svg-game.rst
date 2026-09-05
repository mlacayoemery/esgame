====================================
The dynamic game on vector SVG zones
====================================

.. Where this document's section-local :file: paths resolve from; see
.. docs/_checks/check-file-paths.py.
.. file-base: examples
.. file-base: v2/src/assets
.. file-base: v2/src/assets/images
.. file-base: v2/src/app

:file:`dataDynamicGridRect.json` is the **Tradeoff: Agriculture Edition** again — the same
landscape, the same rasters, the same pieces — played as **dynamic data** on **vector-SVG units**,
in the terms of :doc:`static-vs-dynamic`. A calculator scores each round and returns the boards
the next one is built from.

That the two are the same game is pinned rather than intended:
:file:`v2/src/app/shared/dynamic-matches-static.spec.ts` requires every map this file shares with
:doc:`static-grid-game` to name the same raster, gradient, type and production types, because they
have twice drifted apart in ways nobody could see from the JSON.

.. contents::
   :local:
   :depth: 2
   :class: this-will-duplicate-information-and-it-is-still-useful-here


Where the data comes from
=========================

Twelve maps: the ten of the static game, unchanged, plus the two an SVG board needs.

.. list-table::
   :header-rows: 1
   :widths: 8 20 16 56

   * - id
     - Name
     - Type
     - Raster and role
   * - ``1``
     - Zones
     - Drawing
     - :file:`esgame_ag_zones.tif` — **the board itself**. Its distinct values become the
       playable polygons.
   * - ``999``
     - Background
     - Background
     - :file:`esgame_ag_background.tif` — what the land would favour: ``1`` where arable scores
       higher, ``2`` where livestock does, ``0`` where neither returns anything. Derived from the
       game's own suitability rasters rather than invented, and drawn with a ``custom`` colour
       set so 0 stays unpainted: land that returns nothing should not be coloured as though it
       favoured an activity.
   * - ``2``–``3``
     - Arable land, Livestock
     - Suitability
     - :file:`esgame_img_ag.tif`, :file:`esgame_img_ranch.tif`
   * - ``4``–``7``
     - Carbon, Habitat, Water, Hunt
     - Consequence
     - the four ``esgame_img_ag_*.tif`` — arable's costs
   * - ``8``–``11``
     - Carbon, Habitat, Water, Hunt
     - Consequence
     - the four ``esgame_img_ranch_*.tif`` — livestock's costs

**The ids are the static game's ids, deliberately.** A Carbon cost is id ``4`` on both boards,
which is what lets one calculator serve either — and why
:file:`examples/esgame-dynamic/calculator/app.py` keys its ``CONSEQUENCES`` on ``4``–``11``.


The zone raster is the board
----------------------------

:file:`esgame_ag_zones.tif` is 28 × 29 with ``GDAL_NODATA`` 65535, and it holds **812 zones, one
per cell**, numbered row-major: the value at *(x, y)* is exactly ``y * 28 + x``, for all 812 of
them. That is not decoration — see `How a unit is selected`_.

:file:`v2/src/app/shared/helpers/svg/tiffToSvgPaths.js` traces it into SVG paths, one per
distinct value, by walking the boundary between unequal neighbours. The value meaning "no zone"
is skipped, and no path is emitted for it: it is also what the padding border is filled with, so
its region merges with the border and cannot be traced at all. Emitting it anyway produced a
``<path d="">`` — a field with no geometry that nothing can click.


How a unit is selected
======================

A field's id on an SVG board **is the raster value** of the zone it was traced from
(``TiffService.tiffToPaths`` sets ``id: key``). So the ids on this board are 0…811, laid out
row-major.

``elementSize`` is ``2``, and ``GameService.getAssociatedFields`` is not conditioned on the mode,
so a click places the same 2 × 2 piece the grid game does:

.. code-block:: text

   id        id + 1
   id + 28   id + 29          (+1 right, +gameBoardColumns down)

with the same edge clamping, the same 756 distinct anchors, the same ``maxElements: 4``, and the
same id-set overlap test. What the SVG board adds is drawing: the piece's production icon is
placed once at its anchor and sized to the whole footprint, and a single outline is stroked
around the footprint — stroking each cell instead drew the grid *inside* the piece, on maps that
carry no grid of their own, so a 2 × 2 piece read as four.

.. important::

   **Adjacency here is arithmetic, not geometry.** Nothing traces shared polygon edges and there
   is no spatial index: ``+1`` means "to the right" and ``+gameBoardColumns`` means "below". This
   board inherits grid adjacency solely because its zones are numbered row-major over exactly the
   lattice the dataset declares — which is what the *GridRect* in its name records.

   Nothing enforces that. On a board of irregular zones — the 465 hexagons of
   :file:`v2/src/assets/data.json`, numbered ``100``, ``200``, … ``46500`` — ``id + 1`` names
   ``101``, which no field has. The click would be accepted, and the piece would quietly cover
   one real zone and three that do not exist. A vector-SVG unit is one zone unless the zones are
   a rectangular grid.


How the boards are coloured
===========================

``paletted`` is ``true``: each board takes **one palette entry per distinct value in its raster**,
the way a grid board is coloured, rather than stretching values across ``minValue``…``maxValue``.
These rasters hold a handful of classes, not a continuous surface, and the agriculture
suitability raster runs to 375 against a declared maximum of 100 — stretched, everything above 100
clipped to the same extreme and most of the map came out one flat shade.

.. warning::

   A paletted board colours a value by its **index** in the list of classes, so the *number* of
   classes decides which ramp entry each value lands on. Declaring a six-entry scale on rasters
   that hold five moved every class one step along the gradient and produced colours the static
   game never shows. Arable consequence rasters run to 125 and livestock ones stop at 100, so no
   single declared scale is right for both.


How it is scored
================

**Twice, on purpose.**

``clientScored: true`` scores the round in the browser as pieces are placed, from the values the
consequence boards already carry — the same arithmetic as :doc:`static-grid-game`. Without it the
score board and the spider chart are drawn from the calculator's reply and therefore only move
when a round is submitted, which means a player moving a piece gets no feedback until they commit
to it.

``scoreByConversion: true`` gives the score sheet two columns, one per conversion: what it gains,
then what it costs. Grouping by map name instead *sums* the maps that share one, which is right
where a consequence map belongs to several production types at once, and wrong here — it left a
single Carbon row that could not say which conversion incurred it.

The chart beside it draws six axes, grouped by translated map name exactly as the score sheet's
rows are: Arable land, Livestock, Carbon, Habitat, Water, Hunt. Its numbers are percentages of
what a map could hold — 16 cells at its highest value (``ScoreService.PIECE_CELLS``) — not raw
scores.


Advancing a round
=================

This is the half that makes it dynamic. ``GameService.goToNextLevel`` POSTs:

.. code-block:: json

   { "allocation": [ { "id": 179, "lulc": 10 } ], "round": 1, "score": 5925, "game_id": "…" }

``lulc`` is the production type's id, ``id`` is the zone's. The calculator answers with a
``results[]`` entry per consequence map — the **same ids ``4``–``11``** — carrying a score and a
URL, and those URLs become the next level's boards.

**Without a ``calcUrl`` the game says so and stays put:** *"This game needs a calculation backend,
and none is configured."* It used to go ahead, fetch the placeholder consequence URLs, 404, and
leave a spinner that never cleared. The dataset itself declares ``calcUrl: ""``, so what makes
this game dynamic is the **deployment** — ``config.json``, injected by
:file:`v2/docker-entrypoint.sh` — which is why the same file is a backend game under
``make esgame-ag-up`` and an unadvanceable one on GitHub Pages.


The answer, behind a checkmark
==============================

``optimalSolutionUrl`` names :file:`examples/optimalDynamicGridRect.json`, and a checkmark appears
beside the help icon when it is set. It loads the best board :doc:`reference/optimizer` found for
the round — 9775 in round one, 5175 in round two — replacing the player's board rather than adding
to it.

Hidden unless configured, because an optimum belongs to the board it was computed on and nothing
at runtime can check that a fetched file belongs to this one. That the committed answer is still
the optimum is re-derived on every relevant change by :file:`tools/optimizer-check.sh`.


Running it
==========

.. code-block:: console

   $ make esgame-ag-up       # frontend + the static calculator, on http://localhost:81

That stack points ``CALC_URL`` at :doc:`reference/static-calculator`, which serves the 2013 model
over HTTP — so the round-trip is real while the scores stay the ones this game has always had.
:file:`examples/esgame-dynamic` runs the same board against a FastAPI calculator and GeoServer
instead, which is the shape a deployment with real coverages takes.
