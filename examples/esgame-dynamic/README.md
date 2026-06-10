# Example: esgame-dynamic (self-contained)

A runnable example of the full **dynamic** esgame stack using esgame's own bundled (static grid)
data — no external/proprietary geodata. It demonstrates the architecture that real deployments
(e.g. places) specialize.

```
frontend/          thin overlay (FROM the esgame image): this example's SVG config (data.json, built
                   from the static grid data) + a generated 28x29 zone map + background.
calculator/        a tiny stateless FastAPI "simple calculator": per level submit returns a GeoServer
                   WCS URL per consequence map + a simple allocation-based score. It does NOT seed.
geoserver/rasters/ the georeferenced consequence GeoTIFFs, mounted into GeoServer.
geoserver/seed.sh  one-shot seeder (run as the geoserver-seed service): registers the rasters as
                   external coverages once; GeoServer then reloads them from its data dir on boot.
docker-compose.yml frontend (:81) + calculator (:8000) + geoserver (:8080) + one-shot geoserver-seed.
```

## Run

```sh
# from the repo root:
make example-up         # build + start the example (uses the published esgame image)
# or against a locally-built esgame base:
ESGAME_IMAGE=local/esgame-core:latest \
  docker compose -p esgame-dynamic-example -f examples/esgame-dynamic/docker-compose.yml up -d --build

# open http://localhost:81/  -> place arable/livestock on the zones, press Next Level.
# Round 2 shows consequence maps served from GeoServer.

make example-down       # stop + remove
```

## How it works

The frontend loads `data.json` (SVG mode): a 28x29 **zone map** (one clickable cell per pixel),
the static **suitability** rasters (`esgame_img_ag/ranch.tif`, already in the esgame image), and a
background. On *Next Level* the browser POSTs the allocation to the calculator (`CALC_URL`), which
returns `{results:[{id, score, url}]}` — each `url` a GeoServer **WCS GetCoverage** GeoTIFF of a
consequence raster. This mirrors the production R calculator (which returns WCS URLs).

## Seeding & persistence

GeoServer's catalog lives on a **persistent named volume** (`geoserver-data` → `/opt/geoserver_data`),
and the rasters are bind-mounted read-only at `/rasters`. The one-shot **`geoserver-seed`** job
registers each raster as an **external** coverage (GeoServer references the file in place and writes
only the catalog config — the "sidecar" — into its data dir). It is **idempotent**: if the workspace
already exists it does nothing.

So after the first `up`:
- **On reboot / restart / recreate of GeoServer**, it reloads the coverages from the persistent data
  dir on boot — no re-seeding, fast. (The seeder re-runs but no-ops.)
- The durable source of truth is the committed `geoserver/rasters/` folder + the persisted catalog.
- To wipe and re-seed from scratch: `docker compose -p esgame-dynamic-example down -v` (removes the
  volume), then `up`.
