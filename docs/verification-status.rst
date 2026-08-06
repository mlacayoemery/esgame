Verification status
===================

What has actually been run, how, and what has not. Green CI proves the build and the test
suite; most of what follows is outside CI's reach and was exercised by hand.

Kept because the alternative is re-deriving it. Several paths here were broken for a long
time precisely because nothing had ever run them, and the failures were silent — a seeder
that logged ``done`` having registered nothing, an e2e suite passing against a board that
never rendered, a schema check reporting 10/10 valid on manifests the API server rejected.

Last updated: **2026-08-06**.

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
     - 385 unit tests, 18 Playwright e2e, Lighthouse a11y 100 / best-practices 100 /
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

The committed base raster makes the game inert
   :file:`v2/src/assets/images/LU_and_NEW_hexa.tif` numbers its hexagons ``10``–``474``
   while the board (``New_hexagons.tif``) numbers its own ``100``–``46500`` in hundreds.
   **4 ids overlap out of 465.** So ``reclassify`` is very nearly a no-op and the round
   returns the same five scores — ``42 / 45 / 48 / 50 / 44`` — for *any* allocation.
   Verified by POSTing three different land-use patterns and getting identical output;
   the release copy of the raster gives three different answers to the same three.

   Nothing is broken in the code: a deployment is supposed to supply the real geodata,
   and the release copy shares the board's id space. But the committed asset is only good
   for exercising the plumbing, and a green round against it says nothing about the model.

   **The synthetic allocation was hiding this, not merely failing to exercise it.**
   :file:`deploy/k8s/ingress-test.sh` builds its payload from ids it reads out of the
   *deployed raster*, so it matches by construction. Measured on one cluster, minutes apart:

   .. code-block:: text

      ingress-test.sh (ids taken from the raster)   455 of 455  (100%)
      a browser playing a round (real board ids)      4 of 465  (1%)

   Both runs are green, both return five finite scores, and one of them is a game that
   ignored 99% of what the player did. Neither number was surfaced anywhere until
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
      geoserver 2.28.4      uid 0       (refused, see below)     upstream

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
   * - :file:`v2/e2e-cluster`
     - No workflow references it. The browser round against a real cluster, the two-round
       workspace isolation, and the low-coverage warning shown to the player run **only when
       someone runs them by hand**. They are the most convincing evidence on this page and the
       least often executed.
   * - :file:`deploy/k8s/ingress-test.sh`
     - Same — 18 checks, no workflow. :file:`.github/workflows/manifests.yml` does stand up a
       kind cluster, but without ingress-nginx or the calculation image, so it applies manifests
       and checks the config substitution; it never drives a round through an Ingress.
   * - :file:`deploy/k8s/kind.sh`
     - Never referenced either. The cold-start path the README documents is a by-hand claim.
       (:file:`deploy/k8s/render-test.sh` *is* run by ``manifests.yml``.)
   * - ``tools/R`` behaviour
     - There is no test directory and no ``testthat``. ``manifests.yml`` **parses**
       :file:`tools/R/calculator.r` and :file:`tools/R/coverage.R` and nothing more, so a wrong
       ``reclassify``, a wrong score or a wrong coverage URL is not something CI can catch. The
       model is exercised only by the by-hand cluster runs — and, per "the committed base raster"
       above, those run against data that makes the round nearly inert.
   * - The compose stacks
     - ``docker compose config`` parses and schema-checks all four; none is ever **started** in
       CI. Every measurement of them on this page is by hand.
   * - :file:`perf/calc-load.js`
     - No workflow, and no measurement anywhere in this document. So the question it exists to
       answer — how many concurrent players one calculation replica sustains, which is what
       sizing a workshop deployment needs — has no recorded answer.

None of this is an argument for gating all of it: a kind cluster with ingress-nginx and a 2.6 GB
calculation image is a slow, fragile CI job, and a flaky gate is worse than an honest gap. It is
an argument for knowing which green means which.

* **Timing numbers move.** Lighthouse timings swing with machine load — 57 to 90 for
  identical code on one host. Only the byte budgets are stable; compare timings A/B in
  one sitting or not at all.
