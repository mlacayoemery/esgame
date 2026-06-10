# Example: esgame-dynamic (self-contained)

A runnable example of the full **dynamic** esgame stack using esgame's own bundled (static grid)
data — no external/proprietary geodata. It demonstrates the architecture that real deployments
(e.g. places) specialize.

```
frontend/    thin overlay image (FROM the esgame image): this example's SVG config (data.json,
             built from the static grid data) + a generated 28x29 zone map + background.
calculator/  a tiny FastAPI "simple calculator": on startup it preseeds GeoServer with the example
             consequence rasters (calculator/data/*.tif, georeferenced), and on each level submit
             returns a GeoServer WCS URL per consequence map + a simple allocation-based score.
docker-compose.yml   frontend (:81) + calculator (:8000) + geoserver (:8080).
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
returns `{results:[{id, score, url}]}` — each `url` a GeoServer **WCS GetCoverage** GeoTIFF of the
preseeded consequence raster. This mirrors the production R calculator, which uploads computed
rasters to GeoServer and returns WCS URLs.
