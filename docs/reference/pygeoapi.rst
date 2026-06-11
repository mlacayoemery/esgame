pygeoapi: a lightweight, read-only GeoServer alternative
========================================================

The ``esgame-dynamic`` example ships an **alternative raster backend** that replaces GeoServer (and
its one-shot seeder and persistent data volume) with a single small `pygeoapi
<https://github.com/geopython/pygeoapi>`_ container. It is a **drop-in** replacement for the
read-only path the game uses, with one important constraint — it serves **read-only data only**.

Files: :file:`examples/esgame-dynamic/pygeoapi/Dockerfile`,
:file:`examples/esgame-dynamic/pygeoapi/pygeoapi-config.yml`, and
:file:`examples/esgame-dynamic/docker-compose.pygeoapi.yml`.

.. warning::

   **Read-only data only.** pygeoapi publishes its collections from a **static config file**; there
   is no run-time publish/REST API as GeoServer has. The example's consequence rasters never change,
   so this is fine here — but a deployment that must **add, replace, or mutate rasters at run time**
   (as GeoServer's REST API and the :doc:`seeder <geoserver>` allow) cannot use this variant. To add
   or change a raster with pygeoapi you edit :file:`pygeoapi-config.yml` and restart the container.


Why it is a drop-in
-------------------

The frontend only ever fetches *a raster URL the calculator hands it* (see :doc:`/data-flow`) and
decodes the returned GeoTIFF client-side — it does not care which server produced it. So swapping
GeoServer for pygeoapi requires no frontend change at all. Two things differ between the stacks:

#. the **calculator** emits a pygeoapi coverage URL instead of a WCS URL (one env var), and
#. the **backend container** is pygeoapi instead of GeoServer.

The frontend bundle and the calculator *image* are byte-for-byte identical across the two stacks.

.. list-table:: The same raster, two URL forms
   :header-rows: 1
   :widths: 18 41 41

   * -
     - GeoServer (WCS)
     - pygeoapi (OGC API - Coverages)
   * - URL
       (``{coverage}`` = e.g. ``ag_carbon``)
     - ``/geoserver/wcs?service=WCS&version=2.0.1&request=GetCoverage&coverageId=esgame__{coverage}&format=image/tiff``
     - ``/collections/{coverage}/coverage?f=GTiff``
   * - Returns
     - the consequence GeoTIFF (``image/tiff``)
     - the **same** consequence GeoTIFF (``application/x-geotiff``)
   * - Publishing
     - REST API + one-shot seeder, persistent catalog
     - static config, regenerated at start (read-only)


The ``RASTER_URL_TEMPLATE`` mechanism
-------------------------------------

The example calculator (:doc:`calculator`) builds each raster URL from a single template env var, so
it is backend-agnostic:

.. code-block:: python

   # examples/esgame-dynamic/calculator/app.py
   RASTER_URL_TEMPLATE = os.environ.get(
       "RASTER_URL_TEMPLATE",
       f"{GEOSERVER_PUBLIC_URL}/wcs?service=WCS&version=2.0.1&request=GetCoverage"
       f"&coverageId={WORKSPACE}__{{coverage}}&format=image/tiff",
   )
   ...
   url = RASTER_URL_TEMPLATE.format(coverage=coverage)

* **Default** (unset): a GeoServer WCS ``GetCoverage`` URL — the GeoServer stack is unchanged.
* **pygeoapi stack** sets, in ``docker-compose.pygeoapi.yml``::

    RASTER_URL_TEMPLATE: "http://localhost:5005/collections/{coverage}/coverage?f=GTiff"

Any other read-only backend that can return a GeoTIFF works too — just point the template at it.


The pygeoapi config
-------------------

:file:`pygeoapi/pygeoapi-config.yml` defines a ``server`` block (CORS enabled — the browser fetches
the rasters cross-origin) and one **coverage collection per consequence raster**, served by the
``rasterio`` provider:

.. code-block:: yaml

   resources:
     ag_carbon:
       type: collection
       title: ag_carbon
       extents:
         spatial:
           bbox: [0, 0, 28, 29]
           crs: http://www.opengis.net/def/crs/EPSG/0/3857
       providers:
         - type: coverage
           name: rasterio
           data: /rasters/ag_carbon.tif
           format:
             name: GTiff
             mimetype: application/x-geotiff

The eight collections (``ag_carbon``, ``ag_habitat``, ``ag_water``, ``ag_hunt``, and the four
``ranch_*``) correspond exactly to the calculator's ``CONSEQUENCES`` map, so
``/collections/<name>/coverage?f=GTiff`` resolves for every consequence id.


The image and compose
----------------------

The Dockerfile is intentionally tiny — the base image's entrypoint regenerates the OpenAPI document
from the config on every start, so the collections always reflect ``pygeoapi-config.yml``:

.. code-block:: dockerfile

   FROM geopython/pygeoapi:latest
   COPY pygeoapi-config.yml /pygeoapi/local.config.yml

``docker-compose.pygeoapi.yml`` wires three services — ``frontend`` (unchanged), ``calculator``
(with ``RASTER_URL_TEMPLATE``), and ``pygeoapi`` — and mounts the **same** ``./geoserver/rasters``
folder read-only at ``/rasters``. There is **no seeder and no persistent volume**: pygeoapi reads its
collections from the baked-in config at startup. It is exposed on host port **5005** (port 5000 is a
common collision — local registries, Flask, macOS AirPlay).


Running it
----------

.. code-block:: sh

   make esgame-dynamic-pygeoapi-up      # http://localhost:81/  (calculator :8000, pygeoapi :5005)
   make esgame-dynamic-pygeoapi-down

The GeoServer and pygeoapi variants share the ``81``/``8000`` ports, so run only one at a time.


Verification
------------

The drop-in was checked at every layer:

* pygeoapi returns a GeoTIFF **byte-identical** to the source raster (same size, CRS ``EPSG:3857``,
  and value statistics — min 0, max 125, mean 29.618) at ``/collections/<name>/coverage?f=GTiff``;
* the calculator's ``POST`` response carries those pygeoapi URLs and per-consequence scores;
* from the frontend's own origin (``http://localhost:81``) the browser fetches a coverage
  **cross-origin** successfully (HTTP 200, valid CORS response, a complete ``II*`` TIFF) — exactly
  what :doc:`TiffService </reference/frontend-services>` does when the consequence maps load;
* the full stack builds and the SVG game renders against it.
