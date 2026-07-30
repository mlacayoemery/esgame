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
     - A real round: 465-hexagon allocation POSTed to ``/esgame`` → HTTP 200 in 15s,
       five real scores, workspace created in GeoServer, five coverages published, WCS
       5/5 GeoTIFFs, spider plot served. Also starts with ``--network none``.
   * - places overlay
     - Renders 11 resources, all valid under ``kubeconform -strict``; ingress-host
       patches apply; the GeoServer pin flows through from this base. Its calculation
       completes a round: 200, six indicators, six coverages, WCS 6/6.


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

No default IngressClass is assumed
   The three Ingresses set no ``ingressClassName``. If the cluster has no default
   ``IngressClass`` they apply cleanly and route nothing, with no error. Check
   ``kubectl get ingressclass`` first.

The places geodata is not in its working tree
   places' ``calculation.r`` reads 13 files from ``/app/data``; its repository contains
   one. The other twelve were deleted from ``kubernetes_deployment/assets`` by commit
   ``310fd46`` and exist only in git history, while ``deploy/k8s``'s ``load-geodata``
   init container is still an ``echo 'TODO: fetch places geodata'``. Nothing in the tree
   provides them at deploy time.


Not verified
------------

Honest gaps, so nobody assumes otherwise.

* **No cluster ingress traffic.** Everything k8s was reached by ``port-forward``. No
  request has gone through an actual ingress controller with a real host and TLS.
* **No multi-round game.** Each round-trip was a single ``POST /esgame``. Level
  progression, score accumulation across rounds, and the frontend consuming the returned
  coverage URLs back into the board were not exercised together.
* **Allocations were synthetic.** Generated from the raster's id set, not produced by a
  player. They satisfy the id-space contract (see :doc:`reference/calculator`) but are
  not real play.
* **Timing numbers move.** Lighthouse timings swing with machine load — 57 to 90 for
  identical code on one host. Only the byte budgets are stable; compare timings A/B in
  one sitting or not at all.
