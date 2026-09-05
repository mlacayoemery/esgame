# Examples

The games this repository ships, and a stack that plays one of them against a real backend.

A game here is described by **two independent characteristics**, and the file names say which is
which — see [static vs. dynamic](https://mlacayoemery.github.io/esgame/docs/static-vs-dynamic.html):

- **Type of data** — *static*: the browser scores the allocation from rasters that ship with the
  game. *dynamic*: a calculator scores the round and returns the next level's rasters.
- **Unit selection** — *raster grid*: square cells implied by `gameBoardColumns × gameBoardRows`.
  *vector SVG*: polygons traced from a zone raster.

| File | Data | Units | What it is |
|---|---|---|---|
| [`dataStaticGridRect.json`](dataStaticGridRect.json) | static | raster grid | Tradeoff: Agriculture Edition, client-side. What GitHub Pages serves, playable from a file with the network off. [Page](https://mlacayoemery.github.io/esgame/docs/static-grid-game.html) |
| [`dataDynamicGridRect.json`](dataDynamicGridRect.json) | dynamic | vector SVG | The same game through the dynamic pipeline: same rasters, same 2 × 2 pieces, zones traced from `esgame_ag_zones.tif`. [Page](https://mlacayoemery.github.io/esgame/docs/dynamic-svg-game.html) |
| [`optimalDynamicGridRect.json`](optimalDynamicGridRect.json) | — | — | **Generated.** The best board `tools/optimizer/optimize.py` can find for each round, loaded by the checkmark button. Do not edit by hand. |

*GridRect* is not decoration: both boards are a rectangular grid of units, which is what lets a
piece be 2 × 2 on either. A vector-SVG unit is otherwise one zone — `elementSize > 1` groups cells
by stepping through `gameBoardColumns`, so it means something only where the zones are laid out as
a grid.

The two games deliberately give the **same ids to the same things** — arable is `10`, a Carbon cost
is `4` — which is what lets one calculator serve either board.

## How they reach the app

The app fetches its dataset at runtime by URL (`assets/dataStaticGridRect.json`), so these files
have to be under `src/assets` by the time anything serves the app. They are authored here and
copied there:

```
npm run sync:examples      # v2/scripts/sync-examples.mjs, run by prestart/prebuild/pretest/pree2e
```

The copies under `v2/src/assets/` are **gitignored build output** — this directory holds the only
edited version. Angular will not do the copy with an assets rule (`input` outside the workspace
root is rejected), and the frontend image builds from the **repository root** for the same reason:
a build context of `v2/` cannot see this directory, and would produce an image that builds cleanly
and serves a board that 404s.

```
docker build -f v2/Dockerfile -t local/esgame-core:latest .
```

## Running them

```
make esgame-up        # the static grid game, no backend
make esgame-ag-up     # the dynamic SVG game + tools/calculator scoring its rounds
```

A raster-grid game can be scored by a calculator too, if its dataset sets `backendScored: true`;
`dataStaticGridRect.json` does not, because it is the static example. See the
[game builder reference](https://mlacayoemery.github.io/esgame/docs/reference/game-builder.html).

## `esgame-dynamic/`

A self-contained compose stack — frontend, FastAPI calculator, GeoServer (or pygeoapi) and a
one-shot seeder — that plays `dataDynamicGridRect.json` against real coverages. It carries only
its own `config.json`: the board, its rasters and its icons all ship in the base image.

```
make esgame-dynamic-example-up      # GeoServer variant
make esgame-dynamic-pygeoapi-up     # pygeoapi variant
```

See [`esgame-dynamic/README.md`](esgame-dynamic/README.md).
