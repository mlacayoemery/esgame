============================
Frontend Services Reference
============================

This page documents the Angular injectable services that drive the **esgame**
front-end (the Angular v2 app under :file:`esgame/v2`). All five services live
in :file:`esgame/v2/src/app/services/` and are registered with
``@Injectable({ providedIn: 'root' })``, so each is a singleton available to the
whole application.

The services split into two layers:

* **Plumbing** — :ref:`ConfigService <svc-config>` (runtime deployment config),
  :ref:`ApiService <svc-api>` (thin ``HttpClient`` wrapper), and
  :ref:`TiffService <svc-tiff>` (GeoTIFF decoding to grids / SVG paths / data
  URLs).
* **Game logic** — :ref:`GameService <svc-game>` (the central state machine for
  levels, fields, production types, and scoring) and
  :ref:`ScoreService <svc-score>` (per-board score aggregation).

The app runs in one of two **modes** (the ``mode`` field on ``Settings``):
``GRID`` (the client-side "static" game, no backend) and ``SVG`` (the "dynamic"
game backed by a calculator at ``settings.calcUrl``). Both modes flow through
``GameService``.

.. contents:: On this page
   :local:
   :depth: 2


.. _svc-config:

ConfigService
=============

**File:** :file:`esgame/v2/src/app/services/config.service.ts`

Loads deployment configuration from :file:`assets/config.json` at runtime
instead of baking it into the bundle, so a single build / container image can
serve any deployment by mounting or overriding :file:`assets/config.json` and
the referenced data files (no rebuild required). It is resolved once at startup
via an ``APP_INITIALIZER`` and falls back to ``DEFAULT_CONFIG`` when
:file:`assets/config.json` is absent. Constructed with an injected
``HttpClient``.

The ``AppConfig`` interface
---------------------------

``getGameData`` returns the game settings JSON merged with the overrides below.
The interface (and the optional override semantics) is defined in the same file:

.. list-table:: ``AppConfig`` fields
   :header-rows: 1
   :widths: 22 14 64

   * - Field
     - Type
     - Meaning
   * - ``staticDataUrl``
     - ``string``
     - URL (relative to ``<base href>``) of the grid / "static" game settings
       JSON. Default ``'assets/dataGridExample.json'``.
   * - ``dynamicDataUrl``
     - ``string``
     - URL (relative to ``<base href>``) of the SVG / "dynamic" game settings
       JSON. Default ``'assets/data.json'``.
   * - ``calcUrl``
     - ``string`` (optional)
     - Override for the calculation backend URL. When present it replaces the
       ``calcUrl`` baked into the game data, so the same build can target any
       backend (or none). An empty string forces fully client-side play (no
       backend) — used by the static GitHub Pages deployment.
   * - ``defaultMode``
     - ``'static' | 'dynamic'`` (optional)
     - Which game the site root (``/``) launches. Default ``'static'``. The
       start page stays at ``/config`` either way.
   * - ``gridLineColor``
     - ``string`` (optional)
     - SVG-mode cell border (grid line) color, overriding the game data /
       built-in default.
   * - ``gridLineWidth``
     - ``string`` (optional)
     - SVG-mode cell border (grid line) width, e.g. ``"0.05px"``.
   * - ``highlightWidth``
     - ``string`` (optional)
     - SVG-mode hover-highlight border width (board units), e.g. ``"1"``.

The module-level constant ``DEFAULT_CONFIG`` is
``{ staticDataUrl: 'assets/dataGridExample.json', dynamicDataUrl: 'assets/data.json', defaultMode: 'static' }``.

Methods and properties
----------------------

``load(): Promise<void>``
~~~~~~~~~~~~~~~~~~~~~~~~~~~

GETs :file:`assets/config.json` (typed ``Partial<AppConfig>``) via
``HttpClient``. If the request errors, ``catchError`` substitutes an empty
object (``of({})``), so a missing file is not fatal. On resolution it merges the
result over the defaults (``this.config = { ...DEFAULT_CONFIG, ...cfg }``).
Returns a ``Promise<void>`` (produced with ``firstValueFrom``), which is what
the ``APP_INITIALIZER`` awaits.

