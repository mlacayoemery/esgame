Verification status
===================

What has actually been run, how, and what has not. Green CI proves the build and the test
suite; most of what follows is outside CI's reach and was exercised by hand.

Kept because the alternative is re-deriving it. Several paths here were broken for a long
time precisely because nothing had ever run them, and the failures were silent — a seeder
that logged ``done`` having registered nothing, an e2e suite passing against a board that
never rendered, a schema check reporting 10/10 valid on manifests the API server rejected.

Last updated: **2026-07-30**.

.. note::

   The counts below drift. "135 unit tests" sat here while the suite grew to 255, because it
   was written mid-session and never revisited — the same shape as the stale registry images
   recorded further down: a number that was true when written and is not re-derived when read.
   Re-measure before trusting one.


Verified working
----------------

.. list-table::
   :header-rows: 1
   :widths: 26 74

   * - Path
     - How it was checked
   * - Static / grid game
     - 255 unit tests, 11 Playwright e2e, Lighthouse a11y 100 / best-practices 100 /
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
   * - ``examples/esgame-dynamic`` (pygeoapi)
     - Same, via OGC API - Coverages: 8 collections advertised, 8/8 return GeoTIFFs, and
       the calculator emits only pygeoapi coverage URLs with no WCS anywhere — which is
       the evidence for the "true drop-in" claim.
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
       patches apply; the GeoServer pin flows through from this base. 20 checks in
       places' ``test/k8s.sh``, three of them confirmed able to fail by mutation.
   * - places local stack
     - The full compose stack up from a clean slate and a real round played through
       it: ``POST /esgame`` → 200 in 71s, six finite scores (HH 64, NP 34, WE 25,
       WA 25, HC 46, RV 47), six coverages fetched as GeoTIFFs **from outside the
       compose network**, spider plot served as a PNG. 21 checks in places'
       ``test/stack.sh``. That repo's geodata now loads for real in both paths —
       a loader service in compose, the ``load-geodata`` init container in k8s.
   * - Published GitHub Pages site
     - The canonical grid game, checked live rather than by a green workflow
       (2026-07-30, ``f391875``): <https://mlacayoemery.github.io/esgame/> renders
       **2,436 fields** from real GeoTIFFs with no page errors, ``assets/config.json``
       serves ``defaultMode: static`` / ``calcUrl: ""``, and the published docs resolve —
       including the links places' README points at.
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
       :file:`deploy/k8s/ingress-test.sh`, against a **cold** cluster built by
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
       it, so it no longer passes on that (16 checks, verified failing under the mutation
       and under an absent config).
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


Known incomplete
----------------

None of these are defects to fix here — they are things a deployment must supply.

``esgame-calculation`` is not published
   No workflow builds or pushes it, and the registry has no such image. The k8s base and
   the places overlay both reference it, so the calculation pod is ``ErrImagePull`` until
   someone builds :file:`tools/R` and pushes it. Documented in
   :file:`deploy/k8s/README.md` step 1.

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
   See :ref:`allocation-id-space`.

The loading spinner does not clear when a level fails to build
   ``prepareNextLevel`` now handles the error, clears the loading counter and tells the player
   (:file:`v2/src/app/services/game.service.ts`, ``failLevel``) — before, a failed raster fetch
   left the counter pushed, the level unchanged and nothing said at all. The **spinner itself
   still does not disappear.** ``LoadingIndicatorComponent``'s subscriber does receive the
   cleared value — verified in a browser, it runs with ``length 0`` — but its
   ``@HostBinding('class.show')`` never reaches the DOM: the error arrives from outside Angular's
   zone, and a host binding is evaluated by the *parent* view, not the component's own. Both
   ``cdRef.detectChanges()`` in the component and ``NgZone.run()`` in its subscriber were tried
   and neither updated it. Reachable today only in offline dynamic mode, which cannot finish a
   round anyway (see above); a deployment with a working calculator does not hit it unless a
   returned coverage URL fails.

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
looking. On 2026-07-30 every check added that day was re-read for that shape — an
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

* **Allocations were synthetic** — *closed 2026-07-31*. They were generated from the
  raster's id set rather than produced by a player: they satisfied the id-space contract
  (see :doc:`reference/calculator`) but were not real play. ``v2/e2e-cluster`` now closes
  this. See `A browser plays a round`_.
* **Timing numbers move.** Lighthouse timings swing with machine load — 57 to 90 for
  identical code on one host. Only the byte budgets are stable; compare timings A/B in
  one sitting or not at all.
