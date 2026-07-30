Verification status
===================

What has actually been run, how, and what has not. Green CI proves the build and the test
suite; most of what follows is outside CI's reach and was exercised by hand.

Kept because the alternative is re-deriving it. Several paths here were broken for a long
time precisely because nothing had ever run them, and the failures were silent — a seeder
that logged ``done`` having registered nothing, an e2e suite passing against a board that
never rendered, a schema check reporting 10/10 valid on manifests the API server rejected.

Last updated: **2026-07-30**.


Verified working
----------------

.. list-table::
   :header-rows: 1
   :widths: 26 74

   * - Path
     - How it was checked
   * - Static / grid game
     - 124 unit tests, 7 Playwright e2e, Lighthouse a11y 100 / best-practices 100 /
       SEO 100. The board renders 2,436 fields; the e2e suite asserts that rather than
       just asserting the component mounted.
   * - No external runtime deps
     - Every route loaded with all non-localhost origins blocked: no request is even
       attempted. Enforced by ``resource-summary:third-party:size <= 0``.
   * - Published container image
     - ``ghcr.io/mlacayoemery/esgame:master`` pulled and run. Byte-identical to a local
       production build (same filenames, same md5 sums), and renders with the network
       blocked.
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
       patches apply; the GeoServer pin flows through from this base. 19 checks in
       places' ``test/k8s.sh``, three of them confirmed able to fail by mutation.
   * - places local stack
     - The full compose stack up from a clean slate and a real round played through
       it: ``POST /esgame`` → 200 in 71s, six finite scores (HH 64, NP 34, WE 25,
       WA 25, HC 46, RV 47), six coverages fetched as GeoTIFFs **from outside the
       compose network**, spider plot served as a PNG. 21 checks in places'
       ``test/stack.sh``. That repo's geodata now loads for real in both paths —
       a loader service in compose, the ``load-geodata`` init container in k8s.
   * - Browser-facing GeoServer URL
     - The R calculators built their WCS URLs from ``GEOSERVER`` — the in-cluster
       Service name — so the browser got URLs it could not resolve while everything
       returned 200. Split into ``GEOSERVER_PUBLIC_URL``; measured 6/6 coverages
       fetchable from outside the network in the places stack. Gated in CI, with all
       four failure modes checked by mutation.


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


Not verified
------------

Honest gaps, so nobody assumes otherwise.

* **No cluster ingress traffic.** Everything k8s was reached by ``port-forward``. No
  request has gone through an actual ingress controller with a real host and TLS. So
  ``GEOSERVER_PUBLIC_URL`` was proved end to end in *compose* (6/6 coverages fetched from
  outside the network) and only statically in k8s — rendered, wired, and gated in CI, but
  no browser has followed one of those URLs through a real geoserver ingress.
* **``tools/R`` was not re-run after the URL split.** The change is the same one verified
  in places' ``calculation.r``, and it defaults to the previous single-address behaviour,
  but esgame's own image has not played a round with ``GEOSERVER_PUBLIC_URL`` set.
* **No multi-round game.** Each round-trip was a single ``POST /esgame``. Level
  progression, score accumulation across rounds, and the frontend consuming the returned
  coverage URLs back into the board were not exercised together.
* **Allocations were synthetic.** Generated from the raster's id set, not produced by a
  player. They satisfy the id-space contract (see :doc:`reference/calculator`) but are
  not real play.
* **No cluster ingress traffic yet, and now for a concrete reason.** The tooling is in
  place — :file:`deploy/k8s/kind.sh` builds a cluster wired to the local registry and
  installs ingress-nginx, and :file:`deploy/k8s/ingress-test.sh` drives a round through
  it by ``Host`` header. It has not been *run* green: this host's
  ``fs.inotify.max_user_instances`` is 128 where kind needs 512, which crash-loops
  ``kube-proxy`` and cascades into an ingress controller that never gets its certificate.
  Raising it needs root. ``kind.sh up`` now checks and says so up front.
* **Timing numbers move.** Lighthouse timings swing with machine load — 57 to 90 for
  identical code on one host. Only the byte budgets are stable; compare timings A/B in
  one sitting or not at all.