* **Parameters:** none.
* **Returns:** ``Promise<void>`` — resolves once config is loaded/merged.

``get appConfig(): AppConfig``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Getter exposing the currently resolved configuration object (defaults merged
with :file:`assets/config.json`).

* **Returns:** ``AppConfig`` — the resolved config.

``getGameData(mode: 'static' | 'dynamic'): Observable<any>``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Fetches the game settings JSON for the given mode and applies the config-level
overrides.

* **Parameters:**

  * ``mode: 'static' | 'dynamic'`` — selects which URL to fetch:
    ``staticDataUrl`` for ``'static'``, otherwise ``dynamicDataUrl``.

* **Returns:** ``Observable<any>`` — the parsed settings object.
* **Behavior:** GETs the chosen URL, then in a ``map`` clones the response and
  conditionally overrides ``calcUrl``, ``gridLineColor``, ``gridLineWidth``, and
  ``highlightWidth`` from ``AppConfig`` whenever those config fields are
  ``!== undefined`` (so an empty-string ``calcUrl`` *does* override). Note: only
  these four fields are overridden; ``staticDataUrl`` / ``dynamicDataUrl`` /
  ``defaultMode`` are consumed by the service itself, not injected into the
  returned data.


.. _svc-api:

ApiService
==========

**File:** :file:`esgame/v2/src/app/services/api.service.ts`

A thin wrapper over Angular's ``HttpClient`` for talking to the calculation
backend. It holds no state and applies no headers or transforms — it simply
forwards calls. Constructed with an injected ``HttpClient`` (stored as
``client``). ``GameService`` uses ``postRequest`` to submit an allocation to the
backend calculator.

Methods
-------

``getRequest(url: string): Observable<Object>``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

* **Parameters:** ``url: string`` — the URL to GET.
* **Returns:** ``Observable<Object>`` — directly returns ``this.client.get(url)``.
* **Does:** issues an HTTP GET. (Not referenced by ``GameService``; provided for
  completeness of the API surface.)

``postRequest(url: string, body: any): Observable<Object>``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

* **Parameters:**

  * ``url: string`` — the endpoint to POST to (in practice
    ``settings.calcUrl``).
  * ``body: any`` — the JSON payload. ``GameService.goToNextLevel`` posts an
    object with ``allocation`` (array of ``{ id, lulc }``), ``round``,
    ``score``, and ``game_id``.

* **Returns:** ``Observable<Object>`` — directly returns
  ``this.client.post(url, body)``.
* **Does:** issues an HTTP POST. The response is consumed by ``GameService`` and
  cast to ``CalculationResult``.


.. _svc-tiff:

TiffService
===========

**File:** :file:`esgame/v2/src/app/services/tiff.service.ts`

Decodes GeoTIFF rasters (via the ``geotiff`` library's ``fromUrl`` / ``fromBlob``)
into the data structures the board components render. It produces three flavors
of output:

* **Grid game boards** (``GRID`` mode) — one ``Field`` per pixel, colored by a
  discrete gradient keyed on the raster's unique values.
* **SVG game boards / overlays** (``SVG`` mode) — vector ``path`` strings
  (via ``tiffToSvgPaths``) for the editable drawing overlay, plus raster→PNG
  ``data:`` URLs for background and consequence imagery.

All public methods return RxJS ``Observable``\ s that wrap the underlying
``async`` helpers via ``from(...)``. The private helpers do the actual decoding,
gradient mapping, and canvas-based PNG encoding.

Public game-board builders
--------------------------

``getGridGameBoard(id, url, defaultGradient, gameBoardType)``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Builds a discrete grid board for ``GRID`` mode.

* **Parameters:**

  * ``id: string`` — board id.
  * ``url: string`` — GeoTIFF URL.
  * ``defaultGradient: DefaultGradients`` — gradient key looked up in
    ``gradients``.
  * ``gameBoardType: GameBoardType`` — board kind (e.g. ``SuitabilityMap``,
    ``ConsequenceMap``).

* **Returns:** ``Observable<GameBoard>``.
* **Does:** reads the raster (``getTiffData``), computes the sorted set of
  ``uniqueValues``, looks up the ``Gradient``, and builds a ``Legend`` whose
  ``elements`` map each unique value to ``gradient.colors[i]`` (with
  ``isNegative`` true when ``gameBoardType == ConsequenceMap`` and
  ``isGradient: false``). It then maps every raster cell to a ``Field`` colored
  by its value's index into ``uniqueValues``, and returns a ``GameBoard(id,
  gameBoardType, fields, legend)``.

