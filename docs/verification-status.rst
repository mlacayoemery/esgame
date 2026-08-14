Verification status
===================

What has actually been run, how, and what has not. Green CI proves the build and the test
suite; most of what follows is outside CI's reach and was exercised by hand.

Kept because the alternative is re-deriving it. Several paths here were broken for a long
time precisely because nothing had ever run them, and the failures were silent — a seeder
that logged ``done`` having registered nothing, an e2e suite passing against a board that
never rendered, a schema check reporting 10/10 valid on manifests the API server rejected.

Last updated: **2026-08-14**.

.. note::

   The counts below drift. "135 unit tests" sat here while the suite grew to 255, because it
   was written mid-session and never revisited — the same shape as the stale registry images
   recorded further down: a number that was true when written and is not re-derived when read.
   Re-measure before trusting one.

   **Re-derived 2026-08-06, and three of four were wrong.** The unit and e2e counts are gated in
   CI and were right. Every count that is *not* gated had drifted:

   .. code-block:: text

      ingress-test.sh          said 16/16   runs 18   hand-counted; one check is inside a loop
      places test/stack.sh     said 21      runs 24
      places test/k8s.sh       said 20      runs 22

   ``ingress-test.sh`` now counts and prints its own total, so that one cannot drift again —
   ``18/18 checks`` comes out of the run rather than out of someone counting ``check`` in the
   source, which gives 16 because the ingress-adoption check runs once per Ingress. It also
   refuses to report PASS having run fewer than ten checks: every check there is guarded by data
   read from the cluster, so an early ``kubectl`` failure could have skipped all of them and still
   printed success. Confirmed by mutation — raising that floor to 100 gives
   ``FAIL only 18 checks ran`` and **exit 1**.

   The two PLACES numbers are another repository's and cannot be gated from here, so they are
   dated measurements like the rest of this page.


Verified working
----------------

.. list-table::
   :header-rows: 1
   :widths: 26 74

   * - Path
     - How it was checked
   * - Static / grid game
     - 401 unit tests, 20 Playwright e2e, Lighthouse a11y 100 / best-practices 100 /
       SEO 100. The board renders 2,436 fields; the e2e suite asserts that rather than
       just asserting the component mounted.
   * - No external runtime deps
     - Every route loaded with all non-localhost origins blocked: no request is even
       attempted. Enforced by ``resource-summary:third-party:size <= 0``.
   * - Published container image
     - ``ghcr.io/mlacayoemery/esgame:master`` pulled and run. Byte-identical to a local
       production build (same filenames, same md5 sums), and renders with the network
       blocked. **Re-checked after this session's frontend changes** (2026-07-30, image
       for ``379545a``): pulled fresh, ``CALC_URL`` injected at start, grid board decodes
       2,436 fields and the SVG board 466 hexagons from real GeoTIFFs, no page errors.
       Also confirms nginx's asset handling first-hand — a missing ``.tif`` returns 404,
       a real one 200 ``image/tiff``, and an unknown route falls back to the app.
   * - ``deploy/k8s`` base
     - Applied to a throwaway kind cluster. ``--dry-run=server`` clean;
       ``esgame-angular`` and ``esgame-geoserver`` reach ready; Services have endpoints
       (a selector matching nothing still applies without error); ``CALC_URL`` is
       substituted into ``assets/config.json`` **inside the running container**. Now a
       CI job — see :file:`.github/workflows/manifests.yml`.
   * - GeoServer credentials
     - Injected from the ``esgame-geoserver-admin`` Secret. Confirmed the default
       ``admin``/``geoserver`` login returns 401 and the injected one returns 200, and
       that a missing Secret stops the rollout.
   * - ``examples/esgame-dynamic`` (GeoServer)
     - Full stack up: seeder reports ``verified 8 coverage stores``, WCS ``GetCoverage``
       returns a GeoTIFF for 8/8, calculator healthy, frontend serves.

       **Re-run 2026-08-06 on non-default ports**, after the frontend image moved to 8080 and
       the published host ports became overridable. With ``ESGAME_FRONTEND_PORT=8191`` and
       ``ESGAME_GEOSERVER_PORT=8192``: seeder ``verified 8 coverage stores``, frontend 200,
       GeoServer 302, calculator 200, and a round returned **8/8 coverage URLs on :8192 and
       none on :8080**, all fetched back as GeoTIFFs. That last count is the point — the URLs
       are browser-facing, so a published port that moved without them would have returned 200
       with URLs nothing could resolve.
   * - ``examples/esgame-dynamic`` (pygeoapi)
     - Same, via OGC API - Coverages: 8 collections advertised, 8/8 return GeoTIFFs, and
       the calculator emits only pygeoapi coverage URLs with no WCS anywhere — which is
       the evidence for the "true drop-in" claim.

       **Re-run 2026-08-06 on non-default ports** (``ESGAME_FRONTEND_PORT=8193``,
       ``ESGAME_PYGEOAPI_PORT=8194``): frontend 200, pygeoapi 200, 8 collections, and a round
       returned **8/8 coverage URLs on :8194, none left on :5005, and 0 WCS URLs** — all eight
       fetched back as ``application/x-geotiff``. ``RASTER_URL_TEMPLATE`` is browser-facing, so
       the zero on :5005 is what says it followed its port rather than being left behind.
   * - ``tools/R`` calculator
     - The **plumbing**: 465-hexagon allocation POSTed to ``/esgame`` → HTTP 200,
       workspace created in GeoServer, five coverages published, WCS 5/5 GeoTIFFs,
       spider plot served. Also starts with ``--network none``. The *scores* are a
       different matter — see "the committed base raster" under Known incomplete. This
       row previously claimed "five real scores"; they were real numbers that did not
       depend on the allocation.
   * - Local registry + published images
     - ``deploy/registry`` serves all four images the manifests reference; each was
       pulled back and its digest compared against what was pushed. A round was then
       driven through the ``esgame-calculation`` image **pulled from the registry**
       (image ID confirmed identical): 200 in 58s, five finite scores, WCS 5/5, spider
       plot PNG, and no run-time package installation.
   * - places overlay
     - Renders 11 resources, all valid under ``kubeconform -strict``; ingress-host
       patches apply; the GeoServer pin flows through from this base. 22 checks in
       places' ``test/k8s.sh``, three of them confirmed able to fail by mutation.
   * - places local stack
     - The full compose stack up from a clean slate and a real round played through
       it: ``POST /esgame`` → 200 in 71s, six finite scores (HH 64, NP 34, WE 25,
       WA 25, HC 46, RV 47), six coverages fetched as GeoTIFFs **from outside the
       compose network**, spider plot served as a PNG. 24 checks in places'
       ``test/stack.sh``. That repo's geodata now loads for real in both paths —
       a loader service in compose, the ``load-geodata`` init container in k8s.
   * - Published GitHub Pages site
     - The canonical grid game, checked live rather than by a green workflow
       (2026-07-30, ``f391875``): <https://mlacayoemery.github.io/esgame/> renders
       **2,436 fields** from real GeoTIFFs with no page errors, ``assets/config.json``
       serves ``defaultMode: static`` / ``calcUrl: ""``, and the published docs resolve —
       including the links places' README points at.

       **Re-checked 2026-08-06** (``a7591c9``), after a day that rebuilt the image on an
       unprivileged nginx, changed the level layout and added a dialog to the round. Still
       2,436 fields, the same served config, **zero page errors and zero responses ≥ 400**.
       The narrow layout is live: ``/dynamic-game`` renders its 466 hexagons at 390, 600, 768
       and 1024px with **6/6 production types on screen and *Next Level* reachable at every
       one** — against the 3/6 clipped that was measured there before. ``flex-direction`` is
       ``column`` at 390 and 600, ``row`` at 768 and 1024, and the document never scrolls
       sideways.
   * - Multi-round game
     - Three consecutive rounds against the real ``tools/R``: three distinct GeoServer
       workspaces, scores that moved with each allocation, and 15/15 coverages still
       fetchable — including round 1's after rounds 2 and 3 had run. In the browser,
       :file:`v2/e2e/round-trip.spec.ts` plays two rounds against an intercepted
       calculator whose coverage URLs point at real GeoTIFFs, and asserts the board
       fetches round 2's URLs rather than re-rendering round 1's.
   * - Cluster ingress traffic
     - **Closed 2026-07-31.** A round driven through a real ingress-nginx controller by
       ``Host`` header, never ``port-forward``: 15/15 checks in
       :file:`deploy/k8s/ingress-test.sh` *as it stood that day* — it runs 18 now, and the
       script reports its own total rather than leaving it to be counted here. Against a
       **cold** cluster built by
       :file:`deploy/k8s/kind.sh`, pulling every image from the local registry.
       ``POST /esgame`` → 200 in 26s, five finite scores (HH 23, NP 22, WA 29, HC 33,
       RV 23), **5/5 coverages fetched as GeoTIFFs through the geoserver ingress**, and
       ``CALC_URL`` confirmed in the config the ingress actually served. ``esgame-calculation``
       reached ready for the first time — its image is published nowhere, so the local
       registry is what made it possible.

       The host's ``fs.inotify.max_user_instances`` had to be raised from 128 to 512 first;
       below that ``kube-proxy`` crash-loops and the ingress controller never gets its
       certificate.
   * - .. _A browser plays a round:

       A browser plays a round
     - **Closed 2026-07-31.** :file:`v2/e2e-cluster/browser-round.spec.ts` — real Chrome,
       nothing intercepted, against the live cluster. It loads ``http://esgame.local:8880``
       through the ingress, clicks 12 hexagons on the board, and presses *Next Level*; the
       app builds its own allocation and POSTs it to the calculation ingress. Measured:
       **465 hexagons sent by the browser** (not constructed by the test), 5 WCS coverages
       fetched from the geoserver ingress, 7 score-board rows, the spider plot rendered, and
       no page errors. The only accommodation is DNS — Chrome's ``--host-resolver-rules``
       maps the three ``.local`` hosts to 127.0.0.1, so :file:`/etc/hosts` need not be edited.

       This is the check that made ``CALC_URL`` honest. It was portless, which no test in
       the repository could see: ``ingress-test.sh`` builds every request from ``BASE`` plus
       a ``Host`` header, so it reaches the ingress whatever the served config says, and its
       ``CALC_URL`` check compared the ConfigMap to the served file — consistency, not
       usability. Both agreed on a URL that pointed at port 80, where nothing listens.
       Confirmed by mutation: with the portless value restored, ``ingress-test.sh`` reported
       ``PASS`` on a cluster where a browser could not finish a round, and this spec failed.
       ``ingress-test.sh`` now also resolves ``CALC_URL``'s own host and port and posts to
       it, so it no longer passes on that (18 checks, verified failing under the mutation
       and under an absent config).

       A second spec plays **two** rounds. :file:`v2/e2e/round-trip.spec.ts` already covered
       this, but against an intercepted calculator whose two responses were query-string
       variants of one another; here they are two coverages GeoServer really published, and
       the calculator turns out to isolate each round in its **own workspace**
       (``esgame_game<uuid>_round1`` / ``_round2``). Measured: rounds 1 and 2 posted with
       distinct ``round`` values, zero overlap between the two sets of five coverage ids, and
       round 1's five coverages still returning 200 after round 2 published — so the history
       accumulates rather than being overwritten. Verified by mutation: replaying round 1's
       response for round 2 (what a failed in-place swap of ``settings.maps`` looks like on
       the wire) fails the overlap assertion, naming all five reused coverages.
   * - Browser-facing GeoServer URL
     - The R calculators built their WCS URLs from ``GEOSERVER`` — the in-cluster
       Service name — so the browser got URLs it could not resolve while everything
       returned 200. Split into ``GEOSERVER_PUBLIC_URL``; measured 6/6 coverages
       fetchable from outside the network in the places stack. Gated in CI, with all
       four failure modes checked by mutation.
   * - ``tools/R`` after the URL split
     - Listed under "Not verified" until 2026-07-30 as "esgame's own image has not played a
       round with ``GEOSERVER_PUBLIC_URL`` set". It has now, repeatedly: through the image
       pulled from the local registry (200 in 58s, five finite scores, WCS 5/5) and in the
       single-address configuration below.
   * - …and its backward compatibility
     - The split was claimed to leave an existing single-address deployment unchanged.
       That was an assertion until it was run: ``tools/R`` with ``GEOSERVER`` set and
       ``GEOSERVER_PUBLIC_URL`` deliberately **unset** returns 200, five finite scores,
       logs ``GEOSERVER_PUBLIC_URL is unset …`` and falls back to the ``GEOSERVER``
       address for its coverage URLs — which a client inside the network still fetches
       as ``image/geotiff``. Exactly the pre-split behaviour, now measured.


