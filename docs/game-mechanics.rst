===================================================
Game mechanics: pieces, counts, levels, and scoring
===================================================

This page documents, with reference-grade precision, how esgame represents a
"piece" (a *production type* placed on a board field/zone), how the **number**
of pieces is fixed and limited, where in the code those limits are enforced,
how selection / placement / deselection and multi-field association work, how
levels progress and what carries over, and how the score is computed in the two
runtime modes.

Every statement below is grounded in the Angular v2 source under
:file:`esgame/v2/src/app` and in the two concrete configuration files
:file:`esgame/examples/esgame-dynamic/frontend/data.json` (SVG / dynamic) and
:file:`esgame/v2/src/assets/dataGridExample.json` (GRID / static).

.. contents::
   :local:
   :depth: 2


What a "piece" is
=================

A *piece* is a **production type** assigned to one or more **fields** of a
**game board**. There is no separate "piece" class; a placement is recorded as
a :class:`SelectedField`.

Production type
---------------

A production type is the land-use activity the player allocates (e.g. *Arable
land*, *Livestock*). It is defined by
:class:`ProductionType` in
:file:`esgame/v2/src/app/shared/models/production-type.ts`:

.. code-block:: typescript

   export class ProductionType {
       fieldColor: string;
       suitabilityMap: GameBoard;
       consequenceMaps: GameBoard[] = [];
       image: string;
       maxElements: number;
       id: number;

       constructor(id: number, fieldColor: string, scoreMap: GameBoard, image: string, maxElements: number) { ... }

       getScore(ids: number[]) {
           let score = this.suitabilityMap.getScore(ids);
           let minusScore = this.consequenceMaps?.map(o => o.getScore(ids)).reduce((a, b) => a+b, 0) ?? 0;
           return score - minusScore;
       }
   }

The crucial field is ``maxElements`` — the maximum number of pieces of that
production type the player may place (see `How the piece count is fixed`_).

Field (zone / cell)
-------------------

The placeable target is a :class:`Field`
(:file:`esgame/v2/src/app/shared/models/field.ts`). A field carries its own
``id``, a ``FieldType``, a numeric ``score``, an ``editable`` flag, an
``assigned`` flag, and a nullable ``productionType``. In GRID mode a field is a
single square cell; in SVG mode a field is a vector polygon (zone). A field is a
candidate for placement only when ``editable`` is ``true``.

Selected field (the placement record)
-------------------------------------

A *placed piece* is a :class:`SelectedField`
(:file:`esgame/v2/src/app/shared/models/field.ts`):

.. code-block:: typescript

   export class SelectedField {
       fields: HighlightField[];
       productionType: ProductionType;
       scores: { score: number, id: string }[] = [];
       ...
   }

So one piece = one ``SelectedField`` = (a set of board field ids in
``fields``) + (the ``productionType`` placed on them) + a per-map ``scores``
breakdown. A multi-cell GRID piece occupies several field ids but is still a
**single** ``SelectedField`` (see `Multi-field association`_). The live list of
placed pieces is the ``selectedFields`` ``BehaviorSubject`` in
:class:`GameService` (:file:`esgame/v2/src/app/services/game.service.ts`).


How the piece count is fixed
============================

The number of pieces is bounded along three independent axes: **per
production type** (``maxElements``), **per board geometry**
(``gameBoardColumns`` × ``gameBoardRows`` and ``elementSize``), and a **minimum
allocation gate** before advancing (``minSelected``).

Per-production-type cap: ``maxElements``
----------------------------------------

The hard cap on how many pieces of a given production type may be placed is
``ProductionType.maxElements``. It is enforced in the **private**
``canFieldBePlaced`` guard of :class:`GameService`
(:file:`esgame/v2/src/app/services/game.service.ts`):

.. code-block:: typescript

   private canFieldBePlaced(associatedFields: HighlightField[] = []) {
       if (this.selectedProductionType.value?.maxElements != 0 &&
           this.selectedProductionType.value?.maxElements ==
               this.selectedFields.value.filter(o => o.productionType == this.selectedProductionType.value).length)
           return false;
       return !(this.selectedFields.value.some(o => o.fields.some(p => associatedFields.some(q => q.id == p.id))));
   }

Two rules are encoded here:

#. **Count cap.** If the currently selected production type already has exactly
   ``maxElements`` placed pieces, no further placement is allowed. A value of
   ``0`` is treated as *unlimited* (the ``maxElements != 0`` short-circuit).
#. **No overlap.** A placement is rejected if any of its associated field ids
   is already occupied by an existing ``SelectedField``.