``getSvgGameBoard(id, url, gameBoardType, defaultGradient, overlay, minValue, maxValue)``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Builds a continuous (gradient) SVG board — a background data-URL image plus
per-field scores sampled at the overlay's pixels.

* **Parameters:**

  * ``id: string`` — board id.
  * ``url: string`` — GeoTIFF URL.
  * ``gameBoardType: GameBoardType`` — board kind.
  * ``defaultGradient: DefaultGradients`` — gradient key.
  * ``overlay: GameBoard`` — the drawing overlay whose ``fields`` (with
    ``startPos``) define where to sample.
  * ``minValue: number`` — gradient lower bound.
  * ``maxValue: number`` — gradient upper bound.

* **Returns:** ``Observable<GameBoard>``.
* **Does:** decodes the raster into a PNG data URL plus the numeric raster
  (``getTiffSvgDataUrl``). Builds a two-stop gradient ``Legend``
  (``minValue → calculateColor(1)``, ``maxValue → calculateColor(0)``, with
  ``isGradient: true`` and ``isNegative`` set for ``ConsequenceMap``). Each
  overlay field is copied and given ``score: Math.round(data.numRaster[field.startPos])``.
  Returns a ``GameBoard`` constructed with the SVG flag, ``data.width``,
  ``data.height``, and ``data.dataUrl``.

``getOverlayGameBoard(id, url, gameBoardType)``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Builds the editable vector overlay (the drawing map) for ``SVG`` mode.

* **Parameters:**

  * ``id: string`` — board id.
  * ``url: string`` — GeoTIFF URL of the drawing map.
  * ``gameBoardType: GameBoardType`` — board kind (``DrawingMap``).

* **Returns:** ``Observable<GameBoard>``.
* **Does:** converts the raster to SVG paths (``getTiffSvgData`` →
  ``tiffToPaths``). For each ``path`` it creates a ``Field`` carrying the path
  string and ``startPos``; the field is marked ``editable`` when its id is not
  the ``nodata`` value (``path.id != data.nodata``). Returns a ``GameBoard``
  (no legend) flagged as SVG with ``data.width`` / ``data.height``.

``getSvgBackground(url, minValue, maxValue, customColors): Observable<string>``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Renders a background raster to a PNG ``data:`` URL using a discrete
``CustomColors`` palette (rather than a gradient).

* **Parameters:**

  * ``url: string`` — GeoTIFF URL.
  * ``minValue: number`` — lower bound passed through to the encoder.
  * ``maxValue: number`` — upper bound passed through to the encoder.
  * ``customColors: CustomColors`` — value→RGBA palette used to color cells.

* **Returns:** ``Observable<string>`` — emits ``data.dataUrl`` (the PNG data
  URL string). Internally calls ``getTiffSvgDataUrl`` with no gradient and the
  given ``colors``.

Public decoding helpers
-----------------------

These wrap the private ``async`` decoders in ``from(...)`` so callers get an
``Observable``.

``getTiffData(url: string)``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

* **Parameters:** ``url: string`` — GeoTIFF URL.
* **Returns:** ``Observable<number[]>`` — the flat numeric raster, via
  ``from(tiffToArray(url))``.

``getTiffSvgDataUrl(url, minValue, maxValue, gradient?, colors?)``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

* **Parameters:**

  * ``url: string`` — GeoTIFF URL.
  * ``minValue: number`` — gradient/encoder lower bound.
  * ``maxValue: number`` — gradient/encoder upper bound.
  * ``gradient?: Gradient`` — optional continuous gradient for coloring.
  * ``colors?: CustomColors`` — optional discrete palette (used when no
    gradient).

