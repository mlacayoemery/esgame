Dependency review
=================

A standing record of where esgame's dependencies sit relative to their newest
releases, and — where something is held back — what is holding it and how to
release it.

The working rule is: **take the newest release, and only stay back when another
dependency forces it.** "That's what was there" is not a reason. Everything on
this page is either already at its newest version or has a named blocker below.

Last reviewed: **2026-07-29**.


Current state
-------------

.. list-table::
   :header-rows: 1
   :widths: 32 20 48

   * - Area
     - State
     - Notes
   * - ``npm audit`` (all)
     - **3 moderate**
     - All three are inside ``@angular/cli``'s own tree — see
       `@modelcontextprotocol/sdk`_ below.
   * - ``npm audit`` (production)
     - **0**
     - Nothing shipped to the browser has an outstanding advisory.
   * - ``npm outdated``
     - **2 entries**
     - ``typescript`` (capped, see `TypeScript`_) and ``@angular/animations``
       (deprecated, see `@angular/animations`_). Nothing else is behind.


Blocked upgrades
----------------

TypeScript
~~~~~~~~~~

*Pinned at 6.0.3; 7.0.2 is available.*

``@angular/compiler-cli@22`` declares ``typescript: ">=6.0 <6.1"``. TypeScript 7
is not merely untested here — it is excluded by the peer range, so npm will not
resolve it. 6.0.3 is already the newest ``6.0.x``.

**Blocker:** Angular, not an unmaintained package.

**To unblock:** wait for an Angular release whose ``compiler-cli`` widens the
range, then bump both together. Check with::

   npm view @angular/compiler-cli@latest peerDependencies.typescript

@angular/animations
~~~~~~~~~~~~~~~~~~~

*Formally deprecated upstream:* "``@angular/animations`` is deprecated. Use
``animate.enter`` and ``animate.leave`` instead."

It cannot simply be removed. :file:`app.module.ts` imports
``BrowserAnimationsModule`` from ``@angular/platform-browser/animations``, which
resolves ``@angular/animations/browser``. Dropping the package fails the build::

   ✘ [ERROR] Could not resolve "@angular/animations/browser"
       node_modules/@angular/platform-browser/fesm2022/animations.mjs:10:20

(Its ``latest`` dist-tag points *backwards*, to 20.1.8, which is why
``npm outdated`` lists it oddly. The installed 22.0.8 is correct.)

**Blocker:** Angular Material's reliance on ``BrowserAnimationsModule``.

**To unblock:** migrate the app off ``BrowserAnimationsModule`` — either to the
``animate.enter`` / ``animate.leave`` API or to ``provideAnimationsAsync()``.
This changes Material's component transitions, so it wants visual review rather
than a blind swap. Not urgent: deprecated, still shipped, still supported.

.. _@modelcontextprotocol/sdk:

@modelcontextprotocol/sdk → @hono/node-server
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

*Three moderate advisories, dev-only.*

::

   @angular/cli → @modelcontextprotocol/sdk → @hono/node-server (path traversal)

Nothing in this repository selects those versions; ``@angular/cli`` does, and it
is already at its newest release.

**Blocker:** Angular CLI's own dependency pin.

**To unblock:** it clears itself when Angular CLI ships a bumped
``@modelcontextprotocol/sdk``. An ``overrides`` entry would be the fallback if it
lingers, but overriding an MCP SDK under the CLI is riskier than waiting.


Held-forward with overrides
---------------------------

``@lhci/cli`` is the newest release (0.15.1) but carries an aged tree —
``chrome-launcher → rimraf → glob → minimatch → brace-expansion``, plus ``tmp``,
``inquirer`` and ``uuid`` — which added **10 findings** when Lighthouse CI was
introduced. ``npm audit fix --force`` "solves" this by downgrading to
``@lhci/cli@0.6.1``, which is not a solution.

Instead :file:`v2/package.json` pins those transitives forward::

   "overrides": {
     "brace-expansion": "^5.0.8",
     "minimatch":       "^10.2.6",
     "glob":            "^13.0.6",
     "rimraf":          "^6.1.3",
     "tmp":             "^0.2.7",
     "uuid":            "^14.0.1"
   }

These cross majors (``glob`` 7→13, ``rimraf`` 3→6, both now ESM-first with
changed APIs), so they are verified by running Lighthouse rather than assumed
safe. **Drop them once ``@lhci/cli`` ships a refreshed tree** — re-check with
``npm audit`` after removing the block.


Reproducibility gaps
--------------------

Floating tags always resolve to the newest image, which satisfies the newest-version
rule but means two builds a month apart are not the same build.

