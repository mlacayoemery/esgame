GeoServer seeder and raster styling
===================================

The **dynamic** (SVG) mode of esgame renders per-service *consequence rasters* that
are served by `GeoServer <https://geoserver.org/>`_. The calculator returns a
`WCS GetCoverage <https://www.ogc.org/standards/wcs/>`_ URL for each consequence
map; the browser fetches the styled raster from GeoServer directly.

GeoServer itself ships with an empty catalog. A small, idempotent, **one-shot**
Python seeder registers the rasters as *external* coverages and installs one raster
style per colour palette. After the first run, GeoServer reloads everything from its
persistent data directory on boot, so the seeder never needs to run again.

This page is grounded in the example stack under
:file:`esgame/examples/esgame-dynamic/geoserver/`:

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - File
     - Role
   * - :file:`geoserver/seed.py`
     - One-shot seeder (Python stdlib only): workspace, external coverages, SLD styles, default-style assignment.
   * - :file:`geoserver/palettes.json`
     - Palette definitions and the coverage-to-style mapping the seeder consumes.
   * - :file:`geoserver/Dockerfile`
     - Builds the seeder image (``python:3.12-slim`` + :file:`seed.py`).
   * - :file:`geoserver/rasters/`
     - The eight ``*.tif`` consequence rasters, bind-mounted read-only into both GeoServer and the seeder.
   * - :file:`docker-compose.yml`
     - Defines the ``geoserver`` service (persistent data dir) and the ``geoserver-seed`` one-shot job.


Module overview
---------------