* **Returns:** ``Observable<{ width, height, dataUrl, nodata, numRaster }>`` via
  ``from(prepareDataUrl(...))`` — width/height in pixels, the PNG ``dataUrl``,
  the ``nodata`` value, and the numeric ``numRaster`` array.

``getTiffSvgData(url: string)``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

* **Parameters:** ``url: string`` — GeoTIFF URL.
* **Returns:** ``Observable<{ width, height, pathArray, nodata }>`` via
  ``from(tiffToPaths(url))`` — vector ``pathArray`` (each
  ``{ id, path, startPos }``) plus dimensions and ``nodata``.

Private helpers (decoding internals)
------------------------------------

Not part of the injectable surface, but they define the data shapes above:

* ``prepareDataUrl(url, minValue, maxValue, gradient?, colors?)`` — fetches the
  URL as a blob (the comment notes ``fromUrl`` throws, so ``fromBlob`` is used),
  reads interleaved rasters, then calls ``arrayToImage`` to produce the PNG.
  Returns ``{ width, height, dataUrl, nodata, numRaster }``.
* ``tiffToPaths(url)`` — uses ``fromUrl`` + ``tiffToSvgPaths`` (width from image,
  ``scale: 1``) to build the ``pathArray``; each entry's ``startPos`` is
  ``numRaster.indexOf(key)``.
* ``tiffToArray(url)`` — uses ``fromUrl`` and returns the flat raster as
  ``number[]``.
* ``arrayToImage(data, columns, noData, minValue, maxValue, gradient?, colors?)``
  — builds an RGBA buffer: with a ``gradient``, ``noData`` cells become
  transparent white (``255,255,255,0``) and others are colored via
  ``gradient.calculateColorRGB(1 - 1/(maxValue - minValue) * (value - minValue))``
  at full alpha; with ``colors`` it pushes ``colors.getRgb(value)``. Delegates to
  ``arrayToDataUrl``.
* ``arrayToDataUrl(data, width, height)`` — writes the RGBA buffer to an
  off-screen ``<canvas>`` and returns ``canvas.toDataURL()`` (adapted from a
  Stack Overflow snippet cited in the source).


.. _svc-score:

ScoreService
============

**File:** :file:`esgame/v2/src/app/services/score.service.ts`

Stateless helper that aggregates per-field scores into per-board totals. It
operates on the ``ScoreEntry`` shape (also exported from this file).

The ``ScoreEntry`` class
------------------------

.. list-table:: ``ScoreEntry`` fields
   :header-rows: 1
   :widths: 16 14 70

   * - Field
     - Type
     - Meaning
   * - ``id``
     - ``string``
     - Board id the score belongs to.
   * - ``score``
     - ``number``
     - Aggregated score for that board.

Methods
-------

``createEmptyScoreEntry(level, shownBoards = [ConsequenceMap, SuitabilityMap])``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Produces one zeroed ``ScoreEntry`` per distinct board (of the requested types)
on a level.

* **Parameters:**

  * ``level: Level | null`` — the level to scan; if ``null`` (or falsy) the
    method returns ``[]``.
  * ``shownBoards = [GameBoardType.ConsequenceMap, GameBoardType.SuitabilityMap]``
    — which ``GameBoardType``\ s to include. ``GameService`` calls it with
    ``[GameBoardType.SuitabilityMap]`` when computing the score to POST.

* **Returns:** ``ScoreEntry[]`` — one ``{ id, score: 0 }`` per matching board,
  de-duplicated by ``id``.

``calculateScore(scores, fields)``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Fills in the ``score`` of each entry by summing the matching per-board scores
across the selected fields.

* **Parameters:**

  * ``scores: ScoreEntry[]`` — entries to mutate (typically from
    ``createEmptyScoreEntry``).
  * ``fields: SelectedField[]`` — the placed fields, each carrying a ``scores``
    array of ``{ score, id }``.

