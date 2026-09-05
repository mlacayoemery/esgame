============
Game builder
============

.. Where this document's section-local :file: paths resolve from; see
.. docs/_checks/check-file-paths.py.
.. file-base: v2/src/app/configurator
.. file-base: v2/src/app
.. file-base: examples

The **game builder** is the authoring tool at ``/configurator``. It produces the JSON a
deployment points ``staticDataUrl`` or ``dynamicDataUrl`` at — the same shape
:file:`shared/models/settings.ts` reads — and imports one back for editing.

It is lazy-loaded (:file:`app-routing.module.ts`) because it is not on the path to playing a
game; nothing in the running game imports it, and a player never loads its chunk.

.. contents::
   :local:
   :depth: 2
   :class: this-will-duplicate-information-and-it-is-still-useful-here


What a game is, in two axes
===========================

:doc:`/static-vs-dynamic` sets this out in full; the builder only makes sense against it.

**Type of data** is static (the browser scores the allocation from rasters that ship with the
game) or dynamic (a calculator scores the round and returns the next level's rasters).

**Unit selection** is a raster grid (square cells implied by ``gameBoardColumns`` ×
``gameBoardRows``) or vector SVG (polygons traced from a zone raster).

One rule follows from the second axis and is worth stating because the form cannot enforce it:

.. important::

   **A vector-SVG unit is one zone.** ``elementSize`` greater than 1 groups cells by stepping
   through ``gameBoardColumns`` — ``GameService.getAssociatedFields`` — so it only means anything
   where the zones happen to be laid out as a rectangular grid. That is exactly what
   :file:`dataDynamicGridRect.json` is, and what the *GridRect* in its name records: 812 zones,
   one per cell of a 28 × 29 board, selected 2 × 2 at a time to match the grid game piece for
   piece. A board of irregular zones — the 465 hexagons of :file:`v2/src/assets/data.json` — must
   leave ``elementSize`` at 1, and nothing in the data would catch it if it did not.


What it can author
==================

The form is a stepper. Every control below writes one key of the game JSON.

.. list-table::
   :header-rows: 1
   :widths: 22 30 48

   * - Step
     - Fields
     - Notes
   * - Import
     - a file picker
     - Reads a configuration back into the form. Refuses anything that is not a JSON object,
       with a message — ``[1,2,3]`` and ``null`` parse cleanly and would otherwise read as a
       game with no maps.
   * - Text
     - ``title``, ``basicInstructions``, ``advancedInstructions`` (one control per registered
       language), ``basicInstructionsImageUrl``, ``advancedInstructionsImageUrl``
     - The language set comes from ``TranslateService.getLangs()``, so a language the app does
       not register cannot be authored here.
   * - Board
     - ``mapMode``, ``calcUrl``, ``gameBoardColumns``, ``gameBoardRows``, ``elementSize``,
       ``highlightColor``, ``minValue``, ``maxValue``, ``minSelected``, ``infiniteLevels``,
       ``imageMode``
     - See `What the mode decides`_.
   * - Board, continued
     - ``clientScored``, ``backendScored``, ``paletted``, ``scoreByConversion``, ``autoOpenInstructions``,
       ``editablePreviousRounds``, ``optimalSolutionUrl``, ``visualOptions`` (three flags)
     - Added 2026-09-05. Settings has read all of these for some time; none could be authored
       here, which is why the shipped SVG game could not be built with this tool.
   * - Production types
     - ``id``, ``name``, ``fieldColor``, ``urlToIcon``, ``maxElements``
     - Ids are what a round POSTs as ``lulc``, so they are the contract with a calculator.
   * - Custom colours
     - named colour sets of ``number`` → ``color``
     - A map opts in by choosing gradient ``custom`` and naming the set.
   * - Maps
     - ``id``, ``name``, ``gameBoardType``, ``urlToData``, ``productionTypes``, ``gradient``,
       ``customColorId``
     - ``Drawing`` and ``Background`` are offered only in SVG mode, which is the one place the
       form is right to key off the mode: a grid board has no zone raster to trace.
   * - Export
     - a download button
     - Writes ``configuration.json`` from ``getRawValue()``, so disabled controls are included
       rather than silently dropped.


What the mode decides
---------------------

Only the SVG scaling fields — ``minSelected``, ``minValue``, ``maxValue`` — because only the SVG
boards read them. ``calcUrl`` was on this list until the grid game learned to be scored by a
calculator; it is authorable in either mode now, and what decides whether a grid round is POSTed
is the dataset's own ``backendScored``.

Everything else used to be decided by the mode too, and that was wrong — see `The gaps, and what
was done about them`_.

Switching the mode by hand also applies that mode's defaults (``infiniteLevels``, and the
scaling fields on the way back to grid). **Importing does not**: ``loadConfiguration`` re-applies
which fields are live but never the defaults, because patching ``mapMode`` fires the subscription
mid-import and the defaults would overwrite values the file had already supplied — an outcome
that depended on key order in the JSON.


