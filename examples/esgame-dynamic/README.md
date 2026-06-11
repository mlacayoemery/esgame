# Example: esgame-dynamic (self-contained)

A runnable example of the full **dynamic** esgame stack using esgame's own bundled (static grid)
data — no external/proprietary geodata. It demonstrates the architecture that real deployments
(e.g. places) specialize.

```
frontend/          thin overlay (FROM the esgame image): this example's SVG config (data.json, built
                   from the static grid data) + a generated 28x29 zone map + background.
calculator/        a tiny stateless FastAPI "simple calculator": per level submit returns a GeoServer
                   WCS URL per consequence map + a simple allocation-based score. It does NOT seed.
geoserver/rasters/    the georeferenced consequence GeoTIFFs, mounted into GeoServer.
geoserver/palettes.json color palettes (copied from the frontend gradients) + which palette each
                      coverage uses.
geoserver/seed.py     one-shot seeder (the geoserver-seed service): registers the rasters as external
                      coverages, builds an SLD raster style per palette, and sets it as each
                      coverage's default style. GeoServer then reloads it all from its data dir on boot.
docker-compose.yml frontend (:81) + calculator (:8000) + geoserver (:8080) + one-shot geoserver-seed.
```

## Run

```sh
# from the repo root (builds the esgame base locally, so no ghcr image needed):
make esgame-dynamic-example-up

# open http://localhost:81/  -> place arable/livestock on the zones, press Next Level.
# Round 2 shows consequence maps served from GeoServer.

make esgame-dynamic-example-down   # stop + remove
```

### Tweaking appearance / config
`frontend/config.json` is **mounted** into the frontend, so you can change settings **without
rebuilding the image** — e.g. `gridLineWidth` / `gridLineColor` (the SVG cell border), `defaultMode`,
or `calcUrl`. Apply an edit with:

```sh
docker compose -p esgame-dynamic-example up -d --force-recreate frontend   # then reload the page
```

(A single-file bind mount won't reflect in-place edits live — editors that replace the file's inode
need the container re-created, which the command above does. No image rebuild either way.)

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

## Alternative backend: pygeoapi (lighter-weight, **read-only**)

`docker-compose.pygeoapi.yml` is a drop-in alternative that replaces GeoServer (plus its one-shot
seeder and persistent data volume) with a single small [pygeoapi](https://github.com/geopython/pygeoapi)
container. pygeoapi serves the same consequence rasters as **OGC API - Coverages**; each is fetchable
as a GeoTIFF at `…/collections/<name>/coverage?f=GTiff` — the drop-in equivalent of GeoServer's WCS
`GetCoverage`.

```sh
make esgame-dynamic-pygeoapi-up      # http://localhost:81/  (calculator :8000, pygeoapi :5005)
make esgame-dynamic-pygeoapi-down
# or directly:
ESGAME_IMAGE=local/esgame-core:latest \
  docker compose -p esgame-dynamic-pygeoapi -f docker-compose.pygeoapi.yml up -d --build
```

**It is a true drop-in:** the frontend bundle and the calculator *image* are identical to the
GeoServer stack. The only differences are (1) the calculator's `RASTER_URL_TEMPLATE` env var, which
points it at pygeoapi's coverage URL instead of WCS, and (2) the backend container. The frontend
never changes — it just fetches whatever raster URL the calculator returns. (Shares the `81`/`8000`
ports with the GeoServer example, so run only one at a time.)

> ⚠️ **Read-only data only.** pygeoapi publishes collections from a **static config file**
> (`pygeoapi/pygeoapi-config.yml`); there is **no run-time publish/REST API** as GeoServer has. That
> is fine here because the example's rasters never change — but a deployment that must **add, replace,
> or mutate rasters at run time** (as GeoServer's REST API and the seeder allow) cannot use this
> variant. To add or change a raster with pygeoapi you edit the config and restart the container.

Why it's lighter: no catalog, no persistent data volume, no separate seeder job, and a much smaller
image — pygeoapi reads its collections from the baked-in config on every start. The rasters are the
same `geoserver/rasters/*.tif`, mounted read-only.