Closed here
-----------

Things that WERE defects or gaps in this repository and are not any more. They sit
apart from "Known incomplete" above, which is for what a deployment must supply —
three of these were filed under that heading and contradicted its opening sentence.

Allocations were synthetic — *closed 2026-07-31*
   Rounds were driven by an allocation generated from the raster's id set rather than
   produced by a player. It satisfied the id-space contract (see
   :doc:`reference/calculator`) but was not real play — and, as it turned out, was hiding
   the id-space mismatch rather than merely failing to exercise it. See
   `A browser plays a round`_ and "The committed base raster makes the game inert" below.

``esgame-calculation`` is not published — *closed 2026-07-31*
   It is now, by :file:`.github/workflows/image-calculation.yml`, to
   ``ghcr.io/mlacayoemery/esgame-calculation`` on pushes to master that touch
   :file:`tools/R`. Before that no workflow built it, so the k8s base and the places overlay
   both referenced an image that existed nowhere and the calculation pod was a permanent
   ``ErrImagePull`` — which is why every local test had to stand up its own registry first.

   **A green cluster run does not say which build was green.** Both images roll on ``:master``,
   so a pod started before the last publish keeps serving the old one — ``kubectl apply`` sees
   no change in a rolling tag and does nothing. That happened here: for several hours the
   cluster served a frontend image seven merges old while every check passed, because the pod
   had been started before those merges. ``kind.sh deploy`` does ``rollout restart``, which
   re-pulls under ``imagePullPolicy: Always``, and re-deploying moved the running digest from
   ``45f92893`` to ``e1fd8573``. :file:`deploy/k8s/ingress-test.sh` now prints the spec image and the
   running **digest** for both deployments, so its output records what it tested.

   Verified from a **cold start**, which is the claim :file:`deploy/k8s/README.md` makes: the
   cluster deleted and the local registry container stopped first, so nothing local could satisfy
   a pull meant to come from ghcr. ``kind.sh up`` 65s, ``ESGAME_OVERLAY=published kind.sh deploy``
   95s, ``ingress-test.sh`` 35s — about three minutes from nothing to a stack serving real
   ingress traffic, followed by both browser specs in 85s. The earlier check had only ever run
   the published overlay against an already-running cluster.

   Verified as a cluster uses it, not only as CI built it: pulled anonymously from ghcr, then
   deployed to the kind cluster through the new ``overlays/published`` and put through a full
   round — 18/18 in ``ingress-test.sh`` and both browser specs in ``v2/e2e-cluster`` (465
   hexagons, 5 coverages, two rounds in separate workspaces), with nothing built locally.

   The workflow does not stop at pushing. A push proves bytes were uploaded, not that the
   thing runs, so it starts the published image and requires it to answer on ``:8000`` and
   to survive a ``POST /esgame``. Measured against the same image locally: plumber binds
   after ~12s and returns 404 for an unrouted path, and an empty allocation comes back
   ``500 {"error":"500 - Internal server error"}`` — a structured refusal with no geodata
   mounted, rather than a dead process. A connection that is refused (``000``) is the
   failure the probe exists to catch.

The calculator refuses a round it cannot score — *added 2026-07-31*
   An allocation the calculator cannot use produced ``500
   {"error":"500 - Internal server error"}`` — plumber's rendering of an Rcpp type error
   several frames down (``Not compatible with requested type: [type=list; target=double]``).
   ``coverage.R`` had already logged *"Allocation is empty; the round will score the base
   raster unchanged"*, so the log said the round would proceed, it did not, and the status
   said the server was broken when the request was.

   Four shapes are now refused with **400** and a message naming the problem, measured against
   the live cluster:

   .. code-block:: text

      no allocation field   400  Cannot score this round: the request has no 'allocation' field.
      empty allocation      400  Cannot score this round: 'allocation' is empty.
      id-keyed object       400  ...'allocation' is a list; it must be an array of {id, lulc} objects.
      missing lulc column   400  ...'allocation' has columns [id]; it needs id and lulc.

   A real round is unaffected: 18/18 in :file:`deploy/k8s/ingress-test.sh` and both browser
   specs against the same rebuilt image.

The loading spinner does not clear when a level fails to build — *fixed 2026-07-31*
   The spinner covers the whole screen — ``:host.show`` gives it a white background over the
   board — so this was not cosmetic: the game became unusable with no way out but a reload.
   And it was reachable in any deployment, not only offline: ``prepareNextLevel`` builds the
   level from the coverage URLs the calculator returns, so one URL GeoServer could not serve
   was enough.

   The earlier diagnosis was right about the mechanism and wrong about the remedy.
   ``LoadingIndicatorComponent`` wrote to a plain field behind ``@HostBinding('class.show')``,
   and a host binding is evaluated by the view that *declares* the component — assigning a
   field tells Angular nothing about which view that is. Inside the zone something else
   happened along to check it; from an error callback outside the zone nothing did.
   ``cdRef.detectChanges()`` cannot help, because that ref is the component's own template
   view and its host bindings live in the parent's.

   The component now reads a **signal**. A signal read inside a host binding registers the
   binding as a consumer, so a write marks exactly the right view — no zone involved, which
   is why it holds on the path the old code could not reach.

   Both levels were checked by mutation, not assertion. In a unit test the old implementation
   fails two of three specs and the new one passes all three; in a real browser, with one
   coverage URL forced to 404, the old build leaves ``class="show"`` on the element for 123
   consecutive polls and the new build clears it. Getting there also corrected a false
   negative of my own: the first browser run failed against a **stale ``dist``**, which is the
   old component — evidence about the previous code, not about the fix.

   One trap worth recording: a ``ComponentFixture`` is detached from ``ApplicationRef`` unless
   ``autoDetectChanges()`` is called, and while detached *nothing* refreshes it — not
   ``ApplicationRef.tick()``, not a scheduled task, only an explicit ``detectChanges()``. A
   test written without it measures the harness rather than the component, and would have
   reported this bug as unfixable a second time.

.. _The published site was twelve commits behind master:

The published site was twelve commits behind master — *closed 2026-08-07*
   The documentation at https://mlacayoemery.github.io/esgame/docs/ was serving the build from
   ``0c322c8`` (#176) while master was at ``a8b29f7`` (#188). Everything merged after #176 —
   twelve commits, a full day of work, including every finding written up on this page that
   day — was simply absent from the site people are pointed at. It answered every request with
   a 200.

   Nothing reported it, and nothing *could*, because the site carried no identity. Sphinx's
   build says nothing about deployment; every other check in this repository asks a question
   about the tree, and this is a question about a remote artefact.

   The cause was not a bad build. :file:`.github/workflows/deploy.yml`'s ``build`` job
   succeeded in 1m16s; its ``deploy`` job then failed with:

   .. code-block:: text

      The job was not acquired by Runner of type hosted even after multiple attempts

   GitHub-hosted runners were unavailable to this repository for about eleven hours on
   2026-08-06/07 — githubstatus.com reported Actions "operational" throughout, and the
   repository is public, so this was neither a posted incident nor a spending cap. The visible
   symptom was runs "failing" after ~15 minutes without executing a step, and one
   ``Validate deploy artifacts`` run that sat queued for over eight hours. The artefact was
   built and never published, and Pages went on serving the previous one.

   **It repaired itself, and that is the argument for detecting it rather than against.**
   When runners came back the next push to master deployed normally and the site caught up in
   85 seconds — the page went from 94,716 bytes to 127,676, byte-for-byte the local build. So
   the whole episode leaves no trace: anyone checking afterwards finds a healthy site and no
   evidence it was ever a day stale. A fault that is invisible while it is happening and gone
   before anyone looks is not a fault anyone will find by looking harder.

   **What that costs is not the outage; it is that the outage was indistinguishable from
   health.** A reader cannot tell a current page from a day-old one, and neither could any
   check. Three things close that:

   * :file:`docs/conf.py` stamps every build. ``build-info.json`` lands beside the HTML with
     the commit, the ref, the run id and the build time; a "Last updated" line carrying the
     same instant and the short sha goes into the footer of **every** page.
   * :file:`.github/workflows/published.yml` fetches that JSON back off the live site daily
     and reports how many commits behind master it is, naming them. Scheduled only — the site
     legitimately lags a push, so as a required check it would fail after every merge and
     teach people to click through it. Same reasoning as
     :file:`.github/workflows/cluster.yml`.
   * :file:`.github/workflows/docs.yml` gates the producer on every pull request: the stamp
     must exist, must name a real sha rather than ``unknown``, must be on every page built,
     and must match ``build-info.json``. A freshness check downstream is worth nothing if the
     thing it reads can quietly stop being written.

   **One stamp covers the game as well as the documentation**, which is worth saying because
   the check only ever fetches a docs URL. :file:`.github/workflows/deploy.yml` builds the
   Angular app into
   ``v2/dist/tradeoff-v2`` and Sphinx into ``v2/dist/tradeoff-v2/docs``, then uploads *that
   whole directory* as one Pages artifact — so the app at ``/esgame/`` and the docs at
   ``/esgame/docs/`` are published atomically and cannot be at different commits. A stale
   ``build-info.json`` means the game is equally stale. (places has no Pages deploy and no
   Sphinx docs — only ``overlay.yml``, which is *its* workflow and not a path in this
   repository — so there is nothing to mirror there.)

   Both halves were tested by mutation rather than by assertion — the trap in
   `The checks were audited for vacuity`_. The producer gate was run against six broken
   builds (no JSON, ``unknown`` commit, empty commit, a non-sha, one unstamped page, a
   mislabelled timestamp) and fails each with an annotation; the freshness check was run
   against fixtures for a current site, a stale one, a site that cannot name its commit, a
   commit from another repository, and Pages serving an SPA fallback instead of JSON. Pointed
   at the real site it reproduces the finding from scratch: ``12 commit(s) behind master``.

   **A timestamp that lies about its zone is worse than no timestamp**, and this nearly
   shipped one. ``html_last_updated_fmt`` is rendered through Sphinx's date formatter, which
   substitutes ``%`` codes against **local** time; the first version read
   ``"%Y-%m-%d %H:%M:%S UTC"`` and published *06:01:31 UTC* for a build that happened at
   *04:01:33Z*. Sphinx 7.1 added ``html_last_updated_use_utc``, but :file:`docs/requirements.txt`
   floats on ``sphinx>=7`` and an unrecognised name in ``conf.py`` is ignored in silence rather
   than refused — so on an older Sphinx that option would have failed the same way and said
   nothing. The stamp is now pre-formatted in UTC with no format codes left in it, and the
   footer and the JSON are the same string by construction, so they cannot drift.

   One consequence reaches beyond the docs. The merge-on-green policy reads CI verdicts, and
   for those eleven hours CI could not produce one: #186 and #187 were merged against runs that
   had failed on runner acquisition rather than on their contents. That is what the
   "re-verify locally before merging" rule exists for, and it held — but it is worth recording
   that *"the run is red"* and *"the change is bad"* came apart here for a whole day.

.. _the-dependency-audit:

The dependency audit — *closed 2026-08-09*
   A **high**-severity advisory sat in the tree and neither of the two things that should have
   found it did. ``nanoid`` 3.3.16, `GHSA-2v37-7h3g-55p8
   <https://github.com/advisories/GHSA-2v37-7h3g-55p8>`_ — custom generators loop forever when
   asked for a zero-length id. It was found by running ``npm audit`` by hand.

   **CI could not see it, by construction.** ``nanoid`` arrives as
   ``@angular/build`` → ``postcss`` → ``nanoid``, so it is ``dev`` scope, and the audit step
   was ``--omit=dev``. Measured against the pre-fix lockfile, that command is
   ``found 0 vulnerabilities``, **exit 0**, while the same lockfile with the dev tree included
   is **exit 1** naming ``nanoid``. The production tree really is at 0 and really is the
   stricter invariant; the mistake was treating it as the *only* one.

   **Dependabot was the fallback, and it lagged.** It does watch the dev scope of
   :file:`v2/package-lock.json` — 145 alerts on this repository, 115 of them ``development``
   and 30 ``runtime`` — so "the dev tree is Dependabot's job" was true, and still insufficient.
   The advisory was published 2026-07-29 covering only ``>= 4.0.0, < 5.1.6``, then **amended**
   2026-08-07 20:50 UTC to add ``< 3.3.17``; the newest alert of any kind here is dated
   2026-08-07 04:13 UTC. No alert for ``nanoid`` was ever raised. An advisory whose *range*
   grows later is not the same event as a new advisory, and only the second one was covered.

   **The audit also ran last, behind everything it does not need.** It was the final step of
   ``build-test``, after the build, both suites and Lighthouse — so it executed only if all of
   them had passed. One flaky e2e on a Monday and the audit was skipped, in a run that was
   already red for an unrelated reason and would be read as such. ``npm audit`` resolves
   :file:`v2/package-lock.json` and needs no ``npm ci``, no build and no browser: verified by
   running it in a directory holding nothing but a ``package.json`` and the lockfile, with no
   ``node_modules`` at all. It is its own ``audit`` job now, still scheduled-only
   (plus ``workflow_dispatch``), in two steps — production, then the whole tree — with the
   second one under ``if: !cancelled()`` so a production finding cannot suppress the dev report.

   The fix itself is three lines of lockfile: ``postcss`` declares ``nanoid: ^3.3.16``, so the
   patched release was already inside the allowed range and nothing needed a new dependency.
   Took **3.3.18** rather than the minimum 3.3.17 — diffed, and 3.3.18 is 3.3.17 plus the same
   one-line guard applied to the async-native variant.

   **It was not reachable here, and was bumped anyway.** The defect is in ``customRandom`` in
   ``nanoid``'s *secure* entry point, whose ``while (true)`` compares ``id.length === size``
   only after appending — never true for ``size`` 0. The sole consumer in this tree is
   ``postcss/lib/input.js``, which calls ``nanoid/non-secure``'s ``nanoid(6)``: a literal size,
   a different entry point, and ``non-secure/index.cjs`` is **byte-identical** between 3.3.16
   and 3.3.18. Nothing in :file:`v2/src` imports ``nanoid`` directly. So this was free, in
   range, and worth taking on those grounds rather than on urgency — the finding worth keeping
   is not the bump but that two independent mechanisms both let it through.

   Confirmed able to fail, in both directions: pre-fix lockfile, **exit 1**; post-fix,
   ``found 0 vulnerabilities``, **exit 0**.

   **Nothing watched upstream VERSIONS until 2026-08-14, only advisories.** There was no
   :file:`.github/dependabot.yml` at all, so the version-update feed — a different feed from the
   security alerts that found ``nanoid`` and ``extract-zip`` — was never configured. What that cost
   is recorded under the GeoServer entry: a manifest comment reading "2.28.4 is the newest tag
   docker.osgeo.org publishes ... Checked, so nobody re-checks", true when written and false eight
   days later, corrected only because somebody happened to look while doing something else.

   There is a ``dependabot.yml`` now, covering ``github-actions`` and the three Dockerfile
   directories, and :file:`tools/newer-geoserver.sh` run weekly by ``ci.yml``'s ``base-images``
   job. The script exists because ``docker.osgeo.org`` is not Docker Hub and Dependabot's support
   for arbitrary registries is uneven — it asks the registry directly rather than trusting that the
   config entry works. It carries a ``REVIEWED_UP_TO`` marker so that declining an upgrade is a
   recorded decision rather than a red run people learn to ignore, the same shape as ``ACCEPTED``
   in :file:`tools/audit.sh`.

   Confirmed able to fail, in four states — the second was found by running it:

   .. code-block:: text

      pinned 3.0.0, newest 3.0.0          exit 0   "up to date"
      python given the tag list on stdin  exit 0   AND PRINTED NOTHING — see below
      pinned 2.28.4, 3.0.0 published      exit 1   names 3.0.0 as unreviewed
      registry unreachable                exit 2   "nothing was checked"

   The second row is the bug the first version shipped with, and it is the same one
   :file:`tools/audit.sh` carries a note about: ``python3 - <<'PY' <<<"$tags"`` hands python both
   the script and the data on stdin, the here-string wins, python reads the tag JSON as its
   program, and the check passes silently having done nothing. Both scripts pass the data as a file
   path now.

   Two things the new config makes visible rather than fixes. ``tools/R/Dockerfile`` is
   ``FROM rstudio/plumber`` with **no tag**, so Dependabot cannot bump it — that the R base floats
   under the golden test is already recorded on this page, and pinning it is a separate decision.
   And ``actions/setup-node`` is pinned at both ``v6`` and ``v7`` in different workflows.

   **An advisory this cannot fix — scoped 2026-08-14.** ``extract-zip``,
   `GHSA-jmr9-qjv8-65gv <https://github.com/advisories/GHSA-jmr9-qjv8-65gv>`_, high, dev scope,
   reached as ``@lhci/cli`` → ``lighthouse`` → ``puppeteer-core`` → ``@puppeteer/browsers`` →
   ``extract-zip``. Its vulnerable range is ``*`` — **every version ever published**, 2.0.1 being
   the newest that exists — so there is no upgrade and nothing to wait for. ``@lhci/cli`` is
   already on its newest release (0.15.1) and ``>= 0.13.0`` is inside the flagged range, so
   upgrading cannot help either; npm's only ``fixAvailable`` is a **downgrade** to ``@lhci/cli``
   0.12.0, flagged ``isSemVerMajor``. An ``overrides`` entry has nothing non-vulnerable to point
   at. The production tree is unaffected and stayed at 0.

   That left three options: a permanently red Monday, dropping Lighthouse CI — which is the gate
   holding the frontend byte budgets, ``categories:accessibility`` at exactly 1.00 and
   ``third-party:size`` at 0 — or scoping this one advisory. Scoped, and deliberately **not**
   with ``continue-on-error``: that makes the whole dev audit non-blocking, so the next dev
   advisory, of the kind that *is* actionable, lands in a green run and nobody looks.

   :file:`tools/audit.sh` replaces ``npm audit --audit-level=high`` for the dev tree. It carries
   an explicit ``ACCEPTED`` list, each entry requiring a reason it cannot be fixed and what would
   close it, and it fails on **two** things: a high or critical advisory that is not listed, and a
   listed advisory that ``npm audit`` no longer reports. The second matters as much as the first —
   an exception list that outlives its advisories stops meaning anything, and this one will fail
   loudly the day upstream drops ``extract-zip``, which is when the line should be deleted.

   Confirmed able to fail, in four states — the fourth was found by running it rather than reading
   it:

   .. code-block:: text

      real tree, advisory accepted     exit 0   "1 high/critical advisory, all accepted"
      accepted list emptied            exit 1   names extract-zip and the advisory URL
      a listed advisory not reported   exit 1   "delete the entry"
      no lockfile at all               exit 2   "npm audit could not run: ENOLOCK"

   The last one originally reported a *stale exception* — it could not tell "npm found nothing"
   from "npm could not run", so the way a missing project surfaced was a confident instruction to
   delete a live exception line. ``npm audit`` reports its own failures as ``{"error": {...}}``,
   which the script now checks for before reading anything else.


Known incomplete
----------------

None of these are defects to fix here — they are things a deployment must supply.

Placeholders must be replaced
   ``change-me-*.example.com`` hosts, ``CALC_URL``, and — in the places overlay —
   ``CHANGE-ME-registry/…`` image names. Keep hosts lowercase: an Ingress host must be a
   valid RFC 1123 subdomain, and the API server rejects the whole apply otherwise.

The dynamic game's consequence rasters are not in the repository — **and this is reachable in production**
   :file:`v2/src/assets/data.json` names five consequence maps —
   ``Consequence_1_Clip.tif`` … ``Consequence_4_Clip.tif`` — and **none of those files exists**,
   in ``src`` or in a build. In dynamic mode with no calculator configured (``calcUrl: ""``,
   which is the default), submitting a round fetches all five, they all fail, the level never
   advances, and no consequence board renders.

   The container is honest about it: :file:`v2/nginx.conf` matches ``.tif`` with
   ``try_files $uri =404``, so a missing raster returns a real **404** — verified against the
   published image. The *test* server was not. :file:`v2/e2e/serve.mjs` fell back to
   ``index.html`` for everything, so the same request came back **200 ``text/html``** and
   geotiff.js died on ``Invalid byte order value`` having read ``<!`` as the byte order. That
   divergence is why the missing files went unnoticed; serve.mjs now 404s ``/assets/*`` like
   nginx does.

   A deployment with a real calculator is unaffected: the URLs in ``data.json`` are placeholders
   that ``prepareNextLevel`` overwrites with whatever the calculator returns. So this only bites
   the backend-less dynamic build — which is exactly what GitHub Pages serves.

   **Measured on the live site, not inferred.** ``/dynamic-game`` is reachable on Pages via the
   ``404.html`` SPA redirect, and the SVG board renders its 466 hexagons there. Placing hexagons
   and pressing *Next Level* on https://mlacayoemery.github.io/esgame/dynamic-game produced five
   ``404``\ s, a level that stayed at 1, and a spinner that never cleared. Any visitor could
   reach it.

   **Now refused rather than attempted.** The dynamic game's consequence maps come *from* the
   calculator — the ``urlToData`` in ``data.json`` are placeholders it overwrites — so with no
   ``calcUrl`` there is nothing to compute and nothing to fetch. ``goToNextLevel`` says so
   instead of going ahead: *"This game needs a calculation backend, and none is configured."*

   Confirmed **on the published site**, not just locally — the same round that produced five
   ``404``\ s and a stuck spinner an hour earlier now gives that message, **zero 404s and no
   spinner** on https://mlacayoemery.github.io/esgame/dynamic-game. The missing rasters are
   still missing; nothing now walks into them.

   That also removes the only reachable trigger for the spinner that would not clear (see
   below). The host-binding problem underneath it is still unfixed.

The committed base raster made the game inert — *fixed 2026-08-06*
   :file:`v2/src/assets/images/LU_and_NEW_hexa.tif` numbered its hexagons ``10``–``474``
   while the board (``New_hexagons.tif``) numbers its own ``100``–``46500`` in hundreds.
   **4 ids overlapped out of 465.** So ``reclassify`` was very nearly a no-op and the round
   returned the same five scores — ``42 / 45 / 48 / 50 / 44`` — for *any* allocation.
   Verified by POSTing three different land-use patterns and getting identical output.

   **A second defect, worse because it was not merely inert.** That raster reused
   ``1,2,4,5,6,7,8`` as *both* hexagon ids and land-use codes. ``reclassify`` matches on value,
   not on location, so allocating to hexagon 4 also rewrote every land-use-class-3 cell on the
   map — silently changing terrain the player never touched. Nothing would have surfaced that;
   the scores were constant anyway.

   **Both are fixed by deriving the raster from the two files it is named after.** Their non-NA
   masks are disjoint — 65,826 hexagon cells + 56,389 land-use cells = 122,215, exactly the
   combined count — so it is a mosaic and nothing had to be invented:

   .. code-block:: text

      hexagon cells    <- New_hexagons.tif       ids 100..46500, the board's own numbering
      remaining cells  <- New_Land_use_only.tif  land-use classes 2..8

   Both inputs were already committed here. :file:`tools/R/make-base-raster.R` does it, asserts
   every property it relies on (same grid, disjoint masks, ids survive, **no collision between
   board ids and land-use codes**), and refuses to write a file that fails any of them. Board ids
   start at 100 and land-use codes stop at 8, so the collision cannot recur.

   Measured, three different land-use patterns over the same 465 board ids:

   .. code-block:: text

      before   pattern 1  42 48 50 45 44     coverage 4/465
               pattern 2  42 48 50 45 44     identical
               pattern 3  42 48 50 45 44     identical
      after    pattern 1  49 73 50 53 48     coverage 465/465
               pattern 2  NaN                all-nature, see below
               pattern 3  43 63 46 48 44

   and in a browser against the live cluster: **465 of 465 ids used (100%)**, against 4 of 465
   before, with the low-coverage warning correctly not firing.

   .. note::

      **All-nature scores NaN, and a player cannot submit it.** ``lulc 60`` on every hexagon —
      zero agricultural area — returns NaN for all five indicators. It is reachable only by
      placing *nothing*, and ``svg-level.component.ts`` blocks submission below ``minSelected``
      (1% here, about 5 hexagons). Measured across the realistic range and all finite: 5 placed
      ``37 46 36 40 33``, 12 ``48 34 42 43 45``, 46 ``46 65 41 50 40``, 116 ``45 62 43 49 44``,
      232 ``46 65 47 46 45``. The inert raster had been hiding this too — every allocation
      returned the same constant, including that one. Why it happens is
      :ref:`below <why-the-scores-go-nan>`.

   **The synthetic allocation was hiding this, not merely failing to exercise it.**
   :file:`deploy/k8s/ingress-test.sh` builds its payload from ids it reads out of the
   *deployed raster*, so it matches by construction. Measured on one cluster, minutes apart:

   .. code-block:: text

      ingress-test.sh (ids taken from the raster)   455 of 455  (100%)
      a browser playing a round (real board ids)      4 of 465  (1%)

   Both runs were green, both returned five finite scores, and one of them was a game that
   ignored 99% of what the player did. They now read 465/465 and 465/465 — but note that
   ``ingress-test.sh`` reaching 100% still proves nothing on its own, because it would reach
   100% against any raster whatsoever. The browser's figure is the one that means something,
   and it is only trustworthy because it is derived independently. Neither number was surfaced anywhere until
   2026-07-31 — ``tools/R/coverage.R`` logged it and nothing read the log.

   Both now report it. ``ingress-test.sh`` fails if the reporter is not wired in at all —
   nothing else there would notice its removal — and says in the output that its own
   percentage is circular. :file:`v2/e2e-cluster` prints the honest figure, since the
   browser sends the ids the board actually uses.
   See :ref:`allocation-id-space`.

   **And the player is now told** (*2026-08-06*). Every reader of that number so far has been a
   test or a log. The person the round actually misleads — someone running a workshop, watching
   five finite scores that will be the same next round — had no way to know, short of reading the
   calculator's stdout. ``/esgame`` returns the numbers alongside ``results``:

   .. code-block:: text

      { "results": [ … ], "allocationCoverage": { "allocated": 465, "matched": 4, "fraction": 0.0086 } }

   and below 50% the game says so once per game, naming the figures rather than showing a generic
   failure: *"Only 1% of this round reached the model (4 of 465 areas)."* Once per game, not once
   per round — it is a deployment mismatch that cannot change between rounds, and a dialog that
   repeats is a dialog people learn to dismiss unread.

   ``results`` is unchanged and the new field is **optional**, so a calculator that does not send
   it (PLACES carries its own ``calculation.r``) is not treated as having ignored the round. That
   is asserted, not just intended — absent, malformed and high-coverage responses must all stay
   silent, and each has a spec.

   Measured on the live cluster, where the committed raster makes this real rather than contrived:

   .. code-block:: text

      calculator reported: 4 of 465 ids used (1%)
      warning shown to the player: yes

   Confirmed able to fail four ways: dropping the call, warning every round instead of once, and
   treating an absent field as zero coverage each fail exactly one unit spec; and pointing the
   browser spec at a phrase the app never says fails it with *"the player was not told the round
   had been ignored"*.

   .. note::

      The first version of that browser assertion **skipped silently.** It sat inside the block
      that reads the pod log via ``kubectl``, which degrades to a console note when ``kubectl`` is
      absent — as it was on the very run meant to prove the warning. It passed, printed
      ``(allocation coverage unavailable …)``, and asserted nothing. It now reads the response the
      browser itself received and needs nothing but the browser.

The calculation Ingress had a 60-second timeout — *fixed 2026-07-31*
   ingress-nginx defaults ``proxy_read_timeout`` and ``proxy_send_timeout`` to 60 seconds, and
   the base set neither. A round is a long-running computation, not a web request: one
   ``POST /esgame`` against real geodata takes 60-75 seconds, measured.

   What the client got was

   .. code-block:: text

      504 Gateway Time-out ... <center>nginx</center>

   while the calculator finished the round, published all six coverages to GeoServer and built
   every URL. The work was done and thrown away, and the calculation log showed a completely
   successful round — the failure was visible only to the client.

   Only a real ingress in front of a real round finds this. The compose stacks publish host
   ports with no proxy in the way, and esgame's own committed raster makes rounds fast enough
   (~26s) to stay under the default, so it was PLACES that hit it: 62-66s, 504 every time.
   With the annotations, the same round returns six real scores and 6/6 fetchable coverages.

Readiness probes — *added 2026-07-31*
   ``esgame-calculation`` and ``esgame-geoserver`` had none, so Kubernetes called a pod ready
   the instant its container started and the Service routed to it while plumber was still
   binding — about 12 seconds for the calculator, 30 for GeoServer.

   Measured on the live cluster, timing from ``kubectl rollout status`` returning to the first
   correct answer through the ingress:

   .. code-block:: text

      without a probe   8s   codes seen: 503, 502, 400
      with a probe      2s   codes seen: 503, 400

   The 502 is the one that matters: traffic reaching a pod that is not serving. The residual
   ~1s of 503 is ingress-nginx's own endpoint sync and no probe removes it, so this is a
   smaller claim than "the 503 window is gone".

   Both probe targets were chosen by measurement rather than by convention. The calculator
   answers 404 on ``/`` and 405 on ``/esgame`` (it is POST-only), so nothing there is a 2xx —
   hence ``tcpSocket``. GeoServer's ``/geoserver/web/`` looked right at 302, but a Kubernetes
   httpGet probe **follows** redirects and that one is relative (``Location: ./?0``) and loops:
   the first attempt failed with *"stopped after 10 redirects"* and timed the rollout out.
   ``/geoserver/index.html`` answers 200 directly.

Container security context — *added 2026-07-31*, extended *2026-08-05* and *2026-08-06*, still partial on purpose
   All three containers now set ``allowPrivilegeEscalation: false`` and
   ``seccompProfile: RuntimeDefault``. Verified on a live cluster: all three roll out, 18/18 in
   :file:`deploy/k8s/ingress-test.sh`, both browser rounds pass.

   **The calculation container now runs as uid 10001** (*2026-07-31*). It was the tractable one
   of the three: it listens on 8000, above the privileged range, so nothing needs
   ``CAP_NET_BIND_SERVICE``, and the only path it writes is ``/app/data`` — a mount, so its
   ownership comes from ``fsGroup`` rather than from the image. ``tools/R/Dockerfile`` adds the
   user; the Deployment asserts ``runAsNonRoot`` with ``runAsUser: 10001``, which is what the
   kubelet enforces at admission.

   Verified on both consumers, including the paths that would have failed silently: an esgame
   round and both browser specs; a PLACES round through its ingress with a **PVC** rather than
   an emptyDir; and PLACES' ``load-geodata`` init container on its **fetch** path — the first
   attempt took the "geodata already present" branch and never ran ``apk add curl``, which is
   the step that needs root. The init container has no ``securityContext`` of its own, so it
   still runs as root and that step still works.

   **The frontend now runs as uid 101** (*2026-08-05*), image and manifest.
   :file:`v2/Dockerfile` builds on ``nginxinc/nginx-unprivileged:alpine`` (the same nginx 1.31.3
   as ``nginx:alpine``, packaged for uid 101 with its pid and temp paths in :file:`/tmp`) and the
   server block listens on 8080, since a non-root process cannot bind a privileged port without
   ``CAP_NET_BIND_SERVICE``. Measured on the built image: ``id`` reports ``uid=101(nginx)``, no
   process in the container is root, it serves the app, a missing ``.tif`` still 404s and an
   unknown route still falls back to the app.

   The load-bearing part is not the port. The entrypoint rewrites ``assets/config.json``
   **in place** and now does so as uid 101, so the document root must be owned by that uid —
   ``COPY --chown=101:101`` in :file:`v2/Dockerfile`. **Confirmed by mutation**: a derived image
   with the tree chowned back to root exits 1 on start with
   ``mv: can't rename '/tmp/tmp.XXXXXX': Permission denied``.

   That failure is loud but **conditional** — the entrypoint only touches the file when
   ``CALC_URL`` is set, so a backend-less deployment (Pages, the static compose stack) would stay
   green while every deployment with a calculator broke. :file:`.github/workflows/image.yml` had
   been pushing this image without ever starting it, so nothing would have caught that. It now
   runs what it publishes and requires the app on 8080, ``uid == 101``, and a ``CALC_URL`` it can
   see injected into the served config.

   :file:`deploy/k8s/base` carries the port move — ``containerPort`` and the readiness probe to
   8080, the Service's ``targetPort`` to 8080 with ``port: 80`` left alone so no Ingress backend
   reference moved — and asserts ``runAsNonRoot: true`` with ``runAsUser: 101``. ``runAsNonRoot``
   is the half the kubelet enforces at admission: it refuses to start a pod whose image resolves
   to uid 0, so a base-image regression fails there rather than quietly restoring root.

   Measured against the **published** ghcr images through ``overlays/published``, which is what a
   real deployment and :file:`.github/workflows/manifests.yml` both use — not a locally built
   image: ``kubectl exec`` reports ``uid=101(nginx)``, 18/18 in
   :file:`deploy/k8s/ingress-test.sh` (``POST /esgame`` → 200 in 16s, five finite scores, 5/5
   coverages through the geoserver ingress), and both browser specs pass — 465 hexagons, 5
   coverages, two rounds in separate workspaces.

   .. note::

      **The image and the manifests could not land together, and this is why.** Both roll on
      ``:master``, so the new image does not exist until the image PR merges. Checked rather than
      assumed: the new manifests applied against the *then-published* image put the pod into
      ``CrashLoopBackOff`` — ``runAsUser: 101`` forces the old nginx to bind :80, and it fails
      with ``mv: can't rename '/tmp/tmp.MOAofi': Permission denied`` before that. Since
      :file:`.github/workflows/manifests.yml` deploys exactly that combination, one PR would have
      gone red. They shipped as two, in that order. Any deployment tracking ``:master`` sees the
      same ordering: pull the image, then apply the manifests.

   **``readOnlyRootFilesystem`` on the frontend and the calculation** (*2026-08-06*). Neither
   needed an image change — both are manifest-only, because every path either writes at run time
   is now a mount:

   .. code-block:: text

      esgame frontend       uid 101     readOnlyRootFilesystem   /tmp + /usr/share/nginx/html/assets
      esgame calculation    uid 10001   readOnlyRootFilesystem   /tmp + /app/data
      esgame-geoserver      uid 10001   (refused, see below)     built here, 2026-08-14

   The writable set was **measured, not guessed** — each image run with ``--read-only`` and the
   first thing it failed on read off the log, then the mount added and the run repeated:

   .. code-block:: text

      frontend, nothing writable   mktemp: : Read-only file system
      frontend, /tmp only          mv: can't remove '.../assets/config.json': Read-only file system
      frontend, /tmp + assets      serves, CALC_URL injected, .tif 200
      calculation, nothing         Fatal error: creating temporary file for '-e' failed   (exit 2)
      calculation, /tmp + /app/data  starts, plumber binds

   The frontend's second mount is the ``assets/config.json`` rewrite. An ``emptyDir`` starts
   **empty**, so an init container seeds it from the image — the same image, which is how a
   downstream overlay that bakes its own assets (PLACES does) keeps working without knowing this
   exists. It copies with ``cp -R`` rather than ``cp -a``, which tries to preserve ownership on a
   mount root uid 101 does not own and prints three "Operation not permitted" lines while
   succeeding.

   .. warning::

      **Do not test this with docker named volumes.** A docker volume auto-populates from the
      image when first mounted and empty; a Kubernetes ``emptyDir`` does not. Mounting one over
      the assets directory therefore *looks* like it needs no seeding at all — it served the app,
      the config and a real ``.tif`` — and the same manifest on a cluster would have served
      nothing. The init container exists because of the difference.

   That init container asserts ``[ -s /seed/config.json ]`` rather than trusting ``cp``'s exit
   status, and the guard was confirmed able to fail: copying from an empty directory returns 0,
   and the check then exits 1 naming the missing file. Without it a seed that copied nothing would
   surface as a 404 from a pod reporting healthy.

   Verified on the live cluster against the published images: both roll out, the root filesystem
   really is read-only (``touch`` → ``Read-only file system``), the init container reports
   ``seeded 54 asset file(s)``, 18/18 in :file:`deploy/k8s/ingress-test.sh` with a real round
   (200 in 16s, five finite scores, 5/5 coverages), and both browser specs pass.

   **GeoServer is refused on evidence, not caution.** Run with ``--read-only`` it does not fail —
   Tomcat binds and logs ``Server startup in 6409 ms`` — while:

   .. code-block:: text

      /opt/startup.sh: line 14: /usr/local/tomcat/conf/server.xml: Read-only file system
      /opt/startup.sh: line 44: .../conf/healthcheck_url.txt: Read-only file system
      sed: couldn't open temporary file /usr/local/tomcat/conf/sedpbEUk0: Read-only file system
      java.io.FileNotFoundException: /usr/local/tomcat/logs/catalina.<date>.log

   The startup script rewrites its own ``server.xml``, and a read-only root drops those edits
   silently. A server that starts having ignored its own configuration is worse than one that
   refuses to start. Making it work means seeding ``emptyDir``\ s over ``/usr/local/tomcat/conf``,
   ``/logs``, ``/work`` and ``/temp`` from the image — pinning the manifest to the internals of an
   upstream image whose next patch release can move them, with that same silent failure as the
   penalty. ``runAsNonRoot`` is out for the same upstream reason: it runs as uid 0.

   **A rootless GeoServer was looked for on 2026-08-06, and there is not one.** Two findings worth
   not re-deriving. First, forcing this image to a non-root uid does not fail — it **404s**. With
   ``--user 10001:0`` Tomcat logs ``Server startup in [28806] milliseconds`` while
   ``/geoserver/web`` returns 404, because the webapp never deployed:

   .. code-block:: text

      SEVERE [main] HostConfig.beforeStart Unable to create directory for deployment:
             [/usr/local/tomcat/conf/Catalina/localhost]
      java.lang.IllegalStateException: Cannot create logs
      /opt/startup.sh: line 14: /usr/local/tomcat/conf/server.xml: Permission denied

   So a ``runAsUser`` added here on the strength of the other two containers would give a
   container that logs a successful startup and serves nothing.

   **The readiness probe catches it, and that is worth stating because the first draft of this
   entry said the opposite.** The probe requests ``/geoserver/index.html``, which is part of the
   webapp that failed to deploy — measured at **404** on the same container — so the pod never
   becomes Ready and the rollout fails visibly rather than going green and empty. The probe added
   in #159 is doing real work here, on a failure mode it was not written for.

   Second, ``kartoza/geoserver`` is not an escape: forced non-root it exits 10 with ``groupadd:
   Permission denied``, because its entrypoint needs root. It at least fails loudly. 2.28.4 is the
   newest tag ``docker.osgeo.org`` publishes — 2.28.5 and 2.29.0 are not.

   **This breaks anything that maps a host port to container :80, and PLACES is one.** Its
   ``deploy/compose/docker-compose.places.yml`` publishes ``${PLACES_FRONTEND_PORT:-81}:80``
   against a thin image built ``FROM ghcr.io/mlacayoemery/esgame:master``, so the next publish of
   that rolling tag leaves it mapping a port nothing listens on. It needs ``:8080`` on that line
   and in ``test/smoke.sh``'s ``docker run``. Its k8s overlay needs nothing — it inherits this
   base, so the ``targetPort`` and probe move with it.

   That is a break by design rather than a surprise: PLACES added ``test/smoke.sh`` precisely to
   catch a change to the rolling esgame base, it runs the image and curls it, and it fails on
   exactly this. The guard works; the fix belongs in that repository.

The layout needed about 620px, and now stacks below it — *fixed 2026-08-06*
   Measured against the live cluster at four widths, on ``/dynamic-game``, **before the fix**:

   .. code-block:: text

      phone          390px viewport | content 619px | overflow 229px | 3/6 production buttons clipped | Next Level clipped
      small tablet   600px viewport | content 619px | overflow  19px | 0/6 clipped                    | Next Level visible
      iPad           768px viewport | content 768px | overflow   0px | 0/6 clipped                    | Next Level visible
      laptop        1024px viewport | content 1024px| overflow   0px | 0/6 clipped                    | Next Level visible

   Nothing is unreachable. ``tro-svg-level`` sets ``overflow: auto``, so on a phone the content
   scrolls horizontally and every control can be scrolled to — confirmed by clicking *Next
   Level* at 390px, which succeeds once the browser scrolls it into view. It is the document
   that does not scroll (``scrollWidth == clientWidth``), which is easy to mistake for the
   button being clipped away entirely; it is the component that scrolls, not the page.

   But a player on a phone had to discover that sideways scroll to advance a level, with three of
   the six production types off-screen until they did. That was recorded rather than redesigned
   because it was a product decision — this is a 466-hexagon board built for workshops — and
   making it reflow means choosing what the narrow layout should be, not adjusting a number.

   **The decision was taken on 2026-08-06: below 620px the panels stop being a row.** Production
   types, board, scores and *Next Level* in one column, with the side maps above and below. The
   board keeps its size and scrolls inside its own wrapper rather than taking the page with it.
   The wide layout is untouched — ``25% / 50% / 25%`` is what a projector or a tablet gets, and
   that is what the game was designed around.

   One thing was load-bearing and not obvious. ``.panel`` carries ``padding: 0 15px``, so with the
   default ``content-box`` a panel at ``width: 100%`` is 100% **plus 30px** — measured at 420px in
   a 390px viewport, which put *Next Level* past the right edge while every other control looked
   fine. ``box-sizing: border-box`` on the stacked panels is the fix.

   Asserted rather than re-measured by hand, at the same four widths plus the grid game:
   :file:`v2/e2e/narrow-layout.spec.ts`. Each width checks that the document does not scroll
   sideways, that **every** production type is fully on screen, and that *Next Level* is. A
   separate spec asserts the ``flex-direction`` itself in both directions — 1024px and 620px must
   still be a row, 390px a column — because "everything fits" alone would be satisfied by stacking
   at every width, quietly throwing the wide layout away.

   Confirmed by mutation: with the media query removed the suite fails with
   ``3 of 6 production types are off-screen at 390px`` and ``the narrow layout should be a
   column`` — reproducing the measurement in the table above exactly, at the width it was taken.

   .. note::

      The first run of that spec reported *"no production types rendered; this test would be
      checking nothing"* and the second measured a stale build. Both are the presence-first rule
      earning its keep: the spec waited on the board, which becomes visible a beat before the
      types populate, and ``npx playwright test`` does not rebuild — so an early measurement was
      of the previous ``dist``. Neither would have been visible as anything but a green run.

A scores sheet for domain review — *added 2026-08-06*
   Nothing in this repository can say the model is *right*. :file:`tools/R/golden-test.sh` freezes
   the current answers so a change is noticed, which is a different thing — it would freeze a
   wrong answer just as happily. Only someone who knows the ecology can judge the numbers, and
   asking that of them means handing over numbers, not an R prompt and a Docker daemon.

   :file:`tools/R/scores-sheet.sh` runs eight contrasting landscapes — each production type
   uniformly, plus two mixtures — and prints a markdown table.
   :file:`tools/R/scores-sheet.example.md` is a committed sample so it can be read without
   running anything.

   It carries its own notes rather than presenting bare numbers: that the rows **are** comparable
   with each other, because every indicator is normalised against the fixed bounds in
   :file:`tools/R/bounds.json`; that the published *rasters* are still on a per-round scale, which
   is a separate open question; and that ``all-nature`` scores **0** rather than ``NaN``. It ends
   with the questions the harness cannot answer — whether the indicators move independently, whether
   the direction is right, whether the spread is usable, and whether 0 is right for ``all-nature``.

   **Those notes were wrong for a week, which is worth recording.** The committed sample was
   generated 2026-08-06 and its caveats described round-relative scoring — true when written, false
   from 2026-08-07 when #194 moved scores onto fixed bounds. It told a reviewer that the rows were
   *not* comparable and that ``NaN`` was expected, both of which had stopped being true. The
   caveats live in the generator, so the sample inherited them; the fix is in
   :file:`tools/R/scores-sheet.sh`, and the provenance line is now stamped by the generator instead
   of being written by hand. **This is the artefact the model decision depends on**, so a stale
   caveat here is not cosmetic — it misdirects the one question nobody in this repository can answer.

   **Regenerated 2026-08-14, and the co-movement is now a number.** Across all eight landscapes the
   five indicators differ by **at most 3 points out of 100**, and are identical for two of them:

   .. code-block:: text

      landscape                    range    spread     source amplitude
      all-nature                   0-0        0        0
      mostly-nature-some-farms     8-10       2        mixed
      all-extensive-arable         9-11       2        10
      half-intensive-half-nature   25-28      3        mixed
      all-intensive-arable         32-34      2        40
      all-extensive-livestock      55-56      1        70
      all-intensive-livestock      77-78      1        100
      all-agropark                 100-100    0        130

   And for the six uniform landscapes the mean score tracks the **source amplitude alone** at
   Pearson *r* = **0.99966** — 0, 10, 34, 56, 78, 100 against amplitudes 0, 10, 40, 70, 100, 130.

   There is a mechanism, and it is not a defect on its face: all five indicators are means of the
   *same* agricultural concentration field, differing only in which receptor land-use class they
   average over. A uniform allocation makes that field broadly uniform, so every mask sees much the
   same mean. What it means for the game is the part needing a domain expert: on this base raster
   the five axes carry nearly the same information, so a player has little to trade off — and
   ``all-agropark`` scores exactly 100 everywhere because the ``hi`` bound was derived from it.
   Whether that is expected of a *tradeoff* game is precisely the question this sheet exists to put
   in front of someone qualified to answer it.

.. _what-blocks-scaling-the-calculation:

Adding calculation replicas breaks the spider plot — *measured 2026-08-06*
   :file:`perf/calc-load.js` established that one replica sustains about one concurrent player,
   which makes "add replicas" the obvious response. It does not work as the stack stands, and the
   way it fails is quiet: the round still returns 200 and five correct scores.

   Everything shared goes to GeoServer. The **spider plot does not** — ``calculator.r`` writes it
   into ``/app/data`` and hands back a URL pointing at plumber's own ``@assets`` mount:

   .. code-block:: r

      calculated_rasters[[i]]['url'] <- paste0(req$rook.url_scheme, "://", req$HTTP_HOST,
                                               "/images/", calculated_rasters[[i]]['name'])

   ``/app/data`` is an ``emptyDir``, so it is **per pod**. A round is computed by whichever pod
   the Service picked; the browser then fetches the plot through the same Service and has a
   1-in-N chance of reaching the pod that wrote it.

   Measured on the live cluster, scaling to two replicas and re-fetching one plot URL:

   .. code-block:: text

      1 replica,  6 fetches    6 x 200
      2 replicas, 12 fetches   11 x 200, 1 x 404   (connection reuse kept most on one pod)
      2 replicas, 30 fetches   16 x 200, 14 x 404  (Connection: close — the real ratio)

   and the mechanism confirmed directly rather than inferred from status codes:

   .. code-block:: text

      esgame-calculation-...-ttsfd   has the plot: yes   109 files in /app/data
      esgame-calculation-...-grq2b   has the plot: no      1 file  (just the init container's raster)

   Rounds themselves are fine on either pod — the init container gives each one the base raster,
   and the five coverages go to GeoServer, which is shared. The exposure is exactly the plot.

   **What a fix costs**, in rough order of cheapness:

   .. list-table::
      :header-rows: 1
      :widths: 30 70

      * - Option
        - Cost
      * - Return the plot inline
        - It is **11,992 bytes**; base64 in the JSON response is about 16 KB, and the frontend
          binds ``<img [src]="scoreImage">`` so a ``data:`` URI needs no frontend change at all.
          No shared storage, no affinity, nothing pod-local left. Changes the response contract,
          so PLACES' ``calculation.r`` would want the same treatment.
      * - Sticky sessions
        - ``nginx.ingress.kubernetes.io/affinity: cookie`` on the calculation Ingress pins a
          browser to a pod. One annotation, but it only holds while the cookie does, and it makes
          the load balancing it is meant to enable partly ineffective.
      * - Upload the plot to GeoServer
        - Architecturally consistent — everything else shared already goes there — but it is the
          largest change to ``calculator.r``, and a PNG is not a coverage.
      * - Shared ``ReadWriteMany`` volume
        - The heaviest. This cluster offers only ``standard`` (``rancher.io/local-path``), which
          is ReadWriteOnce, so it would mean adding an RWX provisioner as a dependency of running
          the game.

   **Closed 2026-08-07 by a fifth option none of those four is: stop producing the file.**

   The plot is a pure function of five numbers the response already carries, so there was never
   anything that had to be stored or served. ``SpiderChartComponent`` draws it as inline SVG;
   :file:`tools/R/calculator.r` no longer renders a PNG, no longer returns an ``id == -1``
   result, and no longer declares ``#* @assets /app/data /images`` — so the calculator has
   stopped publishing the contents of its own ``/app/data`` over HTTP at all.

   The table above is worth keeping for what it shows about how the question was framed. Every
   option in it takes "there is a file, and it must reach the browser" as given, and then argues
   about transport — inline it, pin the browser to a pod, put it in GeoServer, or add an RWX
   provisioner. **The cheapest of the four was still more machinery than deleting the file.**
   Returning it inline was the one that came closest, and it would have left R rendering a
   394×394 raster nobody needed.

   What it also bought, none of which was the point: the chart scales with the panel instead of
   being a fixed raster, its axis labels come from ``map_name_<id>`` and so are **translated**
   where the PNG's were baked in English, and it carries an ``aria-label`` naming every
   indicator and score where the PNG had no alt text.

   ``replicas`` is still 1 in the manifest, because nothing has re-measured the round throughput
   since; what changed is that raising it no longer serves 404s for a player's own chart.

.. _why-the-scores-go-nan:

Why the scores go NaN, and it is not only all-nature — *diagnosed 2026-08-06*
   All five indicators are normalised the same way (:file:`tools/R/calculator.r`):

   .. code-block:: r

      HH_norm <- (HH - cellStats(HH, min)) / (cellStats(HH, max) - cellStats(HH, min)) * 100

   Min-max, with no guard on the denominator. **Two different surfaces make it NaN**, and only
   one of them is the all-nature case:

   .. list-table::
      :header-rows: 1
      :widths: 26 74

      * - Surface
        - What happens
      * - **Empty** — every cell NA
        - ``cellStats(min)`` returns ``Inf`` and ``max`` returns ``-Inf`` (with a warning nobody
          reads), so the expression is ``(NA - Inf) / (-Inf - Inf)`` → NaN.
      * - **Degenerate** — all surviving cells equal, *including exactly one*
        - ``max - min`` is ``0``, so it divides by zero → NaN.

   Reproduced in isolation rather than inferred: a 100-cell raster masked to nothing gives
   ``min: Inf  max: -Inf`` and a mean of ``NaN``; a constant raster gives ``min: 7  max: 7`` and
   the same. The second row is the one worth knowing about — it needs no degenerate allocation at
   all, just a mask that happens to leave one cell.

   All-nature reaches the first row like this. Human health is built from five agricultural
   sources, each falling back to ``zero_raster`` when that land use is absent; with ``lulc 60``
   everywhere all five are absent, ``airconctot`` is zero, and ``HH[HH < 1] <- NA`` then masks
   **every** cell. There is nothing left to normalise.

   How much headroom normal play has, measured on the committed raster: ``HH`` is masked to
   land-use class 2, which is **21,105 cells**, pruned to those within about 921 m of agriculture
   (``100 * exp(-0.005 * d) >= 1``, i.e. ~9 cells at this 100 m resolution). So a real round is
   nowhere near either edge — which is why every realistic ratio above scores finite.

   **What an empty surface should score is a modelling decision, not a code fix, which is why
   nothing here changes it.** "No agriculture, therefore no agricultural pollution" plausibly
   argues for 0. But the normalisation is *relative within a single round* — it maps that round's
   own spread onto 0–100 — so there is no absolute scale for 0 to mean anything against, and a
   round of uniformly mild pollution and one of uniformly severe pollution can both average near
   50. That property is worth a domain expert's attention in its own right, separately from the
   NaN.

   **PLACES already normalises the other way, and that is the most useful thing found here.**
   Its ``calculation/calculation.r`` is the same model family — the repository that carries the
   real data release — and every indicator there is scaled against **fixed bounds** rather than
   against the round:

   .. code-block:: text

      esgame  tools/R/calculator.r        places  calculation/calculation.r
      ------------------------------      -------------------------------------------
      (HH - cellStats(HH,min))            (HH - 0) / (4.2 - 0) * 100
        / (cellStats(HH,max)              (NP - 0) / (180 - 0) * 100
           - cellStats(HH,min)) * 100     (water_leach_focal - 0) / (180 - 0) * 100
                                          (WA_vuln - 0) / (70 - 0) * 100
      ...and the same for NP, WA,         (round_tot_HC - optimalHC_score)
      HC and RV                             / (worstHC_score - optimalHC_score) * 100
                                          (1 - RV_round) * 100

   Two consequences follow directly, neither of which needs a domain opinion. **PLACES cannot
   produce this NaN at all** — every denominator is a constant, so neither the empty-surface nor
   the degenerate-surface case can divide by zero. And **PLACES' scores are comparable across
   rounds**, because the scale does not move with the data; esgame's are not.

   PLACES also scores **six** indicators to esgame's five, adding water leaching. Taken together
   that reads like esgame's ``calculator.r`` being the earlier vintage and PLACES' being where the
   model went — but that is an inference from the code, not something established here, and it is
   the one part of this worth confirming with whoever wrote them.

   It does change the shape of the question, though. "What should an empty surface score?" is no
   longer an open modelling problem with no reference: there is a sibling implementation in the
   same family that does not have the problem, and adopting its approach is a concrete option
   rather than an invention.

   **Closed 2026-08-07 — fixed bounds, derived here rather than copied.** The scores are now
   normalised against fixed per-indicator bounds in :file:`tools/R/bounds.json`, derived from
   the deployment's own base raster by :file:`tools/R/derive-bounds.R`. Two things were found on
   the way that change what the entry above says.

   **Fixed bounds alone do not fix the NaN, and this page implied they would.** With no
   agriculture allocated the field is zero everywhere, so every cell falls under the model's own
   ``X[X < 1] <- NA`` floor, the mask empties, and ``mean()`` of nothing is NaN — under *either*
   normalisation. Measured in the real model: ``cells_surviving_floor=0`` for all five. The
   division by ``(max - min) = 0`` was a second, independent failure on the same allocation.
   ``esgame_score()`` answers 0, because a landscape with no emission sources has zero exposure
   and that is known, not missing.

   **The old scoring was ranking backwards.** With a single uniform source type the field's
   *shape* is identical whatever the amplitude, so rescaling to the round's own range should
   return the same score. It did not:

   .. code-block:: text

      all ext_arable (amplitude 10)   ->  HH 49        the only difference is how many
      all agropark   (amplitude 130)  ->  HH 40        cells fall under the < 1 floor

   So the game ranked the most intensive agriculture as *better* for human health than the least
   intensive. Under fixed bounds the same two allocations score 1 and 9 — monotonic in
   amplitude, which is what the model's own coefficients say.

   **The bounds are on the mean, not on the cell**, and that was measured rather than assumed.
   Bounding the cell is analytically tidier — no cell can exceed ``sum(amplitudes) = 350``, and
   no receptor cell can exceed ``350 * exp(-0.005 * 100) = 212.3`` since a receptor is never
   itself a source — but the score is a mean over a mask that is mostly far from any source, so
   every candidate ceiling left the top of the scale unused:

   .. code-block:: text

      ceiling                     golden          all-arable    all-agropark
      350   sum of amplitudes     6/6/10/6/6      1/1/1/1/1     9/11/14/10/9
      212.3 receptor-reachable    10/10/17/10/10  1/1/2/1/1     15/18/24/16/15
      182   observed envelope     11/12/20/12/12  1/1/2/1/1     17/21/28/19/17
      aggregate (adopted)         65/60/72/66/68  0/0/0/0/0     100/100/100/100/100

   Bounding the aggregate spans 0-100 by construction, and is the shape PLACES' ``4.2 / 180 / 70``
   constants are in — which is what suggested it. The cost is that the bounds belong to a base
   raster: a deployment supplying its own geodata must re-run ``derive-bounds.R``, and the
   calculator **refuses to start** without a complete :file:`tools/R/bounds.json` rather than scoring
   against nothing.

   Everything above was measured three ways that agree: a standalone reimplementation of the
   concentration field in Python, the real R model run in
   ``ghcr.io/mlacayoemery/esgame-calculation:master``, and the committed golden file. The
   reimplementation reproduces the old golden scores exactly (14/14/20/16/14), which is what
   makes the rest of its output usable as evidence.

No default IngressClass is assumed
   The three Ingresses set no ``ingressClassName``. If the cluster has no default
   ``IngressClass`` they apply cleanly and route nothing, with no error. Check
   ``kubectl get ingressclass`` first.

The places geodata is not in its working tree
   places' ``calculation.r`` reads 13 files from ``/app/data``; its repository contains
   one, deliberately — the rest are a data release. That is now *handled* rather than
   merely true: ``scripts/fetch-geodata.sh`` caches them (from a tarball URL, or from
   places' own git history when no URL is set), the compose stack copies that cache into
   the calculation's writable volume, and ``deploy/k8s``'s ``load-geodata`` init
   container fetches the tarball from a ``places-geodata-source`` Secret. Both verify
   all 13 arrived and fail loudly otherwise. A deployment still has to supply the URL.


Open decisions
--------------

Not defects, not gaps in testing, and not things a deployment supplies: **questions that only a
person can answer**, written down so they stop being re-derived from a chat log. Each says what
is known, what it would cost to settle, and what happens if nobody does.

The rest of this page is about whether the code does what it claims. This section is about the
places where nobody has decided what it *should* claim.

Is the model right?
   Nothing in this repository can say so, and that is stated wherever a number appears.
   :file:`tools/R/golden-test.sh` is a **characterization** test: it catches a change and says
   nothing about correctness. The five scores it freezes were produced by the model, not checked
   against anything.

   **What exists to settle it.** :file:`tools/R/scores-sheet.sh` (2026-08-06) emits contrasting
   allocations — all-arable, all-livestock, mixed, agropark-heavy — as a readable table, so
   somebody who knows the ecology can judge it without touching R or Docker. Its three questions
   are the ones that matter: is the *direction* right (does the landscape you would expect to
   score worst actually score worst), is the *spread* usable, and what should an empty surface
   score.

   **Status: parked.** Nobody has reviewed it. That is a deliberate choice, not an oversight —
   the alternative is asserting a correctness nobody here can establish.

   **If nobody decides:** the golden test keeps catching drift, and the model keeps being
   *unvalidated rather than wrong*. Everything on this page stays true; none of it becomes a
   claim about ecology.

Should the published rasters move to the same fixed scale as the scores?
   *Introduced 2026-08-07 by the normalisation change; laid out 2026-08-14.* They are on
   **different scales, on purpose**:

   .. code-block:: text

      the raster   rescaled to the round's own min/max   "where, within this round?"
      the score    fixed per-indicator bounds            "how does this round compare?"

   **The question as posed cannot be answered yes.** The score's bounds bound the **mean** — HH
   is ``[0, 32.472]`` in :file:`tools/R/bounds.json`, an aggregate over a receptor mask. A raster
   is per-cell, and a cell's ceiling is a different quantity entirely: ``350`` (the sum of the
   amplitudes) or ``212.3`` (the most a receptor cell can receive). There is no scale that is
   simultaneously both, so "the same scale as the scores" is not on the menu; a *fixed* scale for
   the raster is, and it would be a third scale rather than a shared one.

   **What is actually on screen, and it is worse than "the colours look similar".**
   :file:`tools/R/calculator.r` stretches each published raster with
   ``(HH - cellStats(HH,min)) / (cellStats(HH,max) - cellStats(HH,min)) * 100``, so every round's
   map spans 0-100 by construction. The frontend then reads ``minValue: 0`` and ``maxValue: 100``
   from :file:`v2/src/assets/data.json` and uses them for **two** things — the colour ramp, and the
   numbers printed on the legend (:file:`v2/src/app/services/tiff.service.ts`, the ``isGradient``
   branch). So the legend reads ``0 … 100`` every round. That is true of the pixel values and
   misleading about the quantity: this round's 100 and last round's 100 are different absolute
   exposures, and nothing on screen says so.

   **What a fixed cell scale would cost, already measured.** From
   :file:`tools/R/derive-bounds.R`, scoring the same allocations against cell-level ceilings:

   .. code-block:: text

      ceiling                      golden          all-arable   all-agropark
      350   sum of amplitudes      6/6/10/6/6      1/1/1/1/1    9/11/14/10/9
      212.3 receptor-reachable     10/10/17/10/10  1/1/2/1/1    15/18/24/16/15
      182   observed envelope      11/12/20/12/12  1/1/2/1/1    17/21/28/19/17

   Every allocation lands in the bottom fifth. That was disqualifying for the scores and it is the
   same arithmetic for colour: most rounds would render near one end of the ramp, and the
   *within-round* structure the map exists to show would compress into a few steps. Trading
   "colours do not move between rounds" for "colours do not move within a round" is not obviously
   a gain.

   **Four options, and they are not all the same size:**

   .. code-block:: text

      A  leave it            two scales, two questions; the legend goes on saying 0-100
      B  fixed cell bounds   absolute across rounds; bottom-fifth ramp, measured above
      C  derived envelope    fixed AND usable: bound from observed allocations, not the
                             analytic maximum. derive-bounds.R would emit cell bounds
                             beside the mean bounds it already emits. Per base raster.
      D  fix the legend only the defect may be the label, not the scale. Return the
                             pre-stretch min/max per indicator per round and print those,
                             or label the ramp "low - high (this round)".

   **D is cheap and independent of the rest**, and worth separating out: whichever scale the raster
   ends up on, a legend that prints a fixed-looking ``0 … 100`` over a round-relative stretch is
   wrong on its own terms. A, B and C are the real question, and it is a question about what a
   player should be able to compare — which is a teaching decision, not a correctness one.

   **If nobody decides:** the split stays, and it is documented here and in
   :doc:`reference/calculator` rather than being folded knowledge.

How many calculation replicas should a workshop run?
   This stopped being a correctness question on 2026-08-07 and became a capacity one. The plot
   that broke under replicas is gone, so raising ``replicas`` is now safe — see
   :ref:`Adding calculation replicas breaks the spider plot
   <what-blocks-scaling-the-calculation>`, which is closed.

   **Re-measured 2026-08-14, and replicas do help.** Eight runs on a live cluster, all with
   ``calc_errors`` 0.00%. At a fixed offered load of ``VUS=4``:

   .. code-block:: text

      replicas   rounds done   median      max        throughput
      1          7, 8, 7       ~70s        87-117s    2.31-2.72/min
      2          11            41.2s       50.2s      4.71/min
      3          11            26.5s       63.6s      5.41/min

   Read the **median** and **rounds done** columns, not the throughput one: k6's
   ``iterations.rate`` divides by wall-clock including ramp-up and drain, and the drain is longer
   for the slower configurations, so it understates throughput and understates it *most* at one
   replica. The 1.9x it appears to show from 1→2 is therefore an overstatement of the ratio; the
   median falling **70s → 41s → 27s** at unchanged offered load is not, and neither is 7 rounds
   becoming 11.

   **The second replica is worth the most.** The third improves latency (41s → 27s) without
   completing more rounds.

   **That was attributed to GeoServer, and it is not GeoServer** — *tested 2026-08-14, the same
   day the guess was written down.* The suspicion was reasonable: one instance, ``cpu: "1"``, and
   every round publishes five coverages through it. Measured from cgroup v2 ``cpu.stat`` inside the
   pods, across a load run at three replicas, it is not close:

   .. code-block:: text

      offered load   GeoServer          each calculation pod (limit 2)    rounds
      VUS=4          0.11 cores of 1    0.65 / 0.73 / 0.71                 9
      VUS=8          0.07 cores of 1    0.52 / 0.93 / 0.40                14

   GeoServer never exceeded **11% of its single core**. Nothing else is saturated either — about
   1.9 to 2.1 cores of the 6 those three pods may use. There is no CPU limit being reached
   anywhere, so raising one would buy nothing.

   Two things the same measurement does show. **Doubling the offered load completed more rounds**
   (9 → 14), so there was headroom that the VUS=4 sweep could not reveal — which means the
   1 → 2 → 3 table measures what replicas do *at that offered load*, not their ceiling. And the
   per-pod CPU is **uneven**: 0.40 against 0.93 cores in the same run. That is the shape of
   clients being pinned to upstream pods by connection reuse rather than spread across them —
   the same effect already recorded for plot fetches under
   :ref:`Adding calculation replicas breaks the spider plot
   <what-blocks-scaling-the-calculation>`, where ``Connection: close`` changed a 11/12 result into
   16/30. If replicas scale less than linearly here, that is the candidate to test next, and it is
   a load-balancing question rather than a capacity one.

   **And one replica saturates at about two concurrent players.** Sweeping load against a single
   replica: ``VUS=1`` → 1.91/min at a 22.3s median, ``VUS=2`` → 2.89/min at 35.5s, ``VUS=4`` →
   ~2.5/min at ~70s. Past two, latency grows and throughput does not, which is the shape the old
   "one replica sustains about one concurrent player" note was pointing at — that claim was about
   *latency*, and it is throughput that decides how long a class waits.

   **Sizing, then, at roughly 3-5 rounds a minute for two to three replicas:** twenty students
   pressing *Next Level* together drain in about 4 minutes at two replicas and 3.5 at three,
   against 7 at one. Thirty students need about 6 minutes at three.

   **Two things that make these numbers conservative rather than optimistic.** The load test posts
   ``FIELDS=812`` by default and the browser posts **465** — the real board. Measured at 465,
   one replica does 2.89/min at a 59.7s median rather than 2.31-2.72 at ~70s, so a real round is
   10-25% cheaper than the ones in the table above. And this was a **single-node** kind cluster on
   a 12-core workstation with every pod sharing those cores; a multi-node deployment has more room
   than this could show.

   **Still open, and deliberately.** The manifest still says ``replicas: 1``, because choosing a
   number needs a class size — a fact about a workshop, not about this repository. What has changed
   is that the choice is now arithmetic rather than a guess.

GeoServer runs as uid 10001 — *closed 2026-08-14*
   All three containers are non-root now. This entry stays because the shape of the answer is
   worth keeping: it was refused with evidence for eight days, and then the refusal was overturned
   by a decision rather than by new evidence.

   **The refusal was sound and is still true.** No rootless GeoServer image exists at any version.
   Rechecked from docker.osgeo.org's registry config blobs on 2026-08-14: ``2.28.4`` and ``3.0.0``
   — newly published, and there is still no ``2.29`` — both declare ``User ""`` with the same
   ``ENTRYPOINT ["bash", "/opt/startup.sh"]``. Forcing ``--user`` makes the webapp never deploy, a
   **404 while Tomcat logs success**; kartoza's image exits 10 on ``groupadd``.

   **What changed is the appetite for owning it.** Seeding Tomcat paths as ``emptyDir``\ s in our
   own manifest had been declined — solve it upstream or not at all — and that was reconsidered.
   Tried first, and it gets further than expected: a Ready pod, 18/18 in
   :file:`deploy/k8s/ingress-test.sh`, both browser rounds green. It is still wrong, because the
   startup script also ``sed``\ s ``webapps/geoserver/WEB-INF/web.xml`` to apply ``CORS_ENABLED``
   and cannot, so GeoServer's own CORS preflight drops from **200** to **403** — invisible in the
   cluster, where ingress-nginx supplies the headers, and load-bearing in the compose stacks, where
   nothing does. Covering it needs a third seeded ``emptyDir`` over a 125 MB exploded webapp.

   So the fix is one ``chmod`` at build time: :file:`deploy/geoserver/Dockerfile`, on GeoServer
   **3.0.0**, over the three paths the startup script actually writes. ``logs``, ``work`` and
   ``temp`` are already ``drwxrwxrwt`` and are deliberately untouched. Cost 1.54 GB → 1.77 GB.

   Verified with the published image deployed: uid 10001, zero permission-denied lines, CORS
   preflight 200, ingress-test.sh 18/18, both browser rounds, and :file:`tools/R/golden-test.sh`
   unchanged — which is the check that matters for a version bump, since the calculator drives
   GeoServer's REST API every round.

   **One upgrade hazard, measured.** A docker named volume populates from the image on first use,
   ownership included, so an ``examples/esgame-dynamic`` stack with an existing ``geoserver-data``
   volume holds root-owned ``0755`` content that uid 10001 cannot write. GeoServer then starts and
   serves **404 with no permission error logged** — the cause appears only as
   ``GEOSERVER_DATA_DIR ... which is not writeable`` among the startup noise. Delete the volume, or
   ``chown -R 10001:0`` it; both are documented in that compose file and the chown was verified to
   recover an already-broken volume.

   ``readOnlyRootFilesystem`` is **still refused**, unchanged: the startup script rewrites its own
   ``server.xml`` on every boot, so the root filesystem has to be writable whoever owns it.


The checks were audited for vacuity
-----------------------------------

A check that cannot fail is worse than no check: it reports success and stops anyone
looking.

**2026-07-31, found by running a whole suite against a deleted deployment rather than one check
against a missing file.** Two more of this shape, one in each repository:

.. code-block:: text

   grep -qi '<app-root\|<title'   ingress-nginx's 404 page is
                                  "<html><head><title>404 Not Found</title>..." — the <title>
                                  alternative matched it, so with NOTHING serving the host the
                                  check reported the app was really being served
   [ -n "$res" ]                  with nothing serving, the POST returns 145 bytes of nginx 404
                                  HTML, which is very much "something"

Both now require what only the real thing produces: ``<app-root``, and a response that parses as
JSON with a non-empty results list. An earlier attempt at this test measured nothing — pointing
the namespace variable at an empty namespace redirects the ``kubectl`` checks but not the HTTP
ones, because ingress hosts are cluster-wide, so seven checks appeared to "pass on nothing"
while in fact passing on the still-running real deployment. Deleting it is the only version of
the test that means anything. On 2026-07-30 every check added that day was re-read for that shape — an
assertion that also holds when the thing being examined is absent — and **seven were
found, all written the same day**. Six in the first pass; the seventh turned up afterwards
in :file:`deploy/k8s/ingress-test.sh`, which the first pass had skipped because the inotify
limit on this host means it cannot be run — a reminder that "not run" and "not audited" are
easy to conflate:

.. list-table::
   :header-rows: 1
   :widths: 34 40 26

   * - Check
     - Why it could not fail
     - Covered by a sibling?
   * - GeoServer default password (places ``test/stack.sh``)
     - ``[ "$PASS" = geoserver ] || ...`` short-circuited, and the stack ran with the
       default password
     - no — it asserted nothing in every run
   * - coverage URLs are not in-network names (places)
     - ``! grep -q`` over an **empty** URL list inverts to true
     - yes, the ≥5 count check
   * - RFC 1123 hosts (places ``test/k8s.sh``)
     - the loop validates whatever it is given, including nothing
     - yes, the "exactly 3 places hosts" check
   * - GeoServer pin agreement (CI)
     - ``echo "" | wc -l`` is 1, so an empty match set looks like one agreed pin
     - no
   * - no run-time R package install (CI)
     - ``grep`` on a missing file exits non-zero, which reads as "clean"
     - no
   * - RFC 1123 hosts (CI)
     - same empty-loop shape, and nothing else asserted the Ingresses existed
     - **no**
   * - coverage URLs use an ingress host (``deploy/k8s/ingress-test.sh``)
     - same ``! grep -q`` over a possibly-empty list — found *after* this audit was
       written, in the one file the audit had skipped because it cannot be run here
     - **no**

None produced a false green — the ones with siblings were caught, and the others happened
to be examining files that were present. That is luck rather than design, and all six now
assert that the thing they examine exists and is non-empty before judging it.

The remaining checks were re-read and are sound: positive assertions where a failed
``curl`` yields no match, conjunctions that fail on an empty value, and ``.every()`` in the
specs guarded by a preceding length assertion.

**The lesson is specific, not general:** *"assert X is not present"* is satisfied by *"the
file is gone"*. Every absence-assertion needs a presence-assertion in front of it.

A second shape, found 2026-08-07 — *the check was sound and could not run*
   Every check above could run and might not fail. This one was the other way round: it was
   correct, it had a presence guard, and **its workflow's path filter kept it away from the
   change that breaks it**.

   "Every file the verification doc points at must exist" lived in :file:`.github/workflows/ci.yml`,
   which is filtered to ``paths: ['v2/**', ...]``. The file it validates is
   :file:`docs/verification-status.rst`. So a documentation-only pull request — the single most
   likely way to introduce a bad path — could not trigger it.

   #189 did exactly that. It added three references that do not resolve: ``cluster.yml`` and
   ``deploy.yml`` written bare instead of under ``.github/workflows/``, and
   ``.github/workflows/overlay.yml``, which is a file in the **places** repository, not this
   one. ``Docs`` passed, ``ci.yml`` never ran, and it merged. The failure then appeared on the
   next unrelated pull request that happened to touch ``v2/`` — attached to a change with
   nothing to do with it, which is the most expensive place for it to show up.

   The check now lives in :file:`.github/workflows/doc-paths.yml` with **no path filter**,
   because it can be broken from two directions and a filter only ever faces one: editing the
   document to name a missing path needs ``docs/**``, while renaming a file the document
   already names needs the whole tree. It is a checkout and a few milliseconds of
   :file:`docs/_checks/check-file-paths.py`, so there is nothing to trade against running it
   everywhere.

   **A path filter is an assertion about what can break a check**, and it is invisible in the
   check's own text. Reading `ci.yml`'s step told you nothing about the fact that it could not
   see the file it was reading.

   **Two more of the same shape, in the same workflow — found by re-auditing rather than by
   a failure** (*2026-08-07*). The first pass checked whether each *workflow's* filter matched
   what it validated, and cleared ``manifests.yml`` and ``docs.yml`` on that basis. That was
   the wrong granularity: a filter belongs to a workflow, but the claim belongs to a *step*, and
   ``ci.yml`` holds two steps that read this very page —

   .. code-block:: text

      The documented test count is current   compares "401 unit tests" against the suite
      The documented e2e count is current    compares "20 Playwright e2e" against the suite

   — while being filtered to ``v2/**``. Both are live: changing the claim to 384 and re-running
   the comparison by hand gives a mismatch. But neither could run on a documentation-only pull
   request, so **any number could have been written into that line and merged green.** Both
   directions matter and only one was covered: if the suite grows, ``v2/**`` fires and the claim
   is checked; if the claim is edited, nothing fired at all.

   The fix is the *opposite* of the doc-path one, and the difference is worth keeping straight.
   That check needed no build, so it left ``ci.yml`` for an unfiltered workflow. These need the
   suite's output, so the check cannot leave — the trigger comes to it instead, by adding
   :file:`docs/verification-status.rst` to ``ci.yml``'s filter. It costs about two minutes, and
   this page changes on most pull requests here, so in practice CI now runs on nearly all of
   them. That is the price of the claims being checked against a run rather than against
   nothing, and it is worth paying: a coverage number nobody re-derives is exactly the kind of
   evidence this page exists to stop trusting.

   The change was verified by simulating both filters against a list of paths — this page and
   ``v2/**`` trigger CI, other documents still do not — and **not** by the pull request that
   made it, which is worth recording because that was the first thing claimed and it was wrong.
   That pull request also edited ``ci.yml``, which the *old* filter already matched, so CI would
   have run on it either way. A change that carries its own trigger cannot demonstrate that
   trigger. The first real demonstration is the next documentation-only change to this page.

   **Widened to all of** :file:`docs` **the same day**, once it was clear the alternative to
   rewriting 131 references was to let the documents say where their paths resolve from. Each
   declares its own bases as an RST comment, which renders as nothing and sits next to the prose
   that establishes it::

      .. file-base: v2/src/app

   Three conventions are understood: repo-root paths (what this page uses), the
   parent-directory view several documents are written in (a leading ``esgame/`` is stripped),
   and section-local paths resolved against the declared bases. Coverage went from **40 of 299
   references in one file** to **299 in sixteen**, needing 33 declarations. Paths into places
   are counted and skipped — they cannot be checked from here, which is a real gap and is why
   they are reported rather than ignored.

   Widening it found four things, none of which any check had been in a position to notice:

   * :file:`examples/esgame-dynamic/geoserver/seed.py` was documented as ``seed.sh``. It *was*
     ``seed.sh`` — renamed in ``7f29c7f`` — so :doc:`reference/calculator` had been pointing at
     a file that stopped existing.
   * **Four references named build output**: ``v2/dist/tradeoff-v2`` and friends, which exist on
     any machine that has run a build and in no clone. They are now literals, not paths.
   * ``docs/ARCHITECTURE.md``, cited as the page this one supersedes, was deleted when it was
     superseded.
   * Five places files were written bare (``pvc.yaml``, ``patch-config.yaml``) in a section
     otherwise using the ``places/`` prefix, and one — ``deploy/compose/.env.places``
     — does not exist in places either, because it is what you create by copying the
     ``.example``.

   **Resolution goes through** ``git ls-files``\ **, not the filesystem**, and that is the part
   worth copying elsewhere. The first version asked whether a path existed on disk, which passed
   here and would have failed in CI: ``v2/dist`` is gitignored, so a developer who has built
   once gets a different answer from a clean checkout — and it hid all four build-output
   references on the first run. What the documentation may point at is what a reader who clones
   the repository will find, and that is exactly what git tracks. There is no fallback to the
   filesystem when git is unavailable, because that fallback fails in the passing direction.

   Confirmed able to fail, by mutation: a typo in a document that had never been checked, a
   removed ``.. file-base:`` declaration, a base naming a non-directory, a reference to
   untracked build output, a reference to a renamed file, and a tracked source file removed from
   the index — each exits 1 with an annotation. Two vacuity guards were checked the same way: a
   missing docs directory and a run outside a git checkout both fail rather than reporting
   success on nothing.

   One of those mutation tests was itself vacuous on the first attempt — it rewrote a string
   that :file:`docs/index.rst` does not contain, so it changed nothing and "passed". The runner
   now diffs the file and prints whether the mutation actually applied, which is the same lesson
   as the rest of this section applied to the tests rather than to the code.


Not verified
------------

Honest gaps, so nobody assumes otherwise.

Until 2026-08-06 this section held one entry, about Lighthouse timings — which is a caveat, not a
gap. Read beside a page this long, that implied nearly everything here is gated. It is not. The
strongest checks on this page are the ones **no workflow runs**, and re-deriving which is which
took ten minutes, so it is written down.

**What CI does not run** — established by grepping the workflows for each, not from memory:

.. list-table::
   :header-rows: 1
   :widths: 34 66

   * - Not gated
     - What that means
   * - :file:`v2/e2e-cluster`, :file:`deploy/k8s/ingress-test.sh`, :file:`deploy/k8s/kind.sh`
     - **Weekly since 2026-08-06**, not on pull requests — see
       :file:`.github/workflows/cluster.yml`. All three ran only by hand before that, which made
       the most convincing evidence on this page the least often executed.

       Scheduled rather than gating, on purpose. It stands up kind, installs ingress-nginx and
       pulls a 2.6 GB image; both images roll on ``:master``, so what it tests is master's images
       against master's manifests — a question about the deployed world, not about a diff. On a
       PR it would answer a question the PR did not ask, and a ten-minute flaky required check is
       a thing people learn to re-run until it passes. A red Monday run is a signal someone
       reads.

       So a change to :file:`deploy/k8s` still merges without this having run. That is the trade,
       stated rather than glossed. ``workflow_dispatch`` is there to run it on demand when a
       change ought to affect it.

       (:file:`deploy/k8s/render-test.sh` is separate and *is* run by ``manifests.yml`` on every
       relevant push.)

       **Its first run failed, which is why it was dispatched rather than assumed.**
       :file:`deploy/k8s/kind.sh` wired containerd at the local registry unconditionally, so
       ``up`` died with ``No such container: esgame-registry`` on a host that has none — after
       creating the cluster, so a retry hit "cluster already exists" and went straight back to the
       same line. The registry is only needed by ``overlays/local-registry``; that wiring is now
       skipped when the container is absent, which is what :file:`deploy/k8s/README.md` already
       claimed of the published path.
   * - ``tools/R`` behaviour
     - **Partly closed 2026-08-06.** :file:`tools/R/test-coverage.R` now runs in
       ``manifests.yml`` — 19 assertions over the coverage reporter, the one piece of R that
       distinguishes a round that was *scored* from one that was *ignored*. Base R and
       ``stopifnot``: no ``testthat``, no ``raster``, no GDAL, because ``coverage.R``'s arithmetic
       was split out of the raster read (``esgame_coverage_stats``) so it could run in a job that
       installs nothing beyond R. Confirmed able to fail by three mutations — dropping the
       ``unique()``, removing the empty-allocation guard, and reading the ``lulc`` column instead
       of ``id`` — each caught by the assertion written for it, with exit 1.

       **The model itself gets a characterization test** (*2026-08-06*), in the weekly cluster
       job — the only place anything runs it. :file:`tools/R/golden-test.sh` POSTs one fixed
       465-hexagon allocation and compares the five indicators against
       :file:`tools/R/golden/scores.json`:

       .. code-block:: text

          {"HC": 66, "HH": 65, "NP": 60, "RV": 68, "WA": 72}

       Re-recorded on **2026-08-07** when the normalisation changed; it read
       ``{"HC": 16, "HH": 14, "NP": 14, "RV": 14, "WA": 20}`` before. The test did its job: the
       change had to be justified and the new numbers measured, rather than the drift passing
       unnoticed.

       **It catches a change and says nothing about correctness.** Nobody has a reference answer
       for this model, which is why this shape was chosen over asserting a correctness that
       cannot be established. A failure means *find out why* — ``calculator.r``, the base raster,
       or the R packages underneath, since ``tools/R/Dockerfile`` builds on ``rstudio/plumber``
       untagged. Integer scores are what make it viable: numeric drift in ``raster``/``terra``
       does not move an integer that was not already on a boundary.

       The model was confirmed deterministic first — the same allocation POSTed twice returns
       identical scores — and the check refuses to record or compare a NaN, so a broken round
       cannot be frozen in as the expected answer. Confirmed able to fail: moving one recorded
       score by a point gives exit 1 and prints both sets.

       ``manifests.yml`` still only *parses* :file:`tools/R/calculator.r` on a push, so a wrong
       ``reclassify`` is caught weekly, not per-change.
   * - The compose stacks
     - ``docker compose config`` parses and schema-checks all four; none is ever **started** in
       CI. Every measurement of them on this page is by hand.
   * - :file:`perf/calc-load.js`
     - No workflow. It had no recorded measurement either until **2026-08-06**; it does now, and
       the answer is below.
   * - Whether the published site is current
     - **Daily since 2026-08-07**, not on pull requests — :file:`.github/workflows/published.yml`
       fetches ``build-info.json`` off the live site and fails if it is behind master. Scheduled
       for the same reason as the cluster job: the site legitimately lags a push by the length of
       a deploy, so gating on it would fail after every merge.

       So a merge still completes without anyone knowing whether it reached the site — which is
       exactly the state that let it fall twelve commits behind, undetected, on 2026-08-06. The
       difference is that the condition is now *discoverable within a day* instead of never. See
       `The published site was twelve commits behind master`_.

       What **is** gated per pull request is the producer: ``docs.yml`` fails if a build does not
       carry a stamp naming a real commit on every page.

None of this is an argument for gating all of it: a kind cluster with ingress-nginx and a 2.6 GB
calculation image is a slow, fragile CI job, and a flaky gate is worse than an honest gap. It is
an argument for knowing which green means which.

* **One calculation replica sustains about one concurrent player** (*measured 2026-08-06*).
  :file:`perf/calc-load.js` had never been run. Against the deployed backend, through the
  Service, a round takes **12.9-28.2s** and rounds **do not overlap** — R/Plumber serves
  single-threaded, so a second concurrent submission queues behind the first. At ``VUS=2`` the
  median request was 31.5s, roughly two rounds deep, against a 15.5s minimum.

  So a classroom of *N* students pressing *Next Level* together waits about *N* x 15s for the
  last of them: twenty students is five minutes. Size ``replicas`` from that, not from a latency
  target. This is the number :file:`deploy/k8s/README.md` needs and did not have.

  **The script could not have told anyone this, because it could not pass.** Its request timeout
  was 30s — shorter than one successful round — and its threshold ``p(95)<3000`` demanded 3s. The
  first run reported **57% errors**, all of them the client hanging up on work the server went on
  to finish. A load test whose own limits no run can satisfy measures its configuration and
  nothing else. Timeout, p95 and error rate are env-overridable now and default to values a real
  round can meet; at those defaults the same run is **0% errors, p95 35.4s**.

  Both runs created GeoServer workspaces (one per iteration, by design) and both were cleaned up:
  43 workspaces back to the 36 that were there before.

* **Timing numbers move.** Lighthouse timings swing with machine load — 57 to 90 for
  identical code on one host. Only the byte budgets are stable; compare timings A/B in
  one sitting or not at all.
