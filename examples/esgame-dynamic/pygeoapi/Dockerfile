# Lightweight, READ-ONLY alternative to the GeoServer container for the esgame dynamic example.
#
# pygeoapi serves the consequence rasters as OGC API - Coverages; each is returnable as a GeoTIFF at
#   /collections/<name>/coverage?f=GTiff
# which is the drop-in equivalent of the GeoServer WCS GetCoverage URL the calculator otherwise emits
# (point the calculator at it with RASTER_URL_TEMPLATE — see docker-compose.pygeoapi.yml).
#
# READ-ONLY: collections are defined statically in pygeoapi-config.yml. Unlike GeoServer there is no
# REST API to publish or modify data at run time. To add/change a raster, edit the config and restart.
# The rasters themselves are mounted read-only at /rasters by the compose file (shared with GeoServer's
# ./geoserver/rasters), so this image stays tiny — no catalog, no persistent data dir, no seeder.
#
# The base image's entrypoint regenerates the OpenAPI document from this config on every start, so the
# collections always reflect pygeoapi-config.yml.
FROM geopython/pygeoapi:latest

COPY pygeoapi-config.yml /pygeoapi/local.config.yml