Could the shipped examples be built with it?
============================================

Both, now. Neither, before 2026-09-05.

This is asserted rather than claimed: ``the builder can express the games this repository ships``
in :file:`configurator.component.spec.ts` imports each example, loads it into the form, exports it
back, and requires every key the file declares to survive. A field the form cannot hold arrives
as ``undefined`` and fails the test by name.

The comparison is *"says everything the file says"*, not deep equality, for one honest reason: a
dataset may state an object partially and mean the rest by omission.
:file:`dataDynamicGridRect.json` writes ``visualOptions: { neutralScoreColors: true }`` and
Settings merges it over defaults that are all false, so a form emitting the complete object
expresses the same game. Extra keys the form always writes are a superset and harmless.


The gaps, and what was done about them
======================================

.. list-table::
   :header-rows: 1
   :widths: 34 66

   * - Gap
     - Resolution
   * - **SVG forced ``elementSize`` to 1** and disabled the board dimensions, so a 28 × 29 board
       of 2 × 2 pieces — the shipped SVG example — could not be authored at all.
     - Fixed. The board is the board whichever way its units are selected; the constraint that
       actually holds is the zone rule above, which is documentation rather than a disabled
       control.
   * - **SVG forced ``imageMode`` to false** and ``infiniteLevels`` to true, both of which the
       shipped SVG example sets the other way.
     - Fixed, with the defaults now applied only when a person changes the mode.
   * - **Ten behaviour keys had no control**: ``clientScored``, ``paletted``,
       ``scoreByConversion``, ``autoOpenInstructions``, ``editablePreviousRounds``,
       ``optimalSolutionUrl`` and the three ``visualOptions`` flags.
     - Fixed; they sit with the rest of the board settings, in the same step.
   * - **``advanccedInstructionsImageUrl``** — every dataset in and around this repository spells
       the key with two c's, and Settings read only the correct spelling. The key an author fills
       in was the one nothing looked at, and the failure is silence.
     - Settings now accepts both, correct spelling winning, pinned by
       :file:`v2/src/app/shared/models/settings.shipped-data.spec.ts`. The builder emits the
       correct one, so a game authored here is the fixed version. Empty in every shipped file
       today, which is why nobody had noticed.
   * - **``gridLineColor``, ``gridLineWidth``, ``highlightWidth``** are in the datasets but not in
       the form.
     - Left out deliberately. ``ConfigService`` lets a deployment's ``config.json`` override all
       three, so they are theming a deployment owns rather than something the game states. The
       round-trip test names them as excluded rather than passing silently.
   * - **A grid game with a backend could not be authored**, because ``calcUrl`` was disabled in
       grid mode. That was right while the runtime ignored the field, and wrong the moment it
       stopped.
     - Fixed on both sides. The app scores a raster-grid round on a calculator when the dataset
       sets ``backendScored``, and the form offers that checkbox with ``calcUrl`` live in either
       mode. What stays mode-bound is the SVG scaling — ``minSelected``, ``minValue``,
       ``maxValue`` — which only the SVG boards read. See :doc:`/static-vs-dynamic`.
   * - **``gradientOverrides``** is read by ``Settings`` and has no control.
     - Open. It is a theming escape hatch no shipped dataset uses; the round-trip test would fail
       the day one does, which is the point at which it is worth building a UI for.