``canFieldBePlaced`` is consulted from three places in
:class:`GameService`: ``selectField`` (placement), ``highlightOnOtherFields``
(hover preview — the highlight is removed when placement is impossible), so the
UI never lets the player exceed the cap.

Per-piece footprint: ``elementSize``
------------------------------------

``Settings.elementSize`` fixes how many board cells one piece covers in GRID
mode. ``getAssociatedFields(id)`` in :class:`GameService` turns a single hovered
cell id into the full square block of ``elementSize`` × ``elementSize`` field
ids:

* ``elementSize == 1`` → the piece is a single cell
  (``return [{ id, side: HighlightSide.ALLSIDES }]``).
* ``elementSize > 1`` → an ``elementSize`` × ``elementSize`` block is built from
  ``gameBoardColumns``; the function also clamps the block back inside the board
  near the right/bottom edges so a piece never spills off the grid.

Because each multi-cell piece consumes ``elementSize²`` cells, the board
geometry caps the total number of pieces independently of ``maxElements`` (e.g.
a 28 × 29 board with ``elementSize == 2`` has 812 cells, i.e. at most 203
non-overlapping pieces).

Minimum allocation before advancing: ``minSelected``
----------------------------------------------------

``Settings.minSelected`` gates progression in SVG mode. In
:class:`SvgLevelComponent`
(:file:`esgame/v2/src/app/level/svg-level/svg-level.component.ts`) the
``nextLevel()`` override compares the **percentage** of editable fields that are
filled against ``minSelected / 100``:

.. code-block:: typescript

   override nextLevel() {
       const selected = this.gameService.getPercentageSelectedFields();
       this.currentlySelectedPercentage = (this.gameService.getPercentageSelectedFields() * 100).toFixed(1);
       if (selected >= (this.minSelected / 100)) {
           super.nextLevel();
       } else {
           (document.getElementById('svg-level-dialog') as any).showModal();
       }
   }

``getPercentageSelectedFields()`` in :class:`GameService` returns
``selectedFields.length / (editable fields on the focused board)``. So
``minSelected`` is interpreted as a **percent of editable zones** that must be
allocated before "Next Level" proceeds; otherwise a warning dialog is shown.

Value-range parameters: ``minValue`` / ``maxValue``
---------------------------------------------------

``Settings.minValue`` and ``Settings.maxValue`` are **not** piece-count limits.
They are the raster value range used to color GeoTIFF maps in
:class:`TiffService` (``getTiffSvgDataUrl`` / ``arrayToImage`` /
``getSvgBackground``) and to build map legends. They are listed here only to
prevent confusion: they bound *map rendering values*, not the number of pieces.

Default production type: ``defaultProductionType``
--------------------------------------------------

``Settings.defaultProductionType`` is the production-type ``id`` applied to
**unselected** editable fields when an allocation is sent to the dynamic
calculator. In ``goToNextLevel`` the allocation is built from both selected and
not-selected fields, defaulting the land-use code of an empty field to
``defaultProductionType`` (see the dynamic scoring section below).


Numeric parameters reference
============================

Source of fixed parameters
---------------------------

All these parameters are loaded from the runtime config JSON into
:class:`Settings` via ``mapData(data)``
(:file:`esgame/v2/src/app/shared/models/settings.ts`). Per-production-type
``maxElements`` lives on each entry of ``Settings.productionTypes`` and is
copied onto :class:`ProductionType` when boards are initialised
(``initialiseGridMode`` / ``initialiseSVGMode`` in :class:`GameService`).