:file:`seed.py` is pure Python standard library (``base64``, ``json``, ``os``,
``time``, ``urllib.error``, ``urllib.request``) — no third-party dependencies. The
docstring summarises its contract:

    Idempotent. Registers each ``/rasters/*.tif`` as an EXTERNAL GeoTIFF coverage
    (GeoServer references the file in place and stores only the catalog config in
    its persistent data dir), then creates a raster style per palette from
    :file:`palettes.json` and sets it as the matching coverage's default style.

Module-level configuration (all overridable via environment):

.. list-table::
   :header-rows: 1
   :widths: 22 40 38

   * - Constant
     - Default
     - Source
   * - ``GS``
     - ``http://geoserver:8080/geoserver``
     - ``GEOSERVER_URL`` env var
   * - ``WS``
     - ``esgame``
     - hard-coded workspace name
   * - ``AUTH``
     - ``base64("admin:geoserver")``
     - HTTP Basic credentials (GeoServer defaults)
   * - ``RASTERS``
     - ``/rasters``
     - ``RASTERS_DIR`` env var
   * - ``PALETTES_FILE``
     - ``/palettes.json``
     - ``PALETTES_FILE`` env var

``AUTH`` is computed once as ``base64.b64encode(b"admin:geoserver").decode()`` and
sent as an ``Authorization: Basic`` header on every request.


Functions
---------

``gs(method, path, data=None, ctype=None)``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The single REST helper used by every other function. It builds a
``urllib.request.Request`` against ``GS + path`` with the given HTTP ``method``,
attaches the ``Authorization: Basic`` header, and (when ``ctype`` is given) a
``Content-Type`` header. The request is sent with a 30-second timeout.

It returns **only the HTTP status code** — ``r.status`` on success, or
``e.code`` when the response is an ``HTTPError``. No body is parsed; callers
branch on the status code alone. This means a 4xx/5xx never raises out of ``gs``.

``exists(path)``
~~~~~~~~~~~~~~~~

Returns ``gs("GET", path) == 200`` — a truthy check that a catalog resource is
already present. Used to make the whole seeder idempotent (skip work that the data
dir already holds).

``wait_for_geoserver()``
~~~~~~~~~~~~~~~~~~~~~~~~~~

Polls ``GET /rest/about/version.json`` up to **120** times, sleeping **2** seconds
between attempts (~4 minutes max), returning as soon as the endpoint answers
``200``. Exceptions during polling are swallowed so a not-yet-listening GeoServer
does not abort the loop.

``sld(name, colors, vmin, vmax)``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Builds an SLD 1.0.0 ``StyledLayerDescriptor`` XML string for a raster
``ColorMap``. Given ``n = len(colors)``, it emits one ``<ColorMapEntry>`` per
colour, evenly spacing the quantities across the value range:

.. code-block:: python

   f'<ColorMapEntry color="{c}" quantity="{vmin + (vmax - vmin) * i / (n - 1):.3f}"/>'

So for ``n`` colours, entry ``i`` sits at ``vmin + (vmax - vmin) * i / (n - 1)``,
formatted to three decimals — the first colour at ``vmin`` and the last at
``vmax``. The entries are wrapped in:

* ``<NamedLayer><Name>{name}</Name>`` / ``<UserStyle><Name>{name}</Name>``
* ``<FeatureTypeStyle><Rule><RasterSymbolizer>``
* ``<ColorMap type="ramp">`` — a continuous *ramp* (interpolated) colour map.

``main()``
~~~~~~~~~~

The orchestration entry point (invoked from ``if __name__ == "__main__":``). Its
steps, in order:

#. **Load palettes.** ``cfg = json.load(open(PALETTES_FILE))`` then read
   ``cfg["palettes"]``, ``cfg["coverageStyles"]``, and ``cfg.get("valueRange", {})``.
   The value range falls back to ``min = 0``, ``max = 125`` if absent.

#. **Wait for GeoServer** via ``wait_for_geoserver()``.

#. **Create the workspace** (only if missing). When
   ``/rest/workspaces/esgame.json`` does not exist:

   .. code-block:: text

      POST /rest/workspaces
      Content-Type: text/xml
      <workspace><name>esgame</name></workspace>

#. **Register external coverages.** For each ``*.tif`` in ``RASTERS`` (sorted),
   with ``name = fn[:-4]``, skip if
   ``/rest/workspaces/esgame/coveragestores/{name}.json`` already exists, otherwise:

   .. code-block:: text

      PUT /rest/workspaces/esgame/coveragestores/{name}/external.geotiff?coverageName={name}
      Content-Type: text/plain
      file:///rasters/{name}.tif

   The ``external.geotiff`` endpoint with a ``file://`` body tells GeoServer to
   reference the GeoTIFF **in place** rather than copy/upload it — only the catalog
   entry lands in the data dir. ``?coverageName={name}`` names the published
   coverage to match the store.

#. **Create or update styles.** For each *distinct* style name actually used
   (``sorted(set(coverage_styles.values()))``), build the SLD with
   ``sld(pname, p["colors"], vmin, vmax)`` and either update or create it:

   .. code-block:: text

      # if /rest/workspaces/esgame/styles/{pname}.json exists:
      PUT  /rest/workspaces/esgame/styles/{pname}
      # else:
      POST /rest/workspaces/esgame/styles?name={pname}
      Content-Type: application/vnd.ogc.sld+xml
      <StyledLayerDescriptor ...>

   Only palettes referenced by ``coverageStyles`` are materialised; unused palettes
   in :file:`palettes.json` are skipped.

#. **Assign default styles.** For each ``cov -> pal`` pair in ``coverageStyles``,
   set the layer's default style:

   .. code-block:: text

      PUT /rest/layers/esgame:{cov}
      Content-Type: text/xml
      <layer><defaultStyle><name>esgame:{pal}</name></defaultStyle></layer>

   so a WCS/WMS request without an explicit style picks up the right colour ramp.

Every step prints a ``[seed] ...`` line with ``flush=True`` (e.g.
``[seed] coverage ag_carbon``, ``[seed] style yellow``,
``[seed] ag_carbon -> default style yellow``), ending with ``[seed] done``.


REST endpoints used
-------------------

.. list-table::
   :header-rows: 1
   :widths: 10 52 38

   * - Method
     - Path
     - Purpose
   * - ``GET``
     - ``/rest/about/version.json``
     - Readiness probe (poll until ``200``).
   * - ``GET``
     - ``/rest/workspaces/esgame.json``
     - Does the workspace exist?
   * - ``POST``
     - ``/rest/workspaces``
     - Create the ``esgame`` workspace.
   * - ``GET``
     - ``/rest/workspaces/esgame/coveragestores/{name}.json``
     - Does the coverage store exist?
   * - ``PUT``
     - ``/rest/workspaces/esgame/coveragestores/{name}/external.geotiff?coverageName={name}``
     - Register an *external* GeoTIFF (``file://`` body).
   * - ``GET``
     - ``/rest/workspaces/esgame/styles/{pname}.json``
     - Does the style exist?
   * - ``POST``
     - ``/rest/workspaces/esgame/styles?name={pname}``
     - Create an SLD style.
   * - ``PUT``
     - ``/rest/workspaces/esgame/styles/{pname}``
     - Update an existing SLD style.
   * - ``PUT``
     - ``/rest/layers/esgame:{cov}``
     - Set a layer's default style.


palettes.json structure
------------------------

:file:`palettes.json` is the single source of colour configuration. Per its
``_comment``, the palettes are copied from the frontend's gradients
(``v2/src/app/shared/helpers/gradients.ts``); the seeder turns each into an SLD
``ColorMap`` and assigns it as the matching coverage's default style.

Top-level keys:

.. list-table::
   :header-rows: 1
   :widths: 22 78

   * - Key
     - Meaning
   * - ``valueRange``
     - ``{"min": 0, "max": 125}`` — the data range mapped across the colour ramp.
       Consumed as ``vmin``/``vmax`` by ``sld()`` to space the ColorMap quantities.
   * - ``palettes``
     - Map of palette name to a definition object (see below).
   * - ``coverageStyles``
     - Map of coverage name to the palette name used as its default style.

Each entry in ``palettes`` has:

.. list-table::
   :header-rows: 1
   :widths: 18 82

   * - Field
     - Meaning
   * - ``start``
     - Continuous gradient *start* stop (hex, no ``#``) — used by the SVG game's gradient, **not** by the seeder.
   * - ``end``
     - Continuous gradient *end* stop (hex, no ``#``) — likewise frontend-only.
   * - ``colors``
     - The discrete ramp (low → high, with ``#`` prefixes). This is the only field the seeder reads; it is passed to ``sld()`` to build the SLD ColorMap entries.

The six palettes each carry **6** colours, all beginning with the shared
``#d2b188`` low anchor:

.. list-table::
   :header-rows: 1
   :widths: 14 18 18 50

   * - Palette
     - ``start``
     - ``end``
     - ``colors`` (low → high)
   * - ``blue``
     - ``eff3ff``
     - ``08519c``
     - ``#d2b188 #eff3ff #bdd7e7 #6baed6 #3182bd #08519c``
   * - ``green``
     - ``edf8e9``
     - ``006d2c``
     - ``#d2b188 #edf8e9 #bae4b3 #74c476 #31a354 #006d2c``
   * - ``orange``
     - ``feedde``
     - ``a63603``
     - ``#d2b188 #feedde #fdbe85 #fd8d3c #e6550d #a63603``
   * - ``purple``
     - ``f2f0f7``
     - ``54278f``
     - ``#d2b188 #f2f0f7 #cbc9e2 #9e9ac8 #756bb1 #54278f``
   * - ``red``
     - ``ffc0c0``
     - ``c90000``
     - ``#d2b188 #fee5d9 #fcae91 #fb6a4a #de2d26 #a50f15``
   * - ``yellow``
     - ``F8F27D``
     - ``670B0D``
     - ``#d2b188 #F8F27D #F7D068 #F6A825 #AE5322 #670B0D``

The ``coverageStyles`` map drives which palette each coverage gets. It pairs the two
land-use types (``ag_*``, ``ranch_*``) against four ecosystem services:

.. list-table::
   :header-rows: 1
   :widths: 30 30 40

   * - Service
     - ag coverage → palette
     - ranch coverage → palette
   * - carbon
     - ``ag_carbon`` → ``yellow``
     - ``ranch_carbon`` → ``yellow``
   * - habitat
     - ``ag_habitat`` → ``purple``
     - ``ranch_habitat`` → ``purple``
   * - water
     - ``ag_water`` → ``blue``
     - ``ranch_water`` → ``blue``
   * - hunt
     - ``ag_hunt`` → ``red``
     - ``ranch_hunt`` → ``red``

These eight coverage names correspond one-to-one with the eight files in
:file:`geoserver/rasters/` (``ag_carbon.tif`` … ``ranch_water.tif``). Note the
``orange`` and ``green`` palettes are defined but unused by ``coverageStyles``, so
``main()`` never materialises styles for them.


Decoupled seeding: one-shot job + persistent volume
----------------------------------------------------

Seeding is deliberately separated from serving, so the heavy GeoServer container is
never coupled to the registration logic, and registration runs exactly once.

**The seeder image** (``geoserver/Dockerfile``) is minimal:

.. code-block:: dockerfile

   FROM python:3.12-slim
   COPY seed.py /seed.py
   ENTRYPOINT ["python3", "/seed.py"]

**The compose wiring** (``docker-compose.yml``) gives GeoServer a *named volume*
for its catalog and the rasters as a *read-only bind mount*:

.. code-block:: yaml

   volumes:
     geoserver-data:   # persistent GeoServer data dir (catalog/sidecar config) - survives reboot

   services:
     geoserver:
       image: docker.osgeo.org/geoserver:2.28.4
       environment:
         CORS_ENABLED: "true"
       ports:
         - "8080:8080"
       volumes:
         - geoserver-data:/opt/geoserver_data    # persistent catalog, reloaded on every boot
         - ./geoserver/rasters:/rasters:ro        # TIFFs referenced in place by external coverages

     geoserver-seed:
       build: ./geoserver
       environment:
         GEOSERVER_URL: http://geoserver:8080/geoserver
       volumes:
         - ./geoserver/rasters:/rasters:ro
         - ./geoserver/palettes.json:/palettes.json:ro
       depends_on: [geoserver]
       restart: "no"

Why this survives a reboot:

* **External coverages** mean GeoServer stores only catalog config (XML sidecars)
  in ``geoserver-data`` — it references each GeoTIFF in place at ``/rasters/*.tif``
  rather than ingesting a copy. The styles and default-style assignments likewise
  live in the data dir.
* **The named volume** ``geoserver-data`` (mounted at ``/opt/geoserver_data``)
  persists across container restarts and host reboots. On every boot GeoServer
  reloads the full catalog from it — no re-seeding needed.
* **The one-shot job** ``geoserver-seed`` runs ``python3 /seed.py`` and exits;
  ``restart: "no"`` keeps it from rerunning. Because each step is guarded by an
  ``exists(...)`` check (workspace, store, style), a second run would be a no-op —
  the seeder is idempotent. Both the rasters and ``palettes.json`` are mounted
  read-only into the seeder so it has the same files GeoServer references.

The rasters bind mount is the same source path (``./geoserver/rasters``) on both
services, so the ``file:///rasters/{name}.tif`` URLs the seeder writes resolve
identically inside the GeoServer container.


WCS GetCoverage access pattern
------------------------------

The frontend does not talk to GeoServer's REST API at runtime — only the seeder
does. At play time the example **calculator** (``calculator/app.py``) returns, per
consequence-map id, a browser-facing WCS ``GetCoverage`` URL that the SVG frontend
fetches directly from GeoServer.

The calculator builds each URL against ``GEOSERVER_PUBLIC_URL`` (the browser-facing
base, ``http://localhost:8080/geoserver`` in the compose env) and ``WORKSPACE =
"esgame"``:

.. code-block:: python

   url = (f"{GEOSERVER_PUBLIC_URL}/wcs?service=WCS&version=2.0.1&request=GetCoverage"
          f"&coverageId={WORKSPACE}__{coverage}&format=image/tiff")

So a fully-formed request looks like:

.. code-block:: text

   GET http://localhost:8080/geoserver/wcs
       ?service=WCS
       &version=2.0.1
       &request=GetCoverage
       &coverageId=esgame__ag_carbon
       &format=image/tiff

Key points:

* **Protocol/version:** OGC WCS ``2.0.1``, operation ``GetCoverage``, output
  ``format=image/tiff``.
* **Coverage identifier:** ``coverageId`` joins workspace and coverage with a
  **double underscore** (``esgame__ag_carbon``) — the WCS 2.0 layer-id form — which
  differs from the colon form (``esgame:ag_carbon``) the REST seeder uses on
  ``/rest/layers/...``.
* **Styling:** no ``styles`` parameter is sent; GeoServer applies the **default
  style** the seeder assigned to that coverage's layer, so the returned raster
  already carries the correct palette.
* **CORS:** GeoServer is started with ``CORS_ENABLED: "true"`` so the browser can
  fetch the coverage cross-origin, and the calculator's FastAPI app enables
  permissive CORS on its own responses.

The consequence-map ids and their coverages are fixed in the calculator's
``CONSEQUENCES`` map (e.g. ``"110" -> ag_carbon``, ``"123" -> ranch_hunt``), the
same eight coverage names the seeder registers and ``coverageStyles`` colours.
