#!/bin/sh
# One-shot GeoServer seeder. Registers each /rasters/*.tif as an EXTERNAL GeoTIFF coverage:
# GeoServer references the file in place (the mounted rasters folder) and stores only the catalog
# config (the "sidecar") in its persistent data dir. After this runs once, GeoServer reloads the
# coverages from that data dir on every boot - no re-seeding needed.
#
# Idempotent: if the workspace already exists (data dir was persisted) it exits immediately.
set -eu
GS="${GEOSERVER_URL:-http://geoserver:8080/geoserver}"
WS=esgame
AUTH="admin:geoserver"
RASTERS="${RASTERS_DIR:-/rasters}"

echo "[seed] waiting for GeoServer at $GS ..."
until [ "$(curl -s -o /dev/null -w '%{http_code}' -u "$AUTH" "$GS/rest/about/version.json")" = "200" ]; do
  sleep 3
done

if [ "$(curl -s -o /dev/null -w '%{http_code}' -u "$AUTH" "$GS/rest/workspaces/$WS.json")" = "200" ]; then
  echo "[seed] workspace '$WS' already present (data dir persisted) - nothing to do"
  exit 0
fi

echo "[seed] creating workspace '$WS'"
curl -s -u "$AUTH" -XPOST -H "Content-type: text/xml" \
  -d "<workspace><name>$WS</name></workspace>" "$GS/rest/workspaces" >/dev/null

for f in "$RASTERS"/*.tif; do
  name=$(basename "$f" .tif)
  curl -s -u "$AUTH" -XPUT -H "Content-type: text/plain" -d "file://$f" \
    "$GS/rest/workspaces/$WS/coveragestores/$name/external.geotiff?coverageName=$name" >/dev/null
  echo "[seed] registered external coverage $name -> $f"
done
echo "[seed] done"
