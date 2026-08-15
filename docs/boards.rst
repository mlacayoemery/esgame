Boards: hexagonal and rectangular
=================================

The dynamic game has two boards over the same landscape. They differ only in how the playable area
is divided up, and choosing between them is configuration — no code, and no rebuild.

============================  ==========  ============  ======================
Board                         Units       Cells / unit  Base raster
============================  ==========  ============  ======================
Hexagonal (the default)       465         55–298        ``LU_and_NEW_hexa.tif``
Rectangular                   529         30–209        ``LU_and_NEW_rect.tif``
============================  ==========  ============  ======================

Both cover exactly the same 65,826 farmland cells.

Why a board is only data
------------------------

``TiffService`` turns the board raster into SVG with ``tiffToSvgPaths()``, which emits one path per
distinct raster value. Nothing in the frontend knows what a hexagon is: it draws whatever regions
the raster contains, and a click selects whichever region was drawn. So a differently-shaped board
is a differently-valued raster, which is what ``tools/R/make-rect-board.R`` produces.

What the hexagonal board actually is
------------------------------------

Not a hexagonal tiling of a region — a hexagonal lattice **clipped by the terrain**.
``New_hexagons.tif`` covers the farmland, 65,826 cells. ``New_Land_use_only.tif`` covers what runs
through it — villages, woodland, watercourses — 56,389 cells, interleaved rather than surrounding.
The two masks are disjoint, and ``make-base-raster.R`` mosaics them.

This matters because the terrain is not scenery. ``ESGAME_RECEPTORS`` reads it (``HH:2``, ``NP:5``,
``WA:4``, ``HC:7``, ``RV:6,8``), so a board unit that swallowed a terrain cell would delete a
receptor from the model.

That is why the rectangular board is clipped rather than laid over the top. Measured over a 28×29
lattice of all-or-nothing squares — what "make every piece a true rectangle" would require:

===================  =========  ==================  ================
Coverage threshold   Squares    Terrain absorbed    Board dropped
===================  =========  ==================  ================
25%                  490        48.6%               3.7%
50%                  361        23.0%               17.5%
75%                  229        7.5%                41.1%
===================  =========  ==================  ================

No threshold is affordable, and a finer lattice barely helps, because the loss is not a boundary
effect — the terrain runs through the board rather than around it. Clipping costs nothing instead:
the mask is preserved cell for cell.

Interior units are therefore true rectangles, and units meeting a village or a stream are bitten
into the same ragged shapes the hexagonal board already has.

The lattice
-----------

28 columns × 29 rows, matching the static grid game's own board — which is itself 28×29 with 387 of
its 812 cells empty, an irregular shape inside a rectangle. Over the farmland's 459 × 331-cell
bounding box a unit is 16.4 × 11.4 cells, i.e. 1640 × 1140 m. Units are wider than they are tall
and the SVG carries real coordinates, so they render as true rectangles rather than as a stretched
square grid.

The lattice alone leaves 611 units, 38 of them under ten cells and one of them a single cell — game
pieces too small to click. ``make-rect-board.R`` merges everything under 30 cells into the
neighbour that actually borders it, which costs 82 units and moves 1.6% of the board's cells
without losing any.

The bounds are the same for both boards
---------------------------------------

``tools/R/derive-bounds.R`` derives each indicator's scale from two extremes: every unit left as
nature, and every unit set to agropark. Both depend on **which cells** the board covers, not on how
those cells are grouped — so two boards over the same farmland have the same bounds.

Re-derived against ``LU_and_NEW_rect.tif`` on 2026-08-14, all five came back identical to the
committed ``tools/R/bounds.json``. One bounds file serves both boards, and this is why.

Running the rectangular board
-----------------------------

Kubernetes::

    deploy/k8s/kind.sh up
    ESGAME_OVERLAY=rectangular deploy/k8s/kind.sh deploy
    deploy/k8s/ingress-test.sh

``deploy/k8s/overlays/rectangular`` is three ConfigMap literals on top of ``published`` — no image
differs, no manifest differs, no code differs. ``kind.sh`` loads both boards into the geodata
ConfigMap whichever overlay you deploy, so switching between them is the overlay name and nothing
else.

Verified on a live cluster, 2026-08-15: ``19/19`` in ``ingress-test.sh`` against each board —
529 ids from ``LU_and_NEW_rect.tif`` and 465 from ``LU_and_NEW_hexa.tif``, five scores and 5/5
fetchable coverages both times — and the rectangular board rendered in a browser through the
ingress.

Compose::

    cd v2
    docker compose -p esgame-rect \
      -f docker-compose.yml -f docker-compose.dynamic.yml -f docker-compose.rect.yml up -d

Which sets three things — and they must agree:

``DEFAULT_MODE=dynamic``
    ``/`` serves the dynamic game rather than the client-side grid game.

``DYNAMIC_DATA_URL=assets/dataRect.json``
    The dataset whose board raster is ``New_rectangles.tif``. Identical to ``assets/data.json``
    apart from that and the title; ``data-variants.spec.ts`` pins it that way, because two
    near-duplicate datasets drift the way the translation files did.

``ESGAME_BASE_RASTER=LU_and_NEW_rect.tif``
    The mosaic the calculator reclassifies. **Mandatory, with no default** — every deployment says
    which board it serves, because a calculator handed one by default comes up healthy and scores
    against a board the browser may not be drawing. ``deploy/k8s/base/configmap.yaml`` states the
    hexagonal one; this overlay overrides it.

**A mismatched pair does not fail.** The browser sends the ids it drew, and ``reclassify()``
silently ignores ids the raster does not contain, so a rectangular frontend against a hexagonal
calculator returns five finite scores that barely move whatever the player does. The calculator
reports what fraction of each round landed on its raster — in the log and in
``allocationCoverage`` in the response — precisely so that failure is visible.

Since nothing at run time will refuse a mismatched pair, ``deploy/k8s/render-test.sh`` refuses it
before it is applied: for every rendered kustomization it checks that ``DYNAMIC_DATA_URL`` and
``ESGAME_BASE_RASTER`` name the same board, and that a non-default dataset is actually reachable
(``DEFAULT_MODE=dynamic``). Confirmed able to fail four ways — the rectangular dataset against the
hexagonal raster, the rectangular dataset behind the grid game, a misspelt ``DEFAULT_MODE``, and a
dataset the check does not know about.

Regenerating the rasters
------------------------

::

    docker run --rm --entrypoint Rscript \
      -v "$PWD/v2/src/assets/images:/d" \
      -v "$PWD/tools/R/make-rect-board.R:/make.R:ro" \
      ghcr.io/mlacayoemery/esgame-calculation:master /make.R

    docker run --rm --entrypoint Rscript \
      -e ESGAME_BOARD=New_rectangles.tif -e ESGAME_BASE_RASTER=LU_and_NEW_rect.tif \
      -v "$PWD/v2/src/assets/images:/d" \
      -v "$PWD/tools/R/make-base-raster.R:/make.R:ro" \
      ghcr.io/mlacayoemery/esgame-calculation:master /make.R

Both refuse to write a file that fails their assertions. ``--entrypoint`` is required: the image's
entrypoint is the plumber launcher.