.. list-table:: Fixed numeric parameters
   :header-rows: 1
   :widths: 22 30 24 24

   * - Parameter (source field)
     - Meaning / role
     - GRID example
       (``dataGridExample.json``)
     - SVG example
       (``data.json``)
   * - ``maxElements``
       (``Settings.productionTypes[].maxElements``;
       ``ProductionType.maxElements``)
     - Max pieces per production type; ``0`` = unlimited. Enforced in
       ``canFieldBePlaced``.
     - ``4`` (each of *Arable land* id 10 and *Livestock* id 20)
     - ``700`` (each of id 10 and id 20)
   * - ``elementSize``
       (``Settings.elementSize``)
     - Cells per piece edge; piece footprint is ``elementSize²`` cells (GRID).
       Used by ``getAssociatedFields``.
     - ``2`` (each piece = 4 cells)
     - ``1`` (one zone per piece)
   * - ``gameBoardColumns``
       (``Settings.gameBoardColumns``)
     - Board width in cells; used by ``getAssociatedFields`` for block layout /
       edge clamping.
     - ``28``
     - ``28``
   * - ``gameBoardRows``
       (``Settings.gameBoardRows``)
     - Board height in cells; used for bottom-edge clamping of multi-cell pieces.
     - ``29``
     - ``29``
   * - ``minSelected``
       (``Settings.minSelected``)
     - Min percent of editable fields filled before "Next Level" (SVG gate).
     - *(absent → 0)*
     - ``1``
   * - ``minValue``
       (``Settings.minValue``)
     - Lower bound of raster values for map coloring/legend (not a piece count).
     - *(absent)*
     - ``0``
   * - ``maxValue``
       (``Settings.maxValue``)
     - Upper bound of raster values for map coloring/legend (not a piece count).
     - *(absent)*
     - ``375``
   * - ``defaultProductionType``
       (``Settings.defaultProductionType``)
     - Land-use code used for empty fields when posting the allocation to the
       calculator.
     - *(absent)*
     - ``10`` (parsed to int ``10``)
   * - ``mapMode`` → ``mode``
       (``Settings.mode``)
     - ``"svg"`` → ``'SVG'`` (dynamic); anything else → ``'GRID'`` (static).
     - ``grid`` → ``GRID``
     - ``svg`` → ``SVG``
   * - ``infiniteLevels``
       (``Settings.infiniteLevels``)
     - Whether the player may keep generating new levels.
     - ``false``
     - ``true``

.. note::

   GRID config files such as :file:`dataGridExample.json` omit ``minSelected``,
   ``minValue``, ``maxValue`` and ``defaultProductionType``; ``mapData`` simply
   assigns ``undefined`` for the missing keys. Those parameters are meaningful
   only in SVG/dynamic mode.

Production types and maps in the examples
-----------------------------------------

Both example configs define two production types and a parallel set of maps.
Each suitability/consequence map names the production-type ``id`` it applies to
via its ``productionTypes`` array, which is how a map becomes that production
type's ``suitabilityMap`` or one of its ``consequenceMaps``.

.. list-table:: Example production types
   :header-rows: 1
   :widths: 14 28 14 22 22

   * - ``id``
     - Name (en)
     - GRID ``maxElements``
     - SVG ``maxElements``
     - ``fieldColor``
   * - ``10``
     - Arable land
     - ``4``
     - ``700``
     - ``#FFF`` (GRID) / ``#40916c`` (SVG)
   * - ``20``
     - Livestock
     - ``4``
     - ``700``
     - ``#FFF`` (GRID) / ``#ff9900`` (SVG)


Selection, placement, deselection
==================================

Input handling
--------------

The clickable behavior lives in :class:`FieldBaseComponent`
(:file:`esgame/v2/src/app/field/field-base.component.ts`), shared by the two
concrete field components. ``addClickListener`` toggles a field on
``mousedown``:

.. code-block:: typescript

   if (this.field.assigned) this.gameService.deselectField(this.field.id);
   else this.gameService.selectField(this.field.id);

``addHoverListener`` calls ``shouldSelect`` / ``shouldDeselect`` (abstract) and
otherwise previews via ``highlightOnOtherFields``.

* :class:`GridFieldComponent`
  (:file:`esgame/v2/src/app/field/grid-field/grid-field.component.ts`):
  ``shouldSelect`` and ``shouldDeselect`` both return ``false`` — GRID placement
  is click-only. ``assign`` sets ``field.assigned = true`` and the field's
  ``productionType``; ``unassign`` clears them.
* :class:`SvgFieldComponent`
  (:file:`esgame/v2/src/app/field/svg-field/svg-field.component.ts`): supports
  click-and-drag painting — ``shouldSelect`` is
  ``e.buttons == 1 || e.shiftKey`` and ``shouldDeselect`` is
  ``e.buttons == 2 || e.ctrlKey``. ``assign`` is a no-op unless
  ``field.editable``. Placed fills use ``productionType.fieldColor`` (with a
  ``7D`` alpha suffix when ``hasOpacity``), or an SVG ``pattern`` reference.

Placement (``selectField``)
---------------------------

``selectField(id)`` in :class:`GameService`:

.. code-block:: typescript

   selectField(id: number) {
       let fields = this.getAssociatedFields(id);
       if (!this.canFieldBePlaced(fields)) { this.removeHighlight(); return; }
       if (this.selectedProductionType.value != null) {
           let selectedField = new SelectedField(fields, this.selectedProductionType.value);
           this.selectedFields.next([...this.selectedFields.value, selectedField]);
       }
   }