.. list-table::
   :header-rows: 1
   :widths: 40 60

   * - Reference
     - Trade-off
   * - ``rstudio/plumber`` (untagged → ``latest``)
     - Currently R 4.6.1. The newest concrete tag is ``v1.3.0``, but that pins a
       *plumber* version and may carry an older R, so pinning could regress the
       interpreter. Left floating deliberately.
   * - ``geopython/pygeoapi:latest``
     - Same shape. The pygeoapi example is read-only and config-driven, so drift
       shows up as a startup failure rather than silent misbehaviour.
   * - ``nginx:alpine``
     - Low risk; the runtime stage only serves static files.
   * - :file:`docs/requirements.txt` (``sphinx>=7``, ``furo``, ``myst-parser``)
     - Fully unpinned, so docs builds always take the newest Sphinx (9.1.0 at
       review time). Good for freshness, and a Sphinx major could break the build
       without a code change here.


Runtime dependencies on external hosts
---------------------------------------

**There are none, and that is now enforced.**

The app used to fetch Roboto and Material Icons from Google Fonts (declared in
:file:`index.html`) and two production-type icons from ``raw.githubusercontent.com``
(referenced by :file:`assets/dataGridExample.json`, the *default* dataset). The
container image is described as self-contained, but could not render text or icons
correctly without reaching the internet — a real problem on the offline and filtered
school networks this game is played on.

All of it is vendored now:

* Roboto 300/400/500 as WOFF2 in :file:`src/assets/fonts/Roboto`.
* Material Icons subset to the four ligatures the app uses
  (``open_in_full``, ``close_fullscreen``, ``delete``, ``add``) — 356,840 B TTF down to
  23,336 B WOFF2 — in :file:`src/assets/fonts/MaterialIcons`.
* ``corn.png`` / ``cow.png`` copied from the repository's own :file:`images/` into
  :file:`src/assets/images`.

:file:`v2/lighthouserc.json` asserts ``resource-summary:third-party:size <= 0``, so any
new external asset fails CI. Verified by loading the container with every non-localhost
origin blocked: no request is even attempted, and icons, fonts and images all render.

**Vendored font licensing:** Roboto and Material Icons are both Apache-2.0.
:file:`src/assets/fonts/Roboto/LICENSE.txt` is retained.


Superseded but maintained
-------------------------

Not blockers — worth knowing when these files are next touched.

* **``sp`` and ``raster``** (:file:`tools/R/calculator.r`) are the previous
  generation of R spatial packages; ``sf`` and ``terra`` are their successors and
  are *already installed in the image*. Migrating is a code change in
  ``calculator.r``, not a dependency change.
* **``zone.js`` 0.16.2** — Angular 22 supports zoneless change detection
  (``provideZonelessChangeDetection``). The app is NgModule-based with ``OnPush``
  components, so going zoneless is plausible but is a behavioural change to
  change-detection, not a version bump.
* **``lerc``** (via ``geotiff`` 3.0.5, itself newest) is not ESM and triggers an
  esbuild optimization bailout::

     ▲ [WARNING] Module 'lerc' used by 'node_modules/geotiff/dist-module/compression/lerc.js' is not ESM

  It costs a ~97 kB chunk. Only fixable upstream in ``lerc``/``geotiff``.
* **``@angular/build:unit-test``** is marked ``[EXPERIMENTAL]`` in v22. It is
  Angular's own supported path off Karma and works here, but the label is real —
  expect option churn between minors.


Resolved on 2026-07-29
----------------------

Recorded so these are not re-investigated.

.. list-table::
   :header-rows: 1
   :widths: 34 66

   * - Was
     - Outcome
   * - ``karma`` + ``karma-*`` + ``jasmine``
     - **Removed.** No npm release since 2024-11-06, and its
       ``socket.io → ws`` chain carried every outstanding advisory. Replaced by
       Vitest + jsdom via ``@angular/build:unit-test``.
   * - ``@angular/platform-browser-dynamic``
     - **Removed.** Deprecated; ``platformBrowser()`` from
       ``@angular/platform-browser`` is the supported bootstrap.
   * - ``subsink`` 1.0.2
     - **Removed.** Last published 2022-05-18. Replaced by Angular's
       ``takeUntilDestroyed``, which also fixed two subscriptions that were never
       being unsubscribed.
   * - ``angular-cli-ghpages``
     - **Removed.** Backed an ``ng deploy`` target nothing invoked; Pages
       deployment goes through ``actions/deploy-pages``.
   * - ``rgdal`` (:file:`tools/R/Dockerfile`)
     - **Removed.** Archived on CRAN since Oct 2023, so ``install.packages`` was a
       silent no-op that still exited 0 — the image never had it.
   * - Sass ``@import``
     - **Migrated** to the module system (``@use``). ``@import`` is removed in
       Dart Sass 3.0.
   * - GitHub Actions on the v4 runtime
     - **Bumped** to current majors. GitHub force-migrated the Node 20 action
       runtime on 2026-06-16 and removes it on 2026-09-16.
