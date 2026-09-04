=========
Optimizer
=========

.. Where this document's section-local :file: paths resolve from; see
.. docs/_checks/check-file-paths.py.
.. file-base: tools/optimizer
.. file-base: tools/calculator

:file:`tools/optimizer/optimize.py` finds the **best board the agriculture game can
reach**, exactly, and writes it where the frontend can load it. It is a study aid and a
check on the game's design, not part of any deployment: nothing in the running stack
depends on it, and the answer it produces is a static asset.

.. contents::
   :local:
   :depth: 2


Two rounds, two questions
=========================

The rounds are not the same problem, and the optimizer answers them separately.

Level 1 is built from the suitability maps alone — :class:`GameService` filters
``gameBoardType == SuitabilityMap`` when it constructs the first level, and
``prepareNextLevel`` is what adds the consequence boards. So a player optimising round one
is optimising **production**, with no way to see what it costs. Round two scores the same
allocation net of four consequence maps per production type.

The gap between the two answers is the game::

    round 1 optimum                     9775   production
      ...the same board, scored net     4200
    round 2 optimum                     5175

Optimising what the round shows you costs 975 points. The round-one board spreads its
pieces across the best production land; the round-two board pulls them into a pocket where
suitability is high and the cost surfaces happen to be cheap.

:file:`test_optimize.py` pins that ordering. A data change that erased it would leave the
game running and quietly cost it its lesson.


The rules it searches under
===========================

All read off the frontend rather than assumed:

.. list-table::
   :header-rows: 1
   :widths: 34 66

   * - Rule
     - Where it comes from
   * - Board is 28 × 29 cells
     - ``gameBoardColumns`` / ``gameBoardRows`` in :file:`v2/src/assets/dataAgDynamic.json`
   * - A piece is 2 × 2
     - ``elementSize``
   * - Four pieces per production type
     - ``maxElements``
   * - A piece anchors at its top-left cell, clamped to stay on the board
     - ``GameService.getAssociatedFields``, giving 27 × 28 = **756** distinct anchors
   * - No piece may overlap any other, of either type
     - ``GameService.canFieldBePlaced``
   * - A board's score is the sum over its pieces
     - a cell's contribution depends only on which type covers it

The last one is what makes this an exact search rather than a simulation.

Two 2 × 2 anchors overlap exactly when they differ by at most one in both axes, which is
the whole of the interaction between pieces.


How the search works
====================

Branch and bound over the 756 anchors.

Pieces of one type are taken in **descending value** and **increasing index**, so each set
of four is reached once rather than 4! times. The bound is the running total plus, for
every piece still to place, the best values left in that type's list — ignoring overlap,
which can only make a board worse. Because each list is sorted descending, "the best *k*
left from position *i*" is just the next *k*, and a prefix sum answers it in O(1).

The bound is re-checked inside the loop as well as at its head: ``best`` improves as the
search runs, so a branch worth taking when the loop began may not be by the time it is
reached.

Proving the answer is optimal
-----------------------------

Pruning means "it returned an answer" says nothing about whether the answer is the best
one — a bug in the bound cuts off the optimum and leaves a plausible number behind.

So :file:`test_optimize.py` checks the search against **exhaustive enumeration** on a
5 × 5 board, across four seeded value landscapes and both objectives. The seeds include
cases where the best anchors collide, which is the case a bound can get wrong while still
looking right on well-separated data.


What it does not reimplement
============================

None of the scoring.

Values come from :file:`data/tradeoff-ag.json`, the model pack behind
:doc:`static-calculator`, whose ten grids are byte-identical to the GeoTIFFs the frontend
ships — asserted by ``PackMatchesTheShippedRasters``, without which the optimizer could be
solving a different board than the button loads and every number would still look
reasonable. Every answer is then re-scored through ``model.score``, which is golden-tested
against the 2013 original.

The browser agrees independently. Loading the answer and reading the score sheet gives
9775 in round one and 5175 in round two, from the frontend's own scoring path.


Running it
==========

.. code-block:: console

   $ python3 tools/optimizer/optimize.py            # report both rounds
   $ python3 tools/optimizer/optimize.py --write    # ...and update the shipped answer
   $ python3 -m unittest discover -s tools/optimizer -p 'test_*.py'

``--write`` regenerates :file:`v2/src/assets/optimalAgDynamic.json`. Re-run it after any
change to the rasters, the board geometry, or ``maxElements``; the guards in
:file:`test_optimize.py` fail if the shipped answer stops matching the dataset it claims.

Pillow is needed only by the raster-comparison guard, which skips itself when it is absent.


The answer, and the button
==========================

The asset records each piece as its **top-left cell id**, the same anchor
``GameService.selectField`` takes:

.. code-block:: json

   {
     "board": { "columns": 28, "rows": 29, "elementSize": 2 },
     "rounds": {
       "1": { "score": 9775, "pieces": [ { "productionType": "10", "id": 73 }, "..." ] },
       "2": { "score": 5175, "pieces": [ { "productionType": "10", "id": 179 }, "..." ] }
     }
   }

A dataset opts in by naming the file in ``Settings.optimalSolutionUrl``. A checkmark then
appears beside the help icon; ``GameService.loadOptimalSolution`` fetches the file and
applies the round's pieces.

Hidden unless configured, because an optimum belongs to the board it was computed on and
nothing at runtime can check that a fetched file belongs to this one.

It **replaces** the board rather than adding to it. Adding would exceed ``maxElements``,
be rejected piece by piece, and leave a mixture of the player's board and the optimizer's
that is neither. The pieces go through ``getAssociatedFields`` exactly as a click does, so
edge clamping and footprint come from the one place that knows them.

Three ways it can go wrong, and what each does:

.. list-table::
   :header-rows: 1
   :widths: 40 60

   * - Situation
     - Behaviour
   * - The round has no recorded answer
     - The board is left alone and a warning names the round. "The optimizer was never
       asked" and "the best you can do is nothing" are different answers, and clearing
       the board would conflate them.
   * - The file is missing or unreadable
     - Reported; the round stays playable by hand.
   * - A piece names an unknown production type
     - That piece is skipped and reported; the rest still land.

All three are covered by :file:`v2/src/app/services/game.service.optimal-solution.spec.ts`.

The checkmark is drawn as inline SVG rather than set as a glyph: the icomoon font this
game ships carries two icons, help and close, and neither is a checkmark.