* **Returns:** ``void`` — mutates ``scores`` in place. For each entry,
  ``score.score`` becomes the sum over ``fields`` of the field's
  ``scores.find(o => o.id == score.id)?.score ?? 0``.


.. _svc-game:

GameService
===========

**File:** :file:`esgame/v2/src/app/services/game.service.ts`

The central state machine of the game. It owns level/field/production-type
state as RxJS ``BehaviorSubject``\ s, exposes them as observables for the UI,
and orchestrates board construction (via ``TiffService``), scoring (via
``ScoreService``), and backend calculation (via ``ApiService``). It supports
both ``GRID`` and ``SVG`` modes.

Constructed with injected ``TiffService``, ``ScoreService``,
``TranslateService`` (ngx-translate), and ``ApiService``. A per-session
``gameId`` is generated with ``uuid.v4()`` and sent to the backend as
``game_id``.

Observable surface (public properties)
--------------------------------------

Each backing ``BehaviorSubject`` is private; the public ``*Obs`` observable is
what components subscribe to.

.. list-table:: Public observables
   :header-rows: 1
   :widths: 30 34 36

   * - Property
     - Emits
     - Meaning
   * - ``highlightFieldObs``
     - ``HighlightField[]``
     - Fields currently highlighted under the cursor / pending placement.
   * - ``currentLevelObs``
     - ``Level | null``
     - The level currently displayed.
   * - ``settingsObs``
     - ``Settings``
     - The active game settings (built from loaded data).
   * - ``productionTypesObs``
     - ``ProductionType[]``
     - The available land-use / production types.
   * - ``selectedProductionTypeObs``
     - ``ProductionType | null``
     - The production type the player is currently placing.
   * - ``selectedFieldsObs``
     - ``SelectedField[]``
     - Placed fields. The pipe's ``tap`` side-effects ``currentLevel.selectedFields``
       to keep the level in sync.
   * - ``notSelectedFieldsObs``
     - ``SelectedField[]``
     - Editable fields left unplaced (computed by ``getPercentageSelectedFields``).
   * - ``focusedGameBoardObs``
     - ``GameBoard | null``
     - The board the player is interacting with.
   * - ``currentlySelectedFieldObs``
     - ``SelectedField | null``
     - The field under the active highlight.
   * - ``helpWindowObs``
     - ``boolean``
     - Whether the help window is open.
   * - ``loadingIndicatorObs``
     - ``boolean[]``
     - A stack of in-flight loads; non-empty means "loading".

Selection & highlighting
------------------------

``highlightOnOtherFields(id: any): void``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

* **Parameters:** ``id: any`` — the hovered field id.
* **Does:** computes the associated field group (``getAssociatedFields``), sets
  ``currentlySelectedField`` to a new ``SelectedField`` of those ids with the
  active production type, and — if the group *can* be placed
  (``canFieldBePlaced``) — publishes it to ``highlightFields``. If it cannot be
  placed, calls ``removeHighlight`` and returns.

``removeHighlight(): void``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

* **Does:** clears ``highlightFields`` (to ``[]``) and ``currentlySelectedField``
  (to ``null``).

``setSelectedProductionType(productionType: ProductionType): void``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

* **Parameters:** ``productionType: ProductionType`` — the type to make active.
* **Does:** publishes it to ``selectedProductionType``.

``selectField(id: number): void``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

* **Parameters:** ``id: number`` — the clicked field id.
* **Does:** resolves the associated field group; if it cannot be placed,
  calls ``removeHighlight`` and returns. Otherwise, when a production type is
  active, appends a new ``SelectedField`` (group + type) to ``selectedFields``.

``deselectField(id: number): void``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

* **Parameters:** ``id: number`` — a field id within a placed group.
* **Does:** removes from ``selectedFields`` any entry whose ``fields`` contain
  that id.

``selectGameBoard(boardData: GameBoard): void``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

* **Parameters:** ``boardData: GameBoard`` — the board to focus.
* **Does:** publishes it to ``focusedGameBoard``.

Level flow
----------

``goToNextLevel(): void``
~~~~~~~~~~~~~~~~~~~~~~~~~~~

Advances the game. Behavior depends on whether the current level is the highest
loaded level and whether a backend is configured.

