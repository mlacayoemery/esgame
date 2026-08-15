The static calculator
=====================

``tools/calculator`` serves the static game's own scoring model over HTTP, with an OpenAPI
description. It is 73 MB and has no dependencies.

Where the model came from
-------------------------

``calc_files/game.js`` is the 2013 game's calculator, and its first line reads:

    This is the compainion to game.html, and will be used in the backend to calculate overall
    scores.

It never was. This is that backend, thirteen years later — the same arithmetic, the same board, and
checked against the original rather than against a reading of it.

The model
---------

A signed sum over placed cells::

    score = SUM(production map over placed cells) - SUM(each consequence map over placed cells)

Everything interesting is in which cells count as placed:

* A production placement covers a 2 × 2 block extending right and down from its coordinate.
* A set-aside removes a single cell from every production type.
* A cell claimed by two production types belongs to the first one declared — farm beats ranch.

Two of the original's behaviours are surprising, and both are reproduced:

**Overlapping placements double-count.** ``concat_pairs()`` checks each expanded cell against the
original coordinate list, never against the cells it is in the middle of adding, so two farms whose
blocks overlap contribute the shared cells twice.

**Placements at the edge run off the board.** The original's bounds test rejects a cell only when it
is off the board in *both* directions — the bottom-right corner alone. Everywhere else along the
right and bottom edges it indexes past the end of a row and the total becomes ``NaN``.

The second is refused rather than reproduced: a placement whose block leaves the board is a 400. A
caller cannot act on ``NaN``, and a ``NaN`` reaching a player looks like a broken server rather than
an unplaceable farm.

How it is known to be right
---------------------------

Not by review. ``calc_files/game.js`` is run, and its answers are the test data.

``extract/oracle.mjs``
    Runs the original under a DOM shim narrow enough to be obviously faithful — ``getElementById``
    returns either an input table or a value holder, and nothing else is provided. It is evaluated
    in a ``vm`` context because ``game.js`` overwrites ``Array.prototype.indexOf``.

``golden/allocations.json``
    200 allocations and what the original scored for each, written by ``extract/make-golden.mjs``.

``test/test_model.py``
    The service must reproduce every one of them.

``extract/golden.test.mjs``
    Re-derives the fixture from ``game.js`` and diffs it. This is the open end: without it, the
    fixture and the service would be a closed loop that agreed forever while drifting away from the
    game.

Each of those was checked against a deliberate break. Transposing the ``[y][x]`` flip, dropping the
farm-beats-ranch rule, and "fixing" the double-count each fail the suite — 11, 6 and 4 assertions
respectively.

The data pack
-------------

``data/tradeoff-ag.json`` is generated from ``game.js`` by ``extract/extract-pack.mjs``, never
copied: ten 29 × 28 matrices, 8,120 values. A hand-copied one would be wrong in a way no reviewer
could see, since a single transposed row still scores and still looks plausible.

CI regenerates it and fails on any diff, so the committed pack cannot drift from the game.

The board is 28 × 29, which is the static grid game's own board — itself an irregular study area
inside a rectangle, most of it zero. That is why the tests locate a scoring cell from the pack
rather than picking one: (5, 5) scores nothing, and a guard written on it passed against an oracle
that had done nothing at all.

How it relates to the grid game v2 actually ships
-------------------------------------------------

They are the same game, which was not obvious and is worth not re-deriving.

``dataGridExample.json`` is 28 × 29 with ``elementSize: 2``, two production types (Arable land,
Livestock) and four consequence maps (Carbon, Habitat, Water, Hunt) — the same board, the same
block size and the same four indicators as ``calc_files/game.js``. And the data is not merely
similar. Every raster the grid game renders is **bit-identical** to the matrix this service scores
with — measured 2026-08-15, all seven pairs, 812 cells each, zero differing cells:

=================================  =================
Raster                             Matrix
=================================  =================
``esgame_img_ag.tif``              ``pts_crop_ag``
``esgame_img_ranch.tif``           ``pts_past_ps``
``esgame_img_ag_carbon.tif``       ``pts_agcarb``
``esgame_img_ranch_carbon.tif``    ``pts_pscarb``
``esgame_img_ag_habitat.tif``      ``pts_aghq``
``esgame_img_ag_water.tif``        ``pts_agwq``
``esgame_img_ag_hunt.tif``         ``pts_agrec``
=================================  =================

So this service is a server-side scorer for the game v2 ships, not only for the 2013 page. It is
**not** a lightweight substitute for the R calculator on the dynamic board: that is a different
landscape, a different model and a different id space, and no pack for it exists.

Where the three implementations differ
--------------------------------------

All three place a 2 × 2 block extending right and down and take a signed sum. They part company
only in cases the interior of the board never reaches:

===================  =====================  =========================  ==========================
                     2013 ``game.js``       v2 grid game               ``tools/calculator``
===================  =====================  =========================  ==========================
Block at the edge    runs off, total NaN    slid back onto the board   refused, HTTP 400
Overlapping blocks   counted twice          impossible                 refused (``validation``)
===================  =====================  =========================  ==========================

v2 clamps: ``getAssociatedFields()`` shifts a block that would leave the right or bottom edge, and
``game.service.placement-geometry.spec.ts`` property-tests both clamps across square and non-square
boards. ``canFieldBePlaced()`` then refuses a block overlapping one already placed, so the 2013
double-count is unreachable there.

Validation, and why it is on by default
---------------------------------------

In the 2013 game the **page** did the validating. You typed coordinates into a form with four rows
of boxes, and the calculator summed whatever arrived — which is why ``game.js`` has an edge case
that returns NaN and a double-count nobody ever hit. Split the calculator out into a service and
that stops being true: it is now reachable by anything.

So it validates, and can be asked not to::

    validation: true    (default)  reject cells off the board, cells claimed by two pieces, and a
                                   piece whose footprint exceeds placementSize x placementSize
    validation: false              score exactly what game.js scores, double-count included

**Cells are never counted twice** under validation. That is the substantive difference from the
original, and it is a correctness rule rather than a preference: ``concat_pairs()`` filters each
expanded cell against the original coordinate list and never against the cells it is in the middle
of adding, so two overlapping blocks contribute the shared cells once each. Two 2 × 2 blocks one
column apart cover six distinct cells and game.js scores seven.

Off the board is refused in **both** modes. That is the one place this parts company with the
original even with validation off, because the original's answer there is NaN and no caller can act
on it.

``golden/allocations.json`` is checked with ``validation=false``, so the oracle is untouched: the
service still reproduces game.js exactly, on demand.

A piece is its cells, not a corner
----------------------------------

A placement can be given either way::

    {"type": "farm", "x": 10, "y": 10}
    {"type": "farm", "cells": [{"x": 10, "y": 10}, {"x": 11, "y": 10}, {"x": 10, "y": 11}]}

The anchor is the 2013 form and grows into a 2 × 2 block. The cell form exists because an anchor
cannot express **a piece some of whose cells have been given back** — a round in which a player
returns individual cells rather than whole farms. Anchors are expanded to cells on the way in, so
the cell form is what is actually scored, and the two are asserted to agree.

Which is why validation also checks the **footprint**: cells may be missing from a piece, but the
ones present must still fit inside one placementSize × placementSize square, or "a 2 × 2 farm"
could arrive as four cells scattered across the map.

Why it is not R
---------------

Measured 2026-08-15:

==========================================  ==========
Image                                       Size
==========================================  ==========
``tools/calculator`` (python:3.14-alpine)        73 MB
``oven/bun:1-alpine`` alone                     146 MB
``node:26-alpine`` alone                        251 MB
``esgame-calculation`` (R)                    2,590 MB
==========================================  ==========

The two calculators do different things, and the sizes are not a criticism of the R one: it solves a
distance-decay concentration field over a 468 × 335 raster and publishes coverages to GeoServer.
This one adds up integers over a 29 × 28 grid, and paying 2.5 GB to do that would be the mistake.

Node was the obvious host — the source being extracted is JavaScript — and was measured rather than
assumed. Its alpine image is 251 MB, and stripping it to the bare binary on ``alpine:3.22`` still
leaves 219 MB, because the binary itself is most of it. Python's standard library carries an HTTP
server, so the port costs one file of arithmetic and saves 178 MB.

Running it
----------

::

    docker build -t esgame-static-calculator tools/calculator
    docker run --rm -p 8000:8000 esgame-static-calculator

    curl -s -X POST http://localhost:8000/score \
      -H 'Content-Type: application/json' \
      -d '{"allocation":[{"type":"farm","x":10,"y":10}]}'

======================  =============================================================
Route                   What it is
======================  =============================================================
``POST /score``         Score one allocation
``GET /pack``           The board and model in use, without the grids
``GET /health``         Liveness
``GET /openapi.json``   The description, generated from the loaded pack
``GET /docs``           A page rendering that description
======================  =============================================================

``PORT``, ``PACK`` and ``ALLOWED_ORIGIN`` are the only environment variables.

The spec is built from the pack at startup rather than written beside it, so the production types,
the indicators and the board size in it cannot disagree with what is being scored. The example in
the spec is executed by CI, so it is a fact rather than a promise.

The service refuses to start on a pack that is missing, unparseable, or whose grids are not the
shape it claims — checked at startup, not on the first request. A calculator that comes up without a
usable board passes every health check and fails every round, which is the exact state the dynamic
compose stack was in until 2026-08-14.