It (1) expands the hovered id into its footprint via ``getAssociatedFields``,
(2) runs the ``canFieldBePlaced`` guard (the count cap + overlap check), and (3)
appends a new ``SelectedField`` for the currently selected production type.
Constructing the ``SelectedField`` immediately computes its per-map ``scores``
via ``updateScore()``.

Deselection (``deselectField``)
-------------------------------

``deselectField(id)`` removes any ``SelectedField`` whose footprint contains the
clicked id, freeing up the cap for that production type:

.. code-block:: typescript

   deselectField(id: number) {
       this.selectedFields.next(this.selectedFields.value.filter(o => !o.fields.map(f => f.id).includes(id)));
   }


Multi-field association
=======================

``getAssociatedFields(id)`` (private, :class:`GameService`) computes the set of
field ids that move together as one piece, returning ``HighlightField`` objects
that also carry a ``HighlightSide`` so the UI can draw a single outline around
the block:

* When ``elementSize == 1``, the piece is the single field with
  ``HighlightSide.ALLSIDES``.
* When ``elementSize > 1``, a contiguous ``elementSize`` × ``elementSize`` block
  is generated from ``gameBoardColumns``; ids near the right edge are shifted
  left (``id - (id % columns) + columns - elementSize``) and ids near the bottom
  are shifted up so the block always fits within ``gameBoardColumns`` ×
  ``gameBoardRows``. ``getSide`` assigns each member cell the correct edge/corner
  highlight (``--top-left``, ``--top``, … ``--bottom-right``, or ``--all-sides``/
  ``none`` internally).

The same ``getAssociatedFields`` result feeds both placement
(``selectField`` / ``canFieldBePlaced``) and the live hover preview
(``highlightOnOtherFields``), guaranteeing the highlighted block and the
actually-placed block are identical.


Level progression and carry-over
================================

A :class:`Level` (:file:`esgame/v2/src/app/shared/models/level.ts`) holds a
``levelNumber``, its ``gameBoards``, the ``selectedFields`` snapshot, an
``isReadOnly`` flag, ``showConsequenceMaps``, computed ``scores``, and an
optional ``scoreImage``. Levels are kept in the private ``levels: Level[]``
array of :class:`GameService`.

``goToNextLevel``
-----------------

``goToNextLevel()`` distinguishes two cases:

* **Already at the highest existing level.** A brand-new level must be built.
  If ``settings.calcUrl`` is set (dynamic), the current allocation is POSTed to
  the calculator and ``prepareNextLevel(result, score)`` runs on the response;
  otherwise ``prepareNextLevel()`` runs locally (static GRID).
* **Revisiting an already-built level.** The existing ``Level`` is fetched by
  ``levelNumber + 1``; each production type's ``consequenceMaps`` are rebuilt by
  re-attaching that level's consequence boards (matched by
  ``maps[].productionTypes``), and ``selectedFields`` is restored from that
  level's snapshot. ``goToPreviousLevel`` mirrors this for ``levelNumber - 1``.

What carries over
-----------------

In ``prepareNextLevel`` the **placement carries over**: the previous level is
marked ``isReadOnly = true`` and a copy of ``selectedFields`` is stored on it,
while the same ``selectedFields`` remain the live allocation for the new level
(``this.selectedFields.next(this.selectedFields.value)``). The board set is
extended:

* **GRID:** the new level reuses ``previousLevel.gameBoards`` and **adds** the
  consequence maps that were not yet present; each newly added consequence board
  is appended to the matching production types' ``consequenceMaps``. Then every
  ``SelectedField`` re-runs ``updateScore()`` so the now-visible consequence
  penalties are folded into each piece's score. (This is the "Round 2 reveals
  the externalities" mechanic — the placement is unchanged, only the visible
  consequence maps and therefore the net scores change.)
* **SVG:** the previous boards minus old consequence maps are kept; a fresh
  background and the consequence boards returned by the calculator
  (``calculationResult.results``) are loaded, the level ``scores`` are built from
  the calculator results, and an optional summary image
  (result with ``id == "-1"``) becomes ``level.scoreImage``.

Whether a player may keep generating levels is governed by
``Settings.infiniteLevels`` (``true`` for the SVG example, ``false`` for the
GRID example).


Scoring
=======

Scoring has two completely different code paths depending on ``Settings.mode``.

The per-piece score
-------------------

Every placed piece scores itself in ``SelectedField.updateScore()``
(:file:`field.ts`): it adds the suitability-map score for its field ids and
subtracts each consequence-map score:

.. code-block:: typescript

   updateScore() {
       var idsOnly = this.fields.map(o => o.id);
       if (this.productionType?.suitabilityMap) {
           this.scores.push({ id: this.productionType.suitabilityMap.id,
                              score: this.productionType.suitabilityMap.getScore(idsOnly) });
           this.productionType.consequenceMaps.forEach(o => {
               this.scores.push({ id: o.id, score: o.getScore(idsOnly) * -1 });
           });
       }
   }

``GameBoard.getScore(ids)`` (:file:`game-board.ts`) simply sums the per-field
``score`` values for the given ids. Note ``ProductionType.getScore`` computes
``suitability − Σ consequences``, and ``SelectedField`` stores consequence
contributions already negated.

Static (GRID) scoring — client-side, no backend
------------------------------------------------

When ``calcUrl`` is empty (GRID/static), all scoring happens in the browser via
:class:`ScoreService` (:file:`esgame/v2/src/app/services/score.service.ts`) and
:class:`ScoreBoardComponent`
(:file:`esgame/v2/src/app/score-board/score-board.component.ts`):

* ``ScoreService.createEmptyScoreEntry(level, shownBoards)`` produces one
  ``ScoreEntry { id, score: 0 }`` per visible board (by default the suitability
  and consequence boards of the level).
* ``ScoreService.calculateScore(scores, fields)`` fills each entry by summing,
  across all placed ``SelectedField``\ s, that field's contribution for the
  matching board id:

  .. code-block:: typescript

     score.score = fields.reduce((a, b) => a + (b.scores.find(o => o.id == score.id)?.score ?? 0), 0);

* The score board subscribes to ``selectedFieldsObs`` and recomputes live; the
  displayed total is ``Σ scores`` (``calculateTotalScore``). Because consequence
  contributions are stored negative, the total is the **net** score, and it
  drops when Round 2 reveals consequence maps — matching the example's
  instruction text (reach ``9725`` in Round 1, ``4100`` net in Round 2 in
  :file:`dataGridExample.json`).

Dynamic (SVG) scoring — backend calculator
------------------------------------------

When ``calcUrl`` is set (SVG/dynamic), advancing a level POSTs the allocation to
the external calculator. In ``goToNextLevel`` (:class:`GameService`):

.. code-block:: typescript

   let inputData = {} as { allocation: { id: number, lulc: number }[], round: number, score: number, game_id: string};
   const allFields = [...this.selectedFields.value, ...this.notSelectedFields.value];
   inputData.allocation = allFields.map((o) => ({ id: o.fields[0].id, lulc: o.productionType?.id ?? this.settings.value.defaultProductionType }));
   inputData.round  = this.currentLevel.value!.levelNumber;
   const entries = this.scoreService.createEmptyScoreEntry(this.currentLevel.value, [GameBoardType.SuitabilityMap]);
   this.scoreService.calculateScore(entries, this.selectedFields.value);
   inputData.score  = entries.reduce((a, b) => a + b.score, 0);
   inputData.game_id = this.gameId;
   this.apiService.postRequest(this.settings.value.calcUrl, inputData).subscribe(...);

Key points:

* The request body is ``{ allocation, round, score, game_id }``. ``allocation``
  is one ``{ id, lulc }`` per zone over **all** editable fields — placed pieces
  use their ``productionType.id``; empty fields default to
  ``Settings.defaultProductionType``.
* ``score`` sent to the backend is the **suitability-only** total computed
  locally (``createEmptyScoreEntry(..., [GameBoardType.SuitabilityMap])``), i.e.
  the Round-1 income before externalities.
* ``game_id`` is a per-session ``uuid.v4()`` generated once in
  :class:`GameService`.
* The response is a :class:`CalculationResult`
  (:file:`esgame/v2/src/app/shared/models/calculation-result.ts`) — a list of
  ``Result { name, id, score, url }``. In ``prepareNextLevel`` each result's
  ``url`` becomes a consequence map's ``urlToData``, and the level ``scores`` are
  built as ``[{ id: "all", score: previousScore }, ...results (id != "-1")
  mapped to score: -(score*100)]``; the result with ``id == "-1"`` supplies the
  summary ``scoreImage``.

In other words, in dynamic mode the **suitability (income) score is computed
client-side and sent up**, while the **consequence penalties and the new
consequence maps are computed by the backend** and returned for display. The
reference backends are the FastAPI calculator in
:file:`esgame/examples/esgame-dynamic` and the R calculators at
:file:`esgame/tools/R/calculator.r` / :file:`places/calculation/calculation.r`.