* **When already on the highest level and ``settings.calcUrl`` is set** (dynamic
  play): turns on the loading indicator, builds the backend payload, and POSTs
  it via ``apiService.postRequest(settings.calcUrl, inputData)``. The payload is
  typed ``{ allocation: { id: number, lulc: number }[], round: number, score:
  number, game_id: string }`` where:

  * ``allocation`` — every field (selected + not-selected) mapped to
    ``{ id: o.fields[0].id, lulc: o.productionType?.id ?? settings.defaultProductionType }``.
  * ``round`` — ``currentLevel.levelNumber``.
  * ``score`` — sum over a fresh ``SuitabilityMap`` ``ScoreEntry`` set
    (``scoreService.createEmptyScoreEntry(level, [SuitabilityMap])`` then
    ``scoreService.calculateScore(...)``).
  * ``game_id`` — the session ``gameId``.

  On success the response is cast to ``CalculationResult`` and passed to
  ``prepareNextLevel(convertedResult, score)``; on error it logs, ``alert``\ s
  ``"Something went wrong, please try again later"``, and clears loading.

* **When already on the highest level and no ``calcUrl``** (static play): calls
  ``prepareNextLevel()`` directly.

* **When not on the highest level**: navigates forward to the existing next
  level — rebuilds each production type's ``consequenceMaps`` from that level's
  ``ConsequenceMap`` boards (matched against ``settings.maps``), then publishes
  the new ``currentLevel``, ``productionTypes``, and that level's
  ``selectedFields``.

``goToPreviousLevel(): void``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

* **Does:** if not already on the lowest level, finds the level numbered one
  below the current, rebuilds each production type's ``consequenceMaps`` from
  that level's ``ConsequenceMap`` boards, then publishes the previous
  ``currentLevel`` and its ``selectedFields``. Toggles the loading indicator
  around the work.

``prepareNextLevel(calculationResult?, previousScore?): void``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Constructs and publishes a brand-new level (the consequence/result level after
a placement round). Branches on ``settings.mode``.

* **Parameters:**

  * ``calculationResult: CalculationResult | undefined = undefined`` — backend
    results (``SVG`` mode); each ``Result`` carries ``id``, ``score``, ``url``.
  * ``previousScore: number | undefined = undefined`` — the suitability score of
    the round just submitted, stored as the ``"all"`` score entry.

* **Does (common):** creates a ``Level`` numbered ``previousLevel + 1`` with
  ``showConsequenceMaps = true``, pushes it onto ``levels``, marks the previous
  level ``isReadOnly`` and snapshots its ``selectedFields``.

* **``GRID`` mode:** builds the not-yet-shown ``ConsequenceMap`` boards via
  ``getGridGameBoard`` (over ``TiffService``), attaches them to the matching
  production types' ``consequenceMaps``, re-runs ``updateScore`` on every
  selected field, and publishes the new level and selected fields.

* **``SVG`` mode:** uses the current ``DrawingMap`` overlay and the
  ``BackgroundMap``. If a ``calculationResult`` is present, it points each
  consequence map's ``urlToData`` at the matching result ``url``, sanitizes
  ``NaN`` scores to ``0``, and builds ``level.scores`` as
  ``[{ id: "all", score: previousScore }, ...results (id != "-1") mapped to
  { id, score: -(score*100) }]``. A result with ``id == "-1"`` is treated as a
  ``scoreImage`` (``level.scoreImage = image.url``). It then re-renders the
  background (with 25% opacity applied via ``addTransparencyToColors("3F")``)
  and the consequence SVGs through ``TiffService``, refreshes field scores, and
  publishes.

``getSvg = (m, overlay, settings) => ...`` *(arrow property)*
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

* **Parameters:** ``m: any`` (map config), ``overlay: GameBoard``,
  ``settings: Settings``.
* **Returns:** ``Observable<GameBoard>``.
* **Does:** delegates to
  ``tiffService.getSvgGameBoard(m.id, m.urlToData, m.gameBoardType, m.gradient, overlay, settings.minValue, settings.maxValue)``.

