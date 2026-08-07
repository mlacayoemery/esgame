Dependency review
=================

.. Where this document's section-local :file: paths resolve from; see
.. docs/_checks/check-file-paths.py.
.. file-base: v2
.. file-base: v2/src
.. file-base: v2/src/app
.. file-base: .github/workflows

A standing record of where esgame's dependencies sit relative to their newest
releases, and — where something is held back — what is holding it and how to
release it.

The working rule is: **take the newest release, and only stay back when another
dependency forces it.** "That's what was there" is not a reason. Everything on
this page is either already at its newest version or has a named blocker below.

Last reviewed: **2026-08-06**.


Current state
-------------

.. list-table::
   :header-rows: 1
   :widths: 32 20 48

   * - Area
     - State
     - Notes
   * - ``npm audit`` (all)
     - **0**
     - First time including dev. See `Cleared 2026-08-06`_ for what the three
       standing findings turned out to need, which was less than the entry they
       replaced assumed.
   * - ``npm audit`` (production)
     - **0**
     - Nothing shipped to the browser has an outstanding advisory.
   * - ``npm outdated``
     - **1 entry**
     - Only ``typescript`` (capped, see `TypeScript`_). Framework packages are at
       22.1.0, which *is* their newest; the tooling releases faster, so
       ``@angular/build`` and ``@angular/cli`` are 22.1.3 and ``@angular/cdk`` /
       ``@angular/material`` 22.1.1. Nothing else is behind and no package in the
       tree is deprecated.


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

.. _Cleared 2026-08-06:

Cleared 2026-08-06 — three dev advisories, none of which needed an override
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Three findings sat here, all dev-scope, all inside ``@angular/cli``'s or
``@lhci/cli``'s tree:

.. list-table::
   :header-rows: 1
   :widths: 22 26 52

   * - Package
     - Path
     - How it cleared
   * - ``fast-uri``
     - ``@angular/cli → @angular-devkit/core → ajv``
     - ``ajv@8.20.0`` declares ``fast-uri: ^3.0.1`` and the fix is **3.1.5**, so the
       patched version was inside the declared range the whole time — only the
       lockfile pinned 3.1.4. ``npm update fast-uri``. No override, no CLI bump.
   * - ``hono``
     - ``@angular/cli → @modelcontextprotocol/sdk``
     - Same shape: the ReDoS fix is 4.12.34, ``sdk`` declares ``hono: ^4.11.4``, and
       it resolved to **4.13.0**. The ``@modelcontextprotocol/sdk`` and
       ``@hono/node-server`` overrides had already done the structural half.
   * - ``brace-expansion``
     - ``@lhci/cli → chrome-launcher → … → minimatch``
     - The held-forward override below was already there; it just named ``^5.0.8``
       and the fix is **5.0.9**. One character.

The entry this replaces assumed the blocker was Angular CLI's exact pin of
``@modelcontextprotocol/sdk@1.29.0``, and said to wait for a CLI bump. That pin is
real — ``@angular/cli@22.1.3`` still carries it, so the ``sdk`` override stays — but
it was never what held ``fast-uri`` back, and waiting would not have cleared any of
the three. **Check the range before concluding a transitive is blocked:** a range
that already admits the patched version means the lockfile is stale, not that
upstream is holding you.

Verified after the change, because all three sit in the toolchain rather than in
the app: ``npm audit`` **0 including dev** (production was already 0), 378 unit
tests, 12 Playwright e2e, and Lighthouse CI green — that last one being the check
that matters, since the ``brace-expansion`` chain is ``@lhci/cli``'s own.


Held-forward with overrides
---------------------------

``@lhci/cli`` is the newest release (0.15.1) but carries an aged tree —
``chrome-launcher → rimraf → glob → minimatch → brace-expansion``, plus ``tmp``,
``inquirer`` and ``uuid`` — which added **10 findings** when Lighthouse CI was
introduced. ``npm audit fix --force`` "solves" this by downgrading to
``@lhci/cli@0.6.1``, which is not a solution.

