===========================================
Frontend Components, Directives, and Models
===========================================

This page is the function reference for the Angular standalone-module application that
ships in :file:`esgame/v2`. It documents the **components**, the shared **directive**, and
the domain **models** that back the two game modes:

* **GRID / "static" mode** — the client-side game (``Settings.mode === 'GRID'``,
  config ``mapMode: "grid"``). Boards are CSS-grid rasters; scoring runs in the browser.
* **SVG / "dynamic" mode** — the calculator-backed game (``Settings.mode === 'SVG'``,
  config ``mapMode: "svg"``). Boards are SVG vector maps; scoring is delegated to the
  backend calculator at ``Settings.calcUrl``.

All components are declared with ``standalone: false`` (they belong to the app's NgModule).
Most use ``ChangeDetectionStrategy.OnPush``. Selectors prefixed ``tro-`` are the public
custom-element selectors; attribute selectors (e.g. ``[troButton]``) are directives or
host-element components. Source lives under
:file:`esgame/v2/src/app`; models under :file:`esgame/v2/src/app/shared/models`.

Trivial pass-through getters/setters are omitted; behavior-bearing members are listed.

.. contents:: On this page
   :local:
   :depth: 2

Levels
======

A *level* is one round of play. The level components own the layout (left/right boards,
production-type buttons, navigation) and bootstrap the correct game mode on construction.

LevelBaseComponent (abstract)
-----------------------------

:File: :file:`level/level-base.component.ts`
:Selector: none (``template: ''``, ``OnPush``)

Abstract base shared by both level components. Wires reactive streams off ``GameService``.

**Observables / fields**

* ``level`` — ``currentLevelObs`` piped through ``tap`` that mirrors ``isReadOnly`` into the
  ``readOnly`` flag.
* ``selectedProductionType`` — ``gameService.selectedProductionTypeObs``.
* ``focusedGameBoard`` — ``focusedGameBoardObs`` filtered to non-null.
* ``leftGameBoards`` — current level's boards filtered to ``GameBoardType.SuitabilityMap``.
* ``rightGameBoards`` — ``combineLatest([level, selectedProductionType])``: emits the selected
  production type's ``consequenceMaps`` only when ``level.showConsequenceMaps`` is true, else ``[]``.
* ``productionTypes: ProductionType[]`` — kept in sync with ``productionTypesObs``.
* ``clickMode = GameBoardClickMode`` — enum exposed to the template.

In the constructor, subscribing to ``selectedProductionTypeObs`` auto-selects that type's
``suitabilityMap`` via ``gameService.selectGameBoard``.

**Methods**

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Method
     - Behavior
   * - ``nextLevel(): void``
     - Calls ``gameService.goToNextLevel()``.
   * - ``prevLevel(): void``
     - Calls ``gameService.goToPreviousLevel()``.
   * - ``openHelp(): void``
     - Calls ``gameService.openHelp()``.

GridLevelComponent
------------------

:File: :file:`level/grid-level/grid-level.component.ts`
:Selector: ``tro-grid-level``
:Extends: ``LevelBaseComponent``

GRID-mode level. Adds ``settings = gameService.settingsObs``. In its constructor it loads the
static configuration: ``configService.getGameData('static')`` → ``gameService.loadSettings(data)``
→ ``gameService.initialiseGridMode()``.

SvgLevelComponent
-----------------

:File: :file:`level/svg-level/svg-level.component.ts`
:Selector: ``tro-svg-level``
:Extends: ``LevelBaseComponent``

SVG-mode level. Loads dynamic config via ``configService.getGameData('dynamic')`` →
``loadSettings`` → ``initialiseSVGMode()``, and subscribes to ``settings`` to pick up
``minSelected`` plus the visual flags ``highlightFocusedBoard`` and ``neutralScoreColors``.

**Fields**

* ``overlayBoard`` — current level's ``GameBoardType.DrawingMap`` board.
* ``settings`` — ``gameService.settingsObs``.
* ``imageExpand = false`` — instruction-image expand toggle.
* ``minSelected = 0`` — minimum percentage of fields that must be placed before advancing.
* ``currentlySelectedPercentage: string`` — formatted percentage shown in the gate dialog.
* ``@HostBinding('class.neutral-scores') neutralScoreColors = false``.
* ``highlightFocusedBoard = false``.
* ``override level`` — like the base, but additionally calls ``openHelp()`` when there is no
  level or ``levelNumber <= 2`` and not read-only (auto-opens help on the first rounds).

**Methods**

.. list-table::
   :header-rows: 1
   :widths: 28 72

   * - Method
     - Behavior
   * - ``override nextLevel(): void``
     - Computes ``gameService.getPercentageSelectedFields()``; if it is ``>= minSelected/100``,
       calls ``super.nextLevel()``, otherwise opens the ``#svg-level-dialog`` ``<dialog>`` modal.
   * - ``switchExpand(): void``
     - Toggles ``imageExpand``.

Game boards
===========

A *game board* renders one map (suitability, consequence, drawing, or background). Boards
react to ``GameService`` streams for highlighting, selection painting, and click routing.

GameBoardBaseComponent (abstract)
---------------------------------

:File: :file:`game-board/game-board-base.component.ts`
:Selector: none (``template: ''``, ``OnPush``, ``implements OnDestroy``)

Common board behavior: subscribes to ``settingsObs`` and ``productionTypesObs``, manages a
``SubSink`` and DOM listener list, and routes board clicks.

**Inputs**

.. list-table::
   :header-rows: 1
   :widths: 26 18 56

   * - @Input
     - Type
     - Behavior
   * - ``clickMode``
     - ``GameBoardClickMode``
     - Stores ``_clickMode``; when ``SelectBoard``, attaches a click listener that selects the board.
   * - ``boardData``
     - ``GameBoard | null | undefined``
     - When set, stores it, copies ``fields`` and ``legend``, then calls the abstract ``afterBoardDataSet()``.
   * - ``hideLegend``
     - ``any``
     - Sets ``_hideLegend = value !== false`` (truthy-coercion pattern used across the app).
   * - ``readOnly``
     - ``any``
     - Sets ``_readOnly = value !== false``.

**Host bindings / listeners**

* ``@HostBinding('style.grid-template-columns') fieldColumns: string``.
* ``@HostListener('mouseleave') onLeave()`` → ``gameService.removeHighlight()``.
* ``@HostListener('contextmenu', ['$event']) preventContextMenu(event)`` →
  ``event.preventDefault()`` (right-click is used for deselection, not the browser menu).

**Abstract members:** ``afterBoardDataSet(): void``, ``drawSelectedFields(): void``.
``ngOnDestroy`` unsubscribes the sink and removes all click listeners.

GridGameBoardComponent
----------------------

:File: :file:`game-board/grid-game-board/grid-game-board.component.ts`
:Selector: ``tro-grid-game-board``
:Extends: ``GameBoardBaseComponent`` (``implements AfterViewInit``)

GRID board built from ``GridFieldComponent`` children (``@ViewChildren(GridFieldComponent)``).

* ``override set boardData`` — calls ``super.boardData`` then ``setFieldColumns(settings.gameBoardColumns)``.
* ``setFieldColumns(fieldColumns: number)`` — sets ``fieldColumns = repeat(${fieldColumns}, 1fr)``.
* Constructor subscribes to ``highlightFieldObs``: removes prior highlights and applies
  ``highlight(side)`` to each ``HighlightField`` via the matching child field.
* ``ngAfterViewInit()`` — subscribes to ``selectedFieldsObs`` and to ``fieldComponents.changes``,
  deferring ``drawSelectedFields()`` via ``setTimeout``.
* ``drawSelectedFields()`` — unassigns every field, then for each ``SelectedField`` calls
  ``assign(productionType, side)`` on the constituent fields and ``showProductionTypeImage()``
  on the first one.

SvgGameBoardComponent
---------------------

:File: :file:`game-board/svg-game-board/svg-game-board.component.ts`
:Selector: ``tro-svg-game-board``
:Extends: ``GameBoardBaseComponent`` (``implements AfterViewInit``, ``OnPush``)

SVG board built from ``SvgFieldComponent`` children (``@ViewChildren(SvgFieldComponent)``).

**Fields**

* ``background`` / ``background2`` — CSS ``url(...)`` strings derived from the board's two backgrounds.
* ``consequenceType = GameBoardType.ConsequenceMap``, ``mapType = GameBoardType.DrawingMap``.
* ``consequenceFieldOpacity = false`` — from ``visualOptions``; gates the consequence-map
  opacity + overlay.
* ``displayPatterns = 'inline'`` — toggled to ``'none'`` on mouse-enter to reveal placements
  under the pattern fill.

**Methods**

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Method
     - Behavior
   * - ``addShowHideListeners()``
     - For an editable, non-consequence, ``SelectBoard`` board, attaches ``mouseenter``/``mouseleave``
       listeners that flip ``displayPatterns`` between ``'none'`` and ``'inline'``; otherwise removes them.
   * - ``ngAfterViewInit()``
     - Subscribes to ``selectedFieldsObs`` and ``svgFieldComponents.changes`` and redraws.
   * - ``drawSelectedFields()``
     - Unassigns all fields, then assigns each ``SelectedField`` to the matching SVG field by id.
   * - ``override afterBoardDataSet()``
     - Sets ``mapType``, builds ``background``/``background2`` ``url(...)``, calls ``addShowHideListeners()``.
   * - ``override set readOnly(value: boolean)``
     - ``_readOnly = value !== false``; re-runs ``addShowHideListeners()``.
   * - ``getStrokeOpacity(): number``
     - ``0.5`` for a consequence map, else ``1``.
   * - ``getStrokeWidth(): number``
     - ``20`` for a consequence map, else ``8``.

Fields
======

A *field* is one selectable cell/zone of a board.

FieldBaseComponent (abstract)
-----------------------------

:File: :file:`field/field-base.component.ts`
:Selector: none (``template: ''``, ``implements OnDestroy``)

Base for both field components. Owns selection/hover interaction and highlight state.

**Host bindings (CSS classes):** ``--is-highlighted`` (``isHighlighted``),
``--is-assigned`` (``isAssigned``), ``--missing-selection`` (``isMissingSelection``),
``--is-editable`` (``isEditable``).

**Inputs**

* ``field: Field`` — stores ``_field``, sets ``isEditable = field.editable``, calls ``setColor()``.
* ``clickable: any`` — when not ``false``, calls ``addListeners()``; when ``false``,
  ``removeListeners()``.

**Methods**

.. list-table::
   :header-rows: 1
   :widths: 32 68

   * - Method
     - Behavior
   * - ``addClickListener()``
     - Adds a ``mousedown`` listener: deselects the field via ``gameService.deselectField(id)``
       if assigned, else ``selectField(id)``.
   * - ``addHoverListener()``
     - Adds a ``mouseenter`` listener: if ``shouldSelect(e)`` selects, if ``shouldDeselect(e)``
       deselects, otherwise calls ``gameService.highlightOnOtherFields(id)``.
   * - ``highlight(side: HighlightSide)``
     - Sets ``isHighlighted = true`` only when ``field.editable``.
   * - ``removeHighlight()``
     - Clears ``isHighlighted``.
   * - ``addMissingHighlight()`` / ``removeMissingHighlight()``
     - Toggle ``isMissingSelection``.

**Abstract:** ``shouldSelect(e)``, ``shouldDeselect(e)``, ``setColor()``,
``assign(productionType, side)``, ``unassign()``.

GridFieldComponent
------------------

:File: :file:`field/grid-field/grid-field.component.ts`
:Selector: ``tro-field``
:Extends: ``FieldBaseComponent`` (``OnPush``)

CSS-grid cell. ``shouldSelect``/``shouldDeselect`` both return ``false`` (grid mode uses
click only, no drag-select).

**Inputs:** ``imageMode: any`` (truthy-coerced), ``size: number | null`` (defaults to ``10``,
sets host ``width``/``height`` in px).

**Host bindings:** ``style.width``, ``style.height``, ``style.background-color``,
``class`` (``highlightSide``, a ``HighlightSide``), ``class.--has-image``
(``showProductionImage``), ``style.--highlight-color`` (``highlightColor``).

**Methods**

.. list-table::
   :header-rows: 1
   :widths: 32 68

   * - Method
     - Behavior
   * - ``setColor()``
     - Uses ``productionType.fieldColor`` when a type is placed and not in image mode, else
       ``field.type.fieldColor``.
   * - ``override highlight(side)``
     - Sets ``isHighlighted`` and ``highlightSide`` (unconditionally — grid override).
   * - ``assign(productionType, side)``
     - Marks the field assigned, stores ``productionType`` + ``highlightSide``, recolors (unless
       image mode), clears the global highlight.
   * - ``unassign()``
     - Resets assigned/productionType/image flags and ``highlightSide``, recolors.
   * - ``showProductionTypeImage()``
     - Sets ``showProductionImage = true`` (renders the type's icon over the cell).

SvgFieldComponent
-----------------

:File: :file:`field/svg-field/svg-field.component.ts`
:Selector: ``[troSvgField]`` (attribute on an SVG element)
:Extends: ``FieldBaseComponent`` (``OnPush``, ``implements OnInit``)

SVG vector zone. ``shouldSelect`` returns ``e.buttons == 1 || e.shiftKey``;
``shouldDeselect`` returns ``e.buttons == 2 || e.ctrlKey`` — i.e. left-drag/Shift paints,
right-drag/Ctrl erases.

**Inputs:** ``showStroke: boolean = true`` (also ``@HostBinding('class.show-stroke')``),
``gameBoardId = ''``, ``hasOpacity = false`` (renders placed fields semi-transparent for
consequence maps).

**Host bindings:** ``style.fill`` (``fillColor``), ``style.stroke`` (``stroke``).

**Methods**

.. list-table::
   :header-rows: 1
   :widths: 34 66

   * - Method
     - Behavior
   * - ``ngOnInit()``
     - Reads ``highlightColor`` from settings and applies optional per-deployment CSS custom
       properties ``--cell-stroke`` (``gridLineColor``), ``--cell-stroke-width`` (``gridLineWidth``),
       ``--highlight-stroke-width`` (``highlightWidth``).
   * - ``setColor(productionType = null)``
     - When a clickable field has a type: solid ``fieldColor`` (``+'7D'`` alpha when ``hasOpacity``);
       a non-clickable typed field: SVG pattern ``url(#pattern_<id>_<gameBoardId>)``; otherwise empty.
   * - ``override highlight(side)`` / ``override removeHighlight()``
     - Set/clear ``stroke`` to ``highlightColor``.
   * - ``assign(productionType, side)``
     - No-op unless ``field.editable``; marks assigned, recolors, clears highlight.
   * - ``unassign()``
     - Clears assigned/productionType and recolors.

Score and legend
================

ScoreBoardComponent
-------------------

:File: :file:`score-board/score-board.component.ts`
:Selector: ``tro-score-board``
:Implements: ``OnInit`` (``OnPush``)

Renders per-map and total scores.

**Inputs:** ``scores: ScoreEntry[] | undefined`` (stores and calls ``calculateTotalScore()``),
``isStatic: any`` (truthy-coerced into ``_isStatic``).

**Fields/getters:** ``totalScore: number`` (sum of entry scores); ``groupedScores`` —
groups entries by translated map name (``"map_name_" + e.id``) and returns
``{ name, score }[]`` with summed scores.

**``ngOnInit()``** — in dynamic mode (``!_isStatic``) subscribes to ``currentLevelObs``
to seed empty entries via ``scoreService.createEmptyScoreEntry(level)`` and to
``selectedFieldsObs`` to recompute via ``scoreService.calculateScore(...)`` + ``calculateTotalScore``.

LegendBoardComponent
--------------------

:File: :file:`legend-board/legend-board.component.ts`
:Selector: ``tro-legend-board``
:Change detection: ``OnPush``

Renders a discrete or gradient legend.

**Inputs:** ``isSmall: boolean`` (``@HostBinding('class.is-small')``),
``isGradient: boolean`` (``@HostBinding('class.is-gradient')``),
``legendData: Legend``.

Setting ``legendData`` sorts ``elements`` by ``forValue`` ascending, copies ``isNegative`` and
``isGradient``; for gradients it builds ``linear-gradient(90deg, #<first>, #<second>)``, and for
discrete legends it filters out the ``forValue == 0`` element.

ScoreIndicatorComponent
-----------------------

:File: :file:`score-indicator/score-indicator.component.ts`
:Selector: ``tro-score-indicator``
:Change detection: ``OnPush``

Shows the score for the field currently under the cursor. Subscribes to
``currentlySelectedFieldObs``; when present, ``score`` is the sum of that field's
``scores`` array, else ``null``.

Start, config, configurator, home
==================================

StartComponent
--------------

:File: :file:`start/start.component.ts`
:Selector: ``tro-start``

Landing/menu page (route ``/config``). Constructor calls ``gameService.resetGame()`` and reads
available languages. ``changeLanguage(event: MatSelectChange)`` → ``translate.use(event.value)``.
``loadDynamic()`` navigates to ``dynamic-game``; ``loadStatic()`` navigates to ``static-game``.

HomeComponent
-------------

:File: :file:`home/home.component.ts`
:Selector: ``tro-home``

Site-root (``/``) landing. Inline template renders ``<tro-svg-level>`` when ``dynamic`` else
``<tro-grid-level>``. ``dynamic`` is ``config.appConfig.defaultMode === 'dynamic'`` (default
``'static'``), so the clean ``/`` URL serves either mode without redirecting.

ImportConfigComponent
---------------------

:File: :file:`import-config/import-config.component.ts`
:Selector: ``tro-import-config``

Loads a saved configuration file at runtime.

* ``onImport(e: Event)`` — reads the selected file as text and calls
  ``gameService.loadSettings(JSON.parse(...))``.
* ``start()`` — subscribes to ``settingsObs`` and routes to ``static-game`` when
  ``settings.mode == 'GRID'``, else ``dynamic-game``.

ConfiguratorComponent
---------------------

:File: :file:`configurator/configurator.component.ts`
:Selector: ``tro-configurator``

Reactive-forms authoring UI that builds and exports a configuration JSON. ``gradients`` is
``Object.values(DefaultGradients)``.

**Form scaffolding (``initialiseForm``) — default values**

.. list-table::
   :header-rows: 1
   :widths: 32 18 50

   * - Control
     - Default
     - Notes
   * - ``mapMode``
     - ``"svg"``
     - Drives ``toggleMapMode`` on every change.
   * - ``imageMode``
     - ``false``
     - Disabled in SVG mode.
   * - ``elementSize``
     - ``2`` (set to ``1`` and disabled in SVG)
     - GRID cell scale.
   * - ``minSelected``
     - ``0``
     - SVG-only; disabled in grid.
   * - ``minValue`` / ``maxValue``
     - ``0`` / ``100``
     - SVG-only score range.
   * - ``highlightColor``
     - ``"#000000"``
     -
   * - ``infiniteLevels``
     - ``false`` (forced ``true`` in SVG)
     -
   * - ``gameBoardColumns`` / ``gameBoardRows``
     - ``28`` / ``29``
     - GRID raster size.
   * - ``calcUrl``
     - ``""`` (disabled)
     - Enabled only in SVG mode.
   * - ``defaultProductionType``
     - ``""``
     -

**Key methods**

.. list-table::
   :header-rows: 1
   :widths: 34 66

   * - Method
     - Behavior
   * - ``addMap()``
     - Pushes a map form group (``id = (count+1)*10``, ``gradient: "blue"``,
       ``gameBoardType: "Suitability"``); wires reactive enable/disable: ``custom`` gradient enables
       ``customColorId``; ``Consequence`` disables ``urlToData``; ``Drawing`` disables ``productionTypes``
       and ``gradient``.
   * - ``addProductionType()``
     - Pushes a production-type group (``id = (count+1)*11``, ``fieldColor: "#000000"``, ``maxElements: 0``).
   * - ``addCustomColors(addEmpty = false)``
     - Pushes a custom-color group with a fresh ``uuid.v4()`` id; seeds one color unless ``addEmpty``.
   * - ``addColor(formGroup)`` / ``removeColor(formGroup, index)``
     - Add/remove a ``{ number, color: "#000000" }`` entry in a color set.
   * - ``exportData()``
     - Serializes ``formGroup.getRawValue()`` and triggers a download of ``configuration.json``.
   * - ``onFileSelected(event)``
     - Reads a JSON file, re-creates the right number of map/production-type/custom-color form
       groups, then ``patchValue``\ s the parsed config.
   * - ``toggleMapMode(value)``
     - Enables/disables and resets controls per mode (SVG: enable ``calcUrl``/``minSelected``/range,
       force ``infiniteLevels = true``; grid: the reverse, force ``minSelected = 0``, range ``0..100``,
       ``infiniteLevels = false``).
   * - ``formatLabel(value)``
     - Returns ``value + '%'`` (slider label).

AppComponent
------------

:File: :file:`app.component.ts`
:Selector: ``app-root``

Root shell. ``title = 'Tradeoff-V2'``. Constructor registers translation languages
``['de', 'en', 'nl', 'pt']``, sets fallback ``'en'``, and uses ``'en'``.

HelpComponent
-------------

:File: :file:`help/help.component.ts`
:Selector: ``tro-help``
:Change detection: ``OnPush``

Modal help/instructions panel. ``isOpen`` tracks ``helpWindowObs``. On ``currentLevelObs``,
level ``1`` (or no level) shows ``helpText = 'basic_instructions'`` with
``basicInstructionsImageUrl``; later levels show ``'advanced_instructions'`` with
``advancedInstructionsImageUrl``. ``onClose()`` calls ``gameService.openHelp(true)``.

Indicators
==========

LevelIndicatorComponent
-----------------------

:File: :file:`level-indicator/level-indicator.component.ts`
:Selector: ``[troLevelIndicator]``

Presentation-only host component, template ``<ng-content></ng-content>``; no logic.

LoadingIndicatorComponent
-------------------------

:File: :file:`loading-indicator/loading-indicator.component.ts`
:Selector: ``tro-loading-indicator``

Spinner shown while the calculator is busy. ``@HostBinding('class.show') show`` is set true
whenever ``loadingIndicatorObs`` emits a non-empty list (the service tracks in-flight requests).

ProductionTypeButtonComponent
-----------------------------

:File: :file:`product-type-button/production-type-button.component.ts`
:Selector: ``tro-production-type-button``
:Change detection: ``OnPush``
:Implements: ``OnInit``

Selectable button for one production type.

**Input:** ``productionType: ProductionType``.

**Host bindings:** ``class.--active`` (``isActive``), ``class.--image-mode`` (``isImageMode``).

**``ngOnInit()``** sets ``isImageMode`` from ``settings.imageMode`` and ``backgroundColor`` from
``productionType.fieldColor``; tracks ``isActive`` by comparing ``selectedProductionTypeObs`` to
this button's type. ``@HostListener('click') onClick()`` calls
``gameService.setSelectedProductionType(productionType)``.

Shared directive
================

ButtonDirective
---------------

:File: :file:`shared/button.directive.ts`
:Selector: ``[troButton]``

On construction it adds the CSS class ``button`` to the host element
(``el.nativeElement.classList.add('button')``). No inputs/outputs.

Models
======

The domain models under :file:`shared/models` (plus the gradient helper under
:file:`shared/helpers`). Trivial getters such as ``GameBoard.isPositive`` are noted only where
they carry meaning.

Settings
--------

:File: :file:`shared/models/settings.ts`

The deserialized runtime configuration. Constructed as ``new Settings(translate, data)``;
``mapData(data)`` populates the fields and registers per-language translation keys
(``map_name_<id>``, ``production_type_<id>``, ``basic_instructions``, ``advanced_instructions``,
``title``).

.. list-table::
   :header-rows: 1
   :widths: 30 24 46

   * - Field
     - Type
     - Meaning
   * - ``highlightColor``
     - ``string``
     - Hover/selection highlight color.
   * - ``elementSize``
     - ``number``
     - GRID cell size scale.
   * - ``gameBoardColumns`` / ``gameBoardRows``
     - ``number``
     - GRID raster dimensions.
   * - ``minValue`` / ``maxValue``
     - ``number``
     - SVG score range bounds.
   * - ``minSelected``
     - ``number``
     - Minimum percent of fields to place before advancing (SVG).
   * - ``imageMode``
     - ``boolean``
     - Render production-type icons instead of flat fill colors.
   * - ``basicInstructions`` / ``advancedInstructions``
     - ``LanguageString`` (``Record<string,string>``)
     - Per-language instruction text.
   * - ``defaultProductionType``
     - ``number``
     - Pre-selected production type id (parsed from string).
   * - ``calcUrl``
     - ``string``
     - Backend calculator endpoint (SVG mode).
   * - ``mode``
     - ``'GRID' | 'SVG'``
     - Derived: ``'SVG'`` when ``data.mapMode == "svg"`` else ``'GRID'``.
   * - ``infiniteLevels``
     - ``boolean``
     - Whether play continues indefinitely.
   * - ``productionTypes``
     - ``{ id:number, name:LanguageString, fieldColor:string, urlToIcon:string, maxElements:number }[]``
     - Configured land-use types.
   * - ``maps``
     - ``{ id:string, name:LanguageString, gradient:DefaultGradients, customColorId:string, gameBoardType:GameBoardType, productionTypes:number[], urlToData:string }[]``
     - Map/board definitions; ``gameBoardType`` and ``gradient`` are converted from strings.
   * - ``customColors``
     - ``{ id:string, colors:{ number:number, color:string }[] }[]``
     - Named discrete color ramps referenced by ``map.customColorId``.
   * - ``basicInstructionsImageUrl`` / ``advancedInstructionsImageUrl``
     - ``string``
     - Instruction images.
   * - ``visualOptions``
     - ``VisualOptions``
     - Deployment theming flags (see below); merged over ``DEFAULT_VISUAL_OPTIONS``.
   * - ``gridLineColor`` / ``gridLineWidth``
     - ``string?``
     - Optional SVG cell-border color/width.
   * - ``highlightWidth``
     - ``string?``
     - Optional SVG hover-highlight border width (board units; default ``2``).

``VisualOptions`` (all default ``false`` via ``DEFAULT_VISUAL_OPTIONS``):

.. list-table::
   :header-rows: 1
   :widths: 34 66

   * - Flag
     - Meaning
   * - ``consequenceFieldOpacity``
     - Render consequence-map fields semi-transparent and overlay the consequence image.
   * - ``highlightFocusedBoard``
     - Outline the currently focused board.
   * - ``neutralScoreColors``
     - Use neutral (black) map-title colors instead of positive/negative green/red.

``mapData`` also calls ``applyGradientOverrides(data.gradientOverrides ?? {})``.
String conversion helpers: ``convertGameBoardType`` maps ``"Suitability" | "Consequence" |
"Drawing" | "Background"`` to the ``GameBoardType`` enum (default ``SuitabilityMap``);
``convertGradient`` casts the gradient name to ``DefaultGradients``.

Level
-----

:File: :file:`shared/models/level.ts`

One round of play.

.. list-table::
   :header-rows: 1
   :widths: 28 30 42

   * - Field
     - Type
     - Meaning
   * - ``levelNumber``
     - ``number``
     - 1-based level index.
   * - ``gameBoards``
     - ``GameBoard[]``
     - Boards shown this level.
   * - ``selectedFields``
     - ``SelectedField[]``
     - Placements made this level.
   * - ``isReadOnly``
     - ``boolean`` (``false``)
     - Result/review level (no editing).
   * - ``showConsequenceMaps``
     - ``boolean`` (``false``)
     - Whether right-hand consequence boards are revealed.
   * - ``scores``
     - ``ScoreEntry[]``
     - Per-map scores (``ScoreEntry = { id:string, score:number }``).
   * - ``scoreImage``
     - ``string``
     - Optional rendered result image (dynamic mode).

Field
-----

:File: :file:`shared/models/field.ts`

One cell/zone. Constructor:
``Field(id, type, score, productionType=null, editable=false, assigned=false, path="", startPos=0)``.

.. list-table::
   :header-rows: 1
   :widths: 24 30 46

   * - Field
     - Type
     - Meaning
   * - ``id``
     - ``number``
     - Cell index / zone id.
   * - ``type``
     - ``FieldType``
     - ``EMPTY`` or ``CONFIGURED`` styling.
   * - ``productionType``
     - ``ProductionType | null``
     - Placed land-use type, if any.
   * - ``score``
     - ``number``
     - This cell's contribution on its board.
   * - ``editable``
     - ``boolean``
     - Whether the player may place/remove here.
   * - ``assigned``
     - ``boolean``
     - Whether a production type is currently placed.
   * - ``path``
     - ``string``
     - SVG path geometry (SVG mode).
   * - ``startPos``
     - ``number``
     - Initial/source position metadata.

Related types in the same file:

* ``enum HighlightSide`` — CSS-modifier strings for edge highlighting:
  ``ALLSIDES = "--all-sides"``, ``TOP/BOTTOM/LEFT/RIGHT``, the four corner values,
  and ``NONE = ""``.
* ``class HighlightField`` — ``{ id:number, side:HighlightSide }``.
* ``class SelectedField`` — a contiguous placement:
  ``fields: HighlightField[]``, ``productionType: ProductionType``,
  ``scores: { score:number, id:string }[]``. Constructor calls ``updateScore()``, which pushes
  the suitability-map score (positive) and each consequence-map score (negated, ``* -1``) keyed
  by board id.

FieldType
---------

:File: :file:`shared/models/field-type.ts`

``{ fieldColor: string, name: "EMPTY" | "CONFIGURED" }``. Constructor defaults ``name`` to
``"EMPTY"``. ``fieldColor`` is the base fill for unplaced cells.

ProductionType
--------------

:File: :file:`shared/models/production-type.ts`

A land-use type. Constructor:
``ProductionType(id, fieldColor, scoreMap, image, maxElements)``.

.. list-table::
   :header-rows: 1
   :widths: 26 28 46

   * - Field
     - Type
     - Meaning
   * - ``id``
     - ``number``
     - Type id (matches ``Settings.productionTypes[].id``).
   * - ``fieldColor``
     - ``string``
     - Placement fill color.
   * - ``suitabilityMap``
     - ``GameBoard``
     - The positive scoring board (constructor arg ``scoreMap``).
   * - ``consequenceMaps``
     - ``GameBoard[]``
     - Negative-impact boards (default ``[]``).
   * - ``image``
     - ``string``
     - Icon URL.
   * - ``maxElements``
     - ``number``
     - Placement budget for this type.

``getScore(ids: number[]): number`` — suitability score minus the summed consequence scores
for the given cell ids.

GameBoard
---------

:File: :file:`shared/models/game-board.ts`

A single map. Constructor:
``GameBoard(id, gameBoardType, fields, legend?, isSvg=false, width=0, height=0, background="", background2="")``.

.. list-table::
   :header-rows: 1
   :widths: 26 28 46

   * - Field
     - Type
     - Meaning
   * - ``id``
     - ``string``
     - Map id (matches ``Settings.maps[].id``).
   * - ``fields``
     - ``Field[]``
     - The board's cells/zones.
   * - ``gameBoardType``
     - ``GameBoardType``
     - Map role (suitability/consequence/drawing/background).
   * - ``legend``
     - ``Legend | undefined``
     - Color legend.
   * - ``isSvg``
     - ``boolean``
     - SVG vs. grid rendering.
   * - ``width`` / ``height``
     - ``number``
     - SVG viewport dimensions.
   * - ``background`` / ``background2``
     - ``string``
     - Background image URLs.

``getScore(ids: number[]): number`` — sums ``score`` of the fields whose ids are in ``ids``.
Getter ``isPositive`` is ``true`` when ``gameBoardType == GameBoardType.SuitabilityMap``.
Also exports ``enum GameBoardClickMode { Field = "FIELD", SelectBoard = "SELECTBOARD" }``.

GameBoardType
-------------

:File: :file:`shared/models/game-board-type.ts`

``enum GameBoardType { SuitabilityMap, ConsequenceMap, DrawingMap, BackgroundMap }``
(numeric values ``0..3``). ``SuitabilityMap`` boards add to the score; ``ConsequenceMap``
boards subtract; ``DrawingMap`` is the editable overlay; ``BackgroundMap`` is decorative.

Legend
------

:File: :file:`shared/models/legend.ts`

``class Legend`` — ``elements: LegendElement[]``, ``isNegative = false``, ``isGradient = false``.
``class LegendElement`` — ``{ forValue: number, color: string }`` (the color for a given
suitability value; ``color`` is a hex string without the leading ``#``).

CalculationResult
-----------------

:File: :file:`shared/models/calculation-result.ts`

The backend calculator response (SVG mode).

* ``class CalculationResult`` — ``{ results: Result[] }``.
* ``class Result`` — ``{ name:string, id:string, score:number, url:string }`` — one map's
  computed ``score`` plus the ``url`` of its rendered output image.

gradients (helper)
------------------

:File: :file:`shared/helpers/gradients.ts`

Color-ramp utilities.

* ``class Gradient`` — ``{ startingColor:string, endingColor:string, colors:string[] }``.

  * ``calculateColor(ratio: number): string`` — linear blend between ``startingColor`` and
    ``endingColor`` (``ratio`` weights the start color), returned as a 6-digit hex string.
  * ``calculateColorRGB(ratio: number): number[]`` — same blend as an ``[r,g,b]`` array.

* Default ``gradients: Map<string, Gradient>`` registers ``blue``, ``green``, ``orange``,
  ``purple``, ``red``, ``yellow``, each with start/end stops and a six-entry display ramp
  (e.g. ``blue`` = start ``eff3ff`` / end ``08519c``).
* ``enum DefaultGradients { Blue='blue', Green='green', Orange='orange', Purple='purple',
  Red='red', Yellow='yellow' }``.
* ``interface GradientOverride { start?:string; end?:string }`` and
  ``applyGradientOverrides(overrides = {})`` — first resets every gradient to its snapshotted
  built-in stops, then applies per-deployment ``start``/``end`` overrides, so one config's
  overrides never leak into the next.
* ``class CustomColors`` — id-keyed discrete color set:

  * ``get(i: number): string`` — color for value ``i`` (defaults ``"#FFFFFF"``).
  * ``set(key, value)`` — register a color.
  * ``addTransparencyToColors(transparencyHex: string)`` — append an alpha suffix to every color.
  * ``getRgb(i)`` / ``colorToRgb(hex)`` — parse a ``#RRGGBB[AA]`` color into ``[r,g,b,a]``
    (alpha defaults to ``255``).
