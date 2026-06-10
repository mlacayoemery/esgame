Developer Guide
===============

This guide is for developers working on the **esgame** frontend — the Angular
single-page application under :file:`esgame/v2`. It covers the repository layout,
the technology stack and version requirements, the local development loop, the
runtime-configuration architecture, and the most common extension tasks: adding a
production type, a map, or a language, wiring the two game modes (GRID vs SVG),
and theming the appearance through :file:`assets/config.json`.

For the player-facing rules and the scoring model, see :doc:`/game-mechanics`.
For an annotated, method-by-method tour of the Angular services, see
:doc:`/reference/frontend-services`.

.. contents:: On this page
   :local:
   :depth: 2


Repository layout
-----------------

The Angular application is the single source of truth for both game modes; the
backend calculators and GeoServer live alongside it as deployable examples.

.. list-table::
   :header-rows: 1
   :widths: 32 68

   * - Path
     - Contents
   * - :file:`esgame/v2`
     - The Angular 22 application (the frontend). Everything in this guide lives
       here unless noted.
   * - :file:`esgame/v2/src/app`
     - Components, services, and shared models (see below).
   * - :file:`esgame/v2/src/assets`
     - Runtime-loaded data: :file:`config.json`, the two game-data files
       (:file:`dataGridExample.json`, :file:`data.json`), :file:`i18n/`
       translations, :file:`images/`, and :file:`fonts/`.
   * - :file:`esgame/examples/esgame-dynamic`
     - A self-contained, runnable **dynamic** stack: a thin frontend overlay, a
       FastAPI ``calculator/``, a seeded ``geoserver/``, and a
       :file:`docker-compose.yml`. Demonstrates the SVG-mode architecture without
       proprietary geodata.
   * - :file:`esgame/tools/R/calculator.r`
     - The reference R calculator that real (SVG-mode) deployments specialize.
   * - :file:`esgame/Makefile`
     - Convenience targets for the docker stacks (``esgame-dynamic-up``,
       ``esgame-dynamic-example-up``, and their ``-down`` counterparts).
   * - :file:`esgame/docs`
     - This Sphinx documentation set (furo theme).

The companion **places** deployment is a separate fork at
:file:`swantje/places`; its R calculator lives at
:file:`places/calculation/calculation.r`.

Inside :file:`src/app`, the code is organized by feature, with parallel
``grid-*`` and ``svg-*`` variants for the two modes:

* **services/** — ``ConfigService``, ``GameService``, ``ApiService``,
  ``ScoreService``, ``TiffService`` (all ``providedIn: 'root'``).
* **shared/models/** — plain TypeScript model classes: ``Settings``, ``Level``,
  ``GameBoard``, ``Field``, ``ProductionType``, ``CalculationResult``,
  ``GameBoardType``, ``Legend``.
* **shared/helpers/** — ``gradients.ts`` (the color-gradient registry) and
  ``svg/tiffToSvgPaths`` (GeoTIFF→SVG path conversion).
* **field/**, **game-board/**, **level/** — each with a ``*-base.component.ts``
  plus ``grid-*`` and ``svg-*`` subclasses.
* **start/**, **home/**, **configurator/**, **import-config/**, **help/**,
  **score-board/**, **legend-board/**, **loading-indicator/**, and the small
  indicator/button components — the UI shell.


Technology stack
----------------

All versions below are pinned in :file:`esgame/v2/package.json`.

.. list-table::
   :header-rows: 1
   :widths: 34 22 44

   * - Component
     - Version
     - Notes
   * - Angular
     - ``22.0.0``
     - ``@angular/core``, ``common``, ``forms``, ``router``, ``material``,
       ``cdk``, ``animations``, ``platform-browser`` — all pinned to ``22.0.0``.
   * - Build / serve / test builder
     - ``@angular/build 22.0.0``
     - The esbuild-based **application** builder. ``angular.json`` uses
       ``@angular/build:application`` (build), ``:dev-server`` (serve), and
       ``:karma`` (test). No webpack.
   * - TypeScript
     - ``6.0.3``
     - ``tsConfig`` targets ``ES2022`` with ``strict: true``,
       ``moduleResolution: "bundler"``.
   * - ngx-translate
     - ``^18.0.0``
     - ``@ngx-translate/core`` + ``@ngx-translate/http-loader`` for i18n.
   * - geotiff
     - ``^3.0.5``
     - Reads suitability / consequence GeoTIFFs in the browser
       (``TiffService``).
   * - RxJS
     - ``~7.8.2``
     - Reactive state in ``GameService`` (``BehaviorSubject`` streams).
   * - uuid
     - ``^14.0.0``
     - Generates the per-session ``game_id`` sent to the calculator.
   * - zone.js
     - ``0.16.2``
     - Polyfill (configured in ``angular.json`` ``polyfills``).
   * - Karma + Jasmine
     - ``karma ~6.4.4``, ``jasmine-core ^6.3.0``
     - Unit tests via ``@angular/build:karma``.
   * - Playwright
     - ``^1.60.0``
     - End-to-end tests (``npm run e2e``).
   * - angular-cli-ghpages
     - ``^3.1.0``
     - The ``deploy`` architect target for the static GitHub Pages build.

.. note::

   **Node.js >= 22.22.3 is required.** Angular 22 and the
   ``@angular/build`` esbuild toolchain do not run on older Node releases.
   Verify your version before installing:

   .. code-block:: sh

      node --version    # must be >= 22.22.3

The build is configured in :file:`esgame/v2/angular.json`. Highlights:

* Application entry ``src/main.ts``, index ``src/index.html``, output to
  :file:`dist/tradeoff-v2`.
* SCSS is the default style language; ``src/styles`` is on the SCSS include path
  and the Material ``indigo-pink`` prebuilt theme is loaded globally.
* ``src/assets``, ``src/favicon.ico`` and ``src/404.html`` are copied verbatim
  into the build output — this is why :file:`assets/config.json` can be replaced
  per deployment without rebuilding.
* The default ``production`` configuration enforces budgets (initial bundle
  warns at ``1mb`` / errors at ``2mb``; per-component styles warn at ``2kb`` /
  error at ``4kb``) and applies ``outputHashing: "all"``.


Local development
-----------------

Install dependencies from the lockfile and start the dev server:

.. code-block:: sh

   cd esgame/v2
   npm ci          # clean, reproducible install from package-lock.json
   npm start       # ng serve — http://localhost:4200, live reload

``npm start`` runs ``ng serve`` with the ``development`` configuration
(``optimization: false``, ``sourceMap: true``). The app reads
:file:`src/assets/config.json` at startup, so by default it launches the
``static`` (GRID) game from :file:`assets/dataGridExample.json` — no backend is
needed for grid-mode development.

Other scripts (from :file:`package.json`):

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Command
     - Effect
   * - ``npm run build``
     - ``ng build`` — production bundle into :file:`dist/tradeoff-v2`.
   * - ``npm run watch``
     - ``ng build --watch --configuration development`` — rebuild on change.
   * - ``npm test``
     - ``ng test`` — Karma + Jasmine unit tests.
   * - ``npm run e2e``
     - ``ng build && playwright test`` — end-to-end tests against the built app.

Running unit tests headless
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``npm test`` opens an interactive Chrome via ``karma-chrome-launcher`` by
default. For CI or a headless terminal, run a single headless pass:

.. code-block:: sh

   npm test -- --watch=false --browsers=ChromeHeadless

Existing specs cover the configuration and scoring logic — for example
:file:`services/config.service.spec.ts`, :file:`services/score.service.spec.ts`,
:file:`shared/models/settings.spec.ts`, and
:file:`shared/helpers/gradients.spec.ts`. Use these as templates: services are
``providedIn: 'root'`` and the model classes are plain TypeScript, so most logic
is unit-testable without rendering a component.


Runtime-configuration architecture
-----------------------------------

esgame is built **once** and configured **at runtime**, so a single build (or
container image) can serve any deployment by replacing two kinds of file:
:file:`assets/config.json` (the deployment config) and the game-data JSON it
points at.

``ConfigService`` and ``APP_INITIALIZER``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

:file:`services/config.service.ts` defines the ``AppConfig`` interface and
``ConfigService``. At bootstrap, ``app.module.ts`` registers an
``APP_INITIALIZER`` that calls ``config.load()`` before the app renders:

.. code-block:: typescript

   {
     provide: APP_INITIALIZER,
     useFactory: (config: ConfigService) => () => config.load(),
     deps: [ConfigService],
     multi: true
   }

``load()`` fetches :file:`assets/config.json`, and on **any** HTTP error falls
back silently to the built-in ``DEFAULT_CONFIG`` (it ``catchError``\ s to an empty
object and merges). So a missing or unreachable config file is non-fatal — the
app boots with defaults:

.. list-table::
   :header-rows: 1
   :widths: 26 30 44

   * - ``config.json`` field
     - Default
     - Meaning
   * - ``staticDataUrl``
     - ``assets/dataGridExample.json``
     - Game-data JSON for GRID / "static" mode.
   * - ``dynamicDataUrl``
     - ``assets/data.json``
     - Game-data JSON for SVG / "dynamic" mode.
   * - ``calcUrl``
     - *(unset)*
     - Optional override of the calculation backend URL baked into the game
       data. An **empty string** forces fully client-side play (no backend) —
       this is how the static GitHub Pages build runs.
   * - ``defaultMode``
     - ``static``
     - Which game the site root (``/``) launches: ``static`` (grid) or
       ``dynamic`` (SVG).
   * - ``gridLineColor``
     - *(unset)*
     - SVG-mode cell border color override.
   * - ``gridLineWidth``
     - *(unset)*
     - SVG-mode cell border width, e.g. ``"0.05px"``.
   * - ``highlightWidth``
     - *(unset)*
     - SVG-mode hover-highlight border width (board units), e.g. ``"1"``.

The repository's default :file:`src/assets/config.json` is minimal:

.. code-block:: json

   {
     "staticDataUrl": "assets/dataGridExample.json",
     "dynamicDataUrl": "assets/data.json",
     "calcUrl": "",
     "defaultMode": "static"
   }

``getGameData`` and the override merge
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Game data is fetched through ``ConfigService.getGameData(mode)``, **not**
directly. It selects ``staticDataUrl`` or ``dynamicDataUrl`` by ``mode``, then
overlays any deployment overrides present in ``config.json`` onto the fetched
object before returning it:

.. code-block:: typescript

   getGameData(mode: 'static' | 'dynamic'): Observable<any> {
     const url = mode === 'static' ? this.config.staticDataUrl : this.config.dynamicDataUrl;
     return this.http.get<any>(url).pipe(map(data => {
       const out = { ...data };
       if (this.config.calcUrl !== undefined)        out.calcUrl = this.config.calcUrl;
       if (this.config.gridLineColor !== undefined)  out.gridLineColor = this.config.gridLineColor;
       if (this.config.gridLineWidth !== undefined)  out.gridLineWidth = this.config.gridLineWidth;
       if (this.config.highlightWidth !== undefined) out.highlightWidth = this.config.highlightWidth;
       return out;
     }));
   }

So precedence is: **game-data JSON** provides the base; **config.json** overrides
``calcUrl`` and the three SVG appearance keys when present. This is why the same
image can point at any backend (or none) by editing only ``config.json``.

The merged object is handed to ``GameService.loadSettings(data)``, which
constructs a ``Settings`` instance (see :file:`shared/models/settings.ts`); the
``Settings`` constructor maps the raw JSON into typed fields, registers map and
production-type names as translations, and applies ``visualOptions`` and
``gradientOverrides`` (described below).


GRID vs SVG wiring
------------------

The two modes share routing, ``GameService``, and the base components, but differ
in their data source and how each map is rendered.

.. list-table::
   :header-rows: 1
   :widths: 22 39 39

   * - Aspect
     - GRID / "static"
     - SVG / "dynamic"
   * - ``config.json`` field
     - ``staticDataUrl``
     - ``dynamicDataUrl``
   * - Game-data ``mapMode``
     - ``"grid"`` → ``Settings.mode === 'GRID'``
     - ``"svg"`` → ``Settings.mode === 'SVG'``
   * - Route / component
     - ``static-game`` → ``GridLevelComponent``
     - ``dynamic-game`` → ``SvgLevelComponent``
   * - Init call
     - ``GameService.initialiseGridMode()``
     - ``GameService.initialiseSVGMode()``
   * - Rendering
     - GeoTIFF → grid of clickable cells (``getGridGameBoard``)
     - GeoTIFF → SVG paths over a zone overlay (``getSvgGameBoard`` /
       ``getOverlayGameBoard`` / ``getSvgBackground``)
   * - Scoring
     - Client-side, per cell (``ScoreService`` / ``ProductionType.getScore``)
     - Calculator backend (POST on *Next Level*) when ``calcUrl`` is set;
       otherwise client-side

Routing (:file:`app-routing.module.ts`):

* ``''`` → ``HomeComponent``. ``HomeComponent`` reads
  ``config.appConfig.defaultMode`` and renders ``<tro-svg-level>`` when
  ``defaultMode === 'dynamic'``, else ``<tro-grid-level>`` — so ``/`` launches the
  configured mode while keeping a clean URL.
* ``config`` → ``StartComponent`` (the language picker / explicit start page).
* ``static-game`` → ``GridLevelComponent``; ``dynamic-game`` →
  ``SvgLevelComponent``.
* ``configurator`` → ``ConfiguratorComponent`` (authoring tool).
* ``**`` → redirects to ``''``.

Each level component fetches its own data through ``ConfigService`` and then
initializes the matching mode. For example,
:file:`level/grid-level/grid-level.component.ts`:

.. code-block:: typescript

   configService.getGameData('static').subscribe(data => {
     this.gameService.loadSettings(data);
     this.gameService.initialiseGridMode();
   });

and :file:`level/svg-level/svg-level.component.ts` calls
``getGameData('dynamic')`` then ``initialiseSVGMode()``. In SVG mode,
``GameService.goToNextLevel()`` / ``prepareNextLevel()`` POST the allocation to
``Settings.calcUrl`` via ``ApiService.postRequest`` and expect a
``CalculationResult`` (``{ results: [{ name, id, score, url }] }``); each ``url``
is fetched as a consequence-map GeoTIFF. When ``calcUrl`` is falsy, play proceeds
fully client-side.


Game-data JSON reference
------------------------

Both ``staticDataUrl`` and ``dynamicDataUrl`` point at a game-data JSON whose
shape is consumed by ``Settings.mapData()``. Key top-level fields (see
:file:`shared/models/settings.ts` and :file:`assets/dataGridExample.json`):

.. list-table::
   :header-rows: 1
   :widths: 28 18 54

   * - Field
     - Type
     - Meaning
   * - ``title``
     - ``{lang: string}``
     - Per-language game title.
   * - ``mapMode``
     - ``"grid"`` | ``"svg"``
     - Selects GRID vs SVG (``"svg"`` → ``Settings.mode === 'SVG'``).
   * - ``elementSize``
     - ``number``
     - Side length (in cells) of a placed element; ``2`` means a 2×2 footprint.
   * - ``gameBoardColumns`` / ``gameBoardRows``
     - ``number``
     - Board dimensions (e.g. ``28`` × ``29``).
   * - ``highlightColor``
     - ``string``
     - Hover-highlight color, e.g. ``"#00E0FF"``.
   * - ``infiniteLevels``
     - ``boolean``
     - Whether the game continues past the scripted rounds.
   * - ``calcUrl``
     - ``string``
     - Backend URL (overridable by ``config.json``; ``""`` = no backend).
   * - ``minValue`` / ``maxValue``
     - ``number``
     - Value range used to normalize raster pixels to gradient ratios.
   * - ``minSelected``
     - ``number``
     - Minimum % of editable cells that must be allocated before advancing
       (enforced in ``SvgLevelComponent.nextLevel``).
   * - ``productionTypes[]``
     - array
     - Each: ``id``, ``name`` (per-language), ``fieldColor``, ``urlToIcon``,
       ``maxElements``.
   * - ``maps[]``
     - array
     - Each: ``id``, ``name``, ``gradient``, ``gameBoardType``
       (``Suitability`` | ``Consequence`` | ``Drawing`` | ``Background``),
       ``productionTypes[]``, ``urlToData``, ``customColorId``.
   * - ``customColors[]``
     - array
     - Named discrete color tables (used by SVG drawing/background overlays).
   * - ``basicInstructions`` / ``advancedInstructions``
     - ``{lang: string}``
     - Round 1 / Round 2 instruction text.
   * - ``visualOptions``
     - object
     - Optional per-deployment theming flags (see below).
   * - ``gradientOverrides``
     - object
     - Optional per-deployment gradient start/end overrides (see below).

``gameBoardType`` strings are mapped by ``convertGameBoardType`` to the
``GameBoardType`` enum (``SuitabilityMap``, ``ConsequenceMap``, ``DrawingMap``,
``BackgroundMap``); any unknown value defaults to ``SuitabilityMap``.


Adding a production type
------------------------

A *production type* is a land use the player allocates (e.g. arable land,
livestock). To add one, edit the relevant game-data JSON
(:file:`assets/dataGridExample.json` for grid, :file:`assets/data.json` for SVG):

#. Add an entry to ``productionTypes[]`` with a **unique** ``id`` (string, parsed
   to an integer), a per-language ``name``, a ``fieldColor``, an ``urlToIcon``
   (button icon), and ``maxElements`` (how many the player may place; ``0`` means
   unlimited — see ``GameService.canFieldBePlaced``).
#. Add the **suitability** map for it to ``maps[]`` with
   ``gameBoardType: "Suitability"``, a ``gradient``, the ``urlToData`` GeoTIFF,
   and ``productionTypes`` listing the new ``id``.
#. Add one or more **consequence** maps (``gameBoardType: "Consequence"``) that
   reference the same ``id`` if the type should incur ecosystem-service costs.

At startup ``GameService.initialiseGridMode`` / ``initialiseSVGMode`` build a
``ProductionType`` (``id``, ``fieldColor``, suitability ``GameBoard``,
``urlToIcon``, ``maxElements``) for each entry and pre-select the first one.
Translations for ``production_type_<id>`` and ``map_name_<id>`` are registered
automatically by ``Settings.mapData`` from the ``name`` objects, so make sure each
``name`` has an entry for every active language.


Adding a map
------------

Maps are the layers shown on the board. Add an entry to ``maps[]`` with:

* a unique ``id``;
* ``gameBoardType`` — one of ``Suitability`` (player scores against it),
  ``Consequence`` (ecosystem-service cost shown in later rounds), ``Drawing``
  (SVG zone overlay), or ``Background`` (SVG basemap);
* ``gradient`` — one of the built-in gradient names ``blue``, ``green``,
  ``orange``, ``purple``, ``red``, ``yellow`` (see ``DefaultGradients`` in
  :file:`shared/helpers/gradients.ts`);
* ``productionTypes`` — the production-type ``id``\ s this map applies to;
* ``urlToData`` — the GeoTIFF URL (a path under :file:`assets/images/` for the
  bundled grid data, or a backend/WCS URL for dynamic data);
* ``customColorId`` — references a ``customColors`` entry for discrete coloring
  (used by SVG drawing/background layers; ``""`` for gradient maps).

Consequence maps are surfaced in round 2+: ``GameService.goToNextLevel`` /
``prepareNextLevel`` attach each consequence ``GameBoard`` to the production
types listed in its ``productionTypes``, and ``ProductionType.getScore``
subtracts the consequence scores from the suitability score.


Adding a language
-----------------

Languages are registered in two places and resolved by ngx-translate.

#. **Register the language code.** :file:`app/app.component.ts` declares the
   active set:

   .. code-block:: typescript

      this.translate.addLangs(['de', 'en', 'nl', 'pt']);
      this.translate.setFallbackLang('en');
      this.translate.use('en');

   Add your code to ``addLangs([...])``. (``ConfiguratorComponent`` and the
   ``StartComponent`` language picker read ``translate.getLangs()``, so the new
   language appears automatically once registered.)

#. **Add the translation file.** Create
   :file:`src/assets/i18n/<code>.json` (the existing set is ``de``, ``en``,
   ``nl``, ``pt``). The HTTP loader is configured in :file:`app.module.ts` via
   ``provideTranslateHttpLoader({ prefix: './assets/i18n/', suffix: '.json' })``;
   the fallback language is ``de`` for the loader and ``en`` at runtime, and
   missing keys fall through ``MyMissingTranslationHandler`` to the key itself.

#. **Add per-language strings to the game data.** Game titles, instructions, and
   the ``name`` objects on ``productionTypes`` and ``maps`` are per-language; add
   your code to each ``{lang: string}`` object in the game-data JSON so
   ``Settings.mapData`` can register ``map_name_<id>``,
   ``production_type_<id>``, ``basic_instructions``, ``advanced_instructions``
   and ``title`` for the new language.


Extending appearance via config.json
-------------------------------------

There are three layers of visual customization, in increasing scope.

config.json appearance overrides (no rebuild)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

For SVG/dynamic deployments, three keys in :file:`assets/config.json` are merged
onto the game data by ``getGameData`` (so they can be changed by editing a
mounted file, no rebuild):

.. list-table::
   :header-rows: 1
   :widths: 26 18 56

   * - Key
     - Example
     - Effect
   * - ``gridLineColor``
     - ``"#333333"``
     - Color of the SVG cell border between zones.
   * - ``gridLineWidth``
     - ``"0.05px"``
     - Width of that SVG cell border.
   * - ``highlightWidth``
     - ``"1"``
     - Hover-highlight border width, in board units (built-in default is ``2``).

These land on the ``Settings`` instance as ``gridLineColor``, ``gridLineWidth``,
and ``highlightWidth``; all are optional and unset means the built-in look.

visualOptions (game-data theming flags)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The game-data JSON may carry a ``visualOptions`` object. ``Settings.mapData``
merges it over ``DEFAULT_VISUAL_OPTIONS`` (so omitted flags keep esgame's default
look). The flags (``VisualOptions`` in :file:`shared/models/settings.ts`):

.. list-table::
   :header-rows: 1
   :widths: 30 12 58

   * - Flag
     - Default
     - Effect
   * - ``consequenceFieldOpacity``
     - ``false``
     - Render consequence-map fields semi-transparent and overlay the
       consequence image.
   * - ``highlightFocusedBoard``
     - ``false``
     - Outline the currently focused board (read by ``SvgLevelComponent``).
   * - ``neutralScoreColors``
     - ``false``
     - Use neutral (black) map-title colors instead of positive/negative
       green/red (toggles the ``neutral-scores`` host class).

gradientOverrides (per-deployment gradient stops)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The six built-in gradients (``blue``, ``green``, ``orange``, ``purple``, ``red``,
``yellow``) are defined in :file:`shared/helpers/gradients.ts`, each with a
``startingColor`` / ``endingColor`` pair plus a discrete palette. A game-data
``gradientOverrides`` object lets a deployment re-tune any gradient's start/end
without code changes:

.. code-block:: json

   "gradientOverrides": {
     "green": { "start": "edf8e9", "end": "006d2c" },
     "blue":  { "end": "08306b" }
   }

``Settings.mapData`` calls ``applyGradientOverrides(...)``, which **always resets
to the built-in defaults first**, then applies the overrides. This means loading a
config *without* overrides restores the originals, and one deployment's override
never leaks into the next config loaded in the same session. Colors are six-digit
hex (no leading ``#``); only ``start`` and/or ``end`` may be given per gradient.


See also
--------

* :doc:`/game-mechanics` — the rules, rounds, and scoring model.
* :doc:`/reference/frontend-services` — annotated reference for ``ConfigService``,
  ``GameService``, ``ScoreService``, ``TiffService``, and ``ApiService``.