Instead :file:`v2/package.json` pins those transitives forward::

   "overrides": {
     "brace-expansion": "^5.0.9",
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

``js-yaml`` needed no override — *2026-08-07*
   GHSA-5p4m-2wfm-xmqj (quadratic CPU in ``!!omap`` resolution, CVSS 7.5) landed against
   ``js-yaml@3.15.0`` in the same ``@lhci/cli`` tree, and its title —
   "CVE-2026-59870 fix **not backported**" — reads like the 3.x line is unfixable and an
   override to 4.x is the only way out. It is not: the advisory patches **both** lines,
   ``4.3.1`` and ``3.15.1``, and ``@lhci/utils`` already declares ``js-yaml: ^3.13.1``,
   which reaches ``3.15.1`` on its own. A lockfile bump of three lines closed it.

   That is the second time here that a transitive looked blocked and was not. **Read the
   advisory's own patched-version list before believing the summary**, and check it against
   the declared range::

      gh api /advisories/GHSA-xxxx --jq '.vulnerabilities[]
        | "\(.vulnerable_version_range) -> \(.first_patched_version)"'

   **It was also not reachable here**, which is worth recording so the next person does not
   over-value the fix. ``js-yaml`` has one call site in the tree —
   ``@lhci/utils/src/lighthouserc.js:84``, ``yaml.safeLoad(contents)`` — and it is gated on
   the config path matching ``/\.ya?ml$/``. This repository passes
   ``--config=lighthouserc.json``, so parsing falls through to ``JSON.parse`` and the
   vulnerable code never runs. Dev-only, unreachable, and free to fix: taken as hygiene, not
   as an exploit.

   **No CI job would have caught it.** The audit in :file:`ci.yml` is ``--omit=dev`` *and*
   scheduled-only — deliberately, so a new advisory against a shipped dependency does not
   block an unrelated PR. A dev-tree advisory therefore surfaces only through Dependabot.
   This case argues for leaving that as it is rather than widening the gate: an unreachable
   finding in a dev tool is exactly what should not stop a merge.


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
   * - ``nginxinc/nginx-unprivileged:alpine``
     - Low risk; the runtime stage only serves static files. The same nginx build as
       ``nginx:alpine`` (1.31.3 at review time) from the nginx project's own Docker Hub
       org, packaged to run as uid 101 — which is what lets the Deployment assert
       ``runAsNonRoot``. Both tags are rolling, so a base-image regression to uid 0 would
       arrive without a code change here; the probe in
       :file:`.github/workflows/image.yml` fails the publish if it does.
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
new external asset fails CI.

Verified against the **published** image, not just a local build: pulling
``ghcr.io/mlacayoemery/esgame:master`` and loading it with every non-localhost origin
blocked renders the full 2,436-field board, with Roboto 400/500 and the icon font loaded,
both production-type images present, ``mat-icon`` measuring 18x18, no console errors, and
**no external request even attempted**. The published bundle is byte-identical to a local
production build (same filenames, same md5 sums).

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
   * - ``@angular/animations``
     - **Removed** (2026-07-29). Deprecated upstream, and Angular Material 22 no longer
       needs it. Dropping ``BrowserAnimationsModule`` from :file:`app.module.ts` took
       65,988 B off ``main``. Most Material motion is CSS-based and survives: the built
       output goes from 110 ``transition``/``animation``/``@keyframes`` declarations to
       102.
   * - ``rgdal`` (:file:`tools/R/Dockerfile`)
     - **Removed.** Archived on CRAN since Oct 2023, so ``install.packages`` was a
       silent no-op that still exited 0 — the image never had it.
   * - Sass ``@import``
     - **Migrated** to the module system (``@use``). ``@import`` is removed in
       Dart Sass 3.0.
   * - GitHub Actions on the v4 runtime
     - **Bumped** to current majors. GitHub force-migrated the Node 20 action
       runtime on 2026-06-16 and removes it on 2026-09-16.