``getGridGameBoard = (m) => ...`` *(arrow property)*
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

* **Parameters:** ``m: any`` — a map config.
* **Returns:** ``Observable<GameBoard>``.
* **Does:** delegates to
  ``tiffService.getGridGameBoard(m.id, m.urlToData, m.gradient, m.gameBoardType)``.

Initialization
--------------

``initialiseSVGMode(): void``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Bootstraps the first level for ``SVG`` mode.

* **Does:** creates level 1; builds ``CustomColors`` palettes from
  ``settings.customColors``; locates the ``DrawingMap``, ``BackgroundMap``, and
  ``SuitabilityMap`` maps. Loads the overlay via
  ``tiffService.getOverlayGameBoard``, then (``switchMap`` →
  ``combineLatest``) the SVG background and each suitability SVG board. Assigns
  ``background2`` on each board, constructs a ``ProductionType`` per configured
  type (``id``, ``fieldColor``, its suitability board, ``urlToIcon``,
  ``maxElements``), selects the first production type (deferred via
  ``setTimeout``), publishes ``currentLevel`` and ``focusedGameBoard`` (the
  drawing map), and clears loading.

``initialiseGridMode(): void``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Bootstraps the first level for ``GRID`` mode.

* **Does:** creates level 1; builds a grid board (``getGridGameBoard``) for each
  ``SuitabilityMap`` map via ``combineLatest``; constructs a ``ProductionType``
  per configured type bound to its suitability board; publishes
  ``productionTypes``, selects the first one (deferred via ``setTimeout``),
  publishes ``currentLevel`` and ``focusedGameBoard`` (first board), and clears
  loading.

State helpers
-------------

``getPercentageSelectedFields(): number``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

* **Returns:** ``number`` — fraction of editable fields on the focused board
  that have been placed (``selectedFields.length / editableFields.length``).
* **Side effect:** computes the still-unplaced editable fields and publishes
  them to ``notSelectedFields`` (each wrapped as a ``SelectedField`` with
  ``HighlightSide.ALLSIDES``).

``openHelp(close = false): void``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

* **Parameters:** ``close = false`` — when ``true``, closes the help window.
* **Does:** publishes ``!close`` to ``helpWindow``.

``loading(show = true): void``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

* **Parameters:** ``show = true`` — ``true`` pushes a ``true`` onto the loading
  stack; ``false`` pops one off.
* **Does:** mutates and re-publishes ``loadingIndicator`` (a ``boolean[]`` used
  as a counter so overlapping loads are tracked).

``resetGame(): void``
~~~~~~~~~~~~~~~~~~~~~~~

* **Does:** clears ``currentLevel``, ``highlightFields``, ``selectedFields``,
  ``currentlySelectedField``, ``productionTypes``, ``selectedProductionType``,
  and ``focusedGameBoard`` (to their empty/null values) and empties the internal
  ``levels`` array.

``loadSettings(data: any): void``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

* **Parameters:** ``data: any`` — raw game settings JSON (as returned by
  ``ConfigService.getGameData``).
* **Does:** calls ``resetGame`` then publishes a new
  ``Settings(translateService, data)`` to ``settings``.

Private helpers
---------------

These are not part of the public surface but govern placement validity and the
grid geometry of multi-cell elements:

* ``canFieldBePlaced(associatedFields = [])`` — returns ``false`` when the active
  production type's ``maxElements`` is already reached, or when any of the
  candidate fields overlaps an already-selected field; otherwise ``true``.
* ``getAssociatedFields(id)`` — given a clicked id and ``settings.elementSize``,
  returns the ``HighlightField[]`` group: for ``elementSize == 1`` a single
  ``ALLSIDES`` cell; otherwise a square block (clamped to the board's
  ``gameBoardColumns`` / ``gameBoardRows``) with per-cell border sides computed
  via ``getSide``.
* ``getSide(sides)`` — collapses a set of ``HighlightSide`` edges into the
  correct corner/edge enum (e.g. ``TOP`` + ``LEFT`` → ``TOPLEFT``), defaulting to
  ``NONE`` when empty.
