"""Serve the esgame frontend's dynamic mode from this model.

The frontend's SVG (dynamic) mode POSTs an allocation and expects back, per consequence map, a
score and a URL to a raster it can fetch and draw. That is the shape ``tools/R/calculator.r``
returns, and until now nothing else did — which is why the only dynamic game was the Dutch/PLACES
landscape model, and the static agriculture game had no dynamic counterpart at all.

This translates between the two, so ``v2/src/assets/dataAgDynamic.json`` can be played against the
same model the grid game is scored by. It adds no scoring of its own: every number here comes out
of ``model.score``, which is pinned against the 2013 original by ``extract/golden.test.mjs`` and
against the browser by ``v2/e2e/grid-calculator-agrees.spec.ts``.

WHY THE RASTER URLS ARE STATIC, AND WHY THAT IS NOT A SHORTCUT. In the Dutch model a round's
consequence maps are computed per round, so the R calculator writes new rasters and publishes them
to GeoServer. In THIS game the consequence surfaces are fixed cost maps -- ``esgame_img_ag_carbon``
is what a farm costs in carbon on that cell, and it does not depend on what anyone placed. The
round changes which cells you occupy, not the surface. So the correct raster to hand back is the
one the frontend already ships, and there is nothing to publish.
"""

# Zone geometry, matching v2/src/assets/images/esgame_ag_zones.tif exactly. If either side of this
# changes the other must too: the ids in that raster ARE the ids the browser posts back.
ZONE = 2                 # a zone is 2 x 2 cells, the static game's elementSize
ZONES_ACROSS = 14        # 28 columns / 2
MAX_ZONES_PER_TYPE = 4   # dataAgDynamic.json's maxElements, and the grid game's

# lulc as the frontend sends it (dataAgDynamic.json productionTypes) -> this pack's type ids.
# Anything else -- including the dataset's defaultProductionType "0" -- means "nothing here" and
# is dropped rather than refused: the frontend posts EVERY field each round, allocated or not.
LULC = {10: "farm", 20: "ranch"}

# One row per consequence board in dataAgDynamic.json, whose ids are dataGridExample.json's ids:
# the two datasets are the same game, so a Carbon cost is id 4 on both boards.
#
#   esgame id, short key, pack map, production type, the raster the frontend already ships
MAPS = [
    ("4",  "AGC", "pts_agcarb", "farm",  "esgame_img_ag_carbon.tif"),
    ("5",  "AGH", "pts_aghq",   "farm",  "esgame_img_ag_habitat.tif"),
    ("6",  "AGW", "pts_agwq",   "farm",  "esgame_img_ag_water.tif"),
    ("7",  "AGR", "pts_agrec",  "farm",  "esgame_img_ag_hunt.tif"),
    ("8",  "RAC", "pts_pscarb", "ranch", "esgame_img_ranch_carbon.tif"),
    ("9",  "RAH", "pts_pshq",   "ranch", "esgame_img_ranch_habitat.tif"),
    ("10", "RAW", "pts_pswq",   "ranch", "esgame_img_ranch_water.tif"),
    ("11", "RAR", "pts_psrec",  "ranch", "esgame_img_ranch_hunt.tif"),
]


class BadRound(Exception):
    """The request is not a round this can score. Carries the message the caller should send."""


def cells_of_zone(zone_id):
    """The four 1-based (x, y) cells a zone covers.

    Inverse of the raster's own formula, `(y // 2) * 14 + (x // 2) + 1` over 0-based pixels, with
    the +1 undone here and the model's 1-based coordinates applied.
    """
    b = zone_id - 1
    x0 = (b % ZONES_ACROSS) * ZONE + 1
    y0 = (b // ZONES_ACROSS) * ZONE + 1
    return [{"x": x0 + dx, "y": y0 + dy} for dy in range(ZONE) for dx in range(ZONE)]


def placements(allocation):
    """The frontend's allocation as model placements, one piece per allocated zone."""
    out = []
    for entry in allocation:
        if not isinstance(entry, dict):
            raise BadRound(f"every allocation entry must be an object; got {entry!r}")
        kind = LULC.get(entry.get("lulc"))
        if kind is None:
            continue                      # unallocated land: the frontend posts it every round
        try:
            zone = int(entry.get("id"))
        except (TypeError, ValueError):
            raise BadRound(f'an allocated zone needs an integer "id"; got {entry.get("id")!r}')
        if not 1 <= zone <= ZONES_ACROSS * ZONES_ACROSS:
            # Zone 0 is the raster's nodata -- the unpaired 29th row, which is not placeable. It
            # is named rather than silently dropped, because a board posting it means the drawing
            # raster and this table have drifted apart.
            raise BadRound(f"zone {zone} is not on this board (1..{ZONES_ACROSS * ZONES_ACROSS})")
        out.append({"type": kind, "cells": cells_of_zone(zone)})
    return out


def worst_case(pack):
    """The largest cost each consequence map can carry, used to put scores on a 0-100 scale.

    Derived from the model rather than chosen: a type may hold MAX_ZONES_PER_TYPE zones of ZONE x
    ZONE cells, so the worst it can do to one map is to sit on that map's highest-valued cells.
    Fixed for the pack, so a score means the same thing in every round -- which is the property
    esgame's own bounds.json exists to give the R calculator (see tools/R/derive-bounds.R).
    """
    budget = MAX_ZONES_PER_TYPE * ZONE * ZONE
    bounds = {}
    for _, _, map_name, _, _ in MAPS:
        flat = sorted((v for row in pack["maps"][map_name]["grid"] for v in row), reverse=True)
        bounds[map_name] = sum(flat[:budget])
    return bounds


def results(pack, scored, bounds, game_id, rnd, asset_base):
    """The frontend's CalculationResult, built from one model run.

    Scores are COSTS on 0-100: higher is more damage. That is the R calculator's convention and
    the frontend is built around it -- prepareNextLevel subtracts them from the round's production
    score -- so matching it is what lets one frontend serve either backend.
    """
    out = []
    for esgame_id, key, map_name, _type_id, raster in MAPS:
        raw = scored["by_map"].get(map_name, 0)
        top = bounds[map_name]
        out.append({
            "id": esgame_id,
            "name": f"{key}_Game_{game_id}_Round_{rnd}.tif",
            "score": max(0, min(100, round(100 * raw / top))) if top else 0,
            "url": f"{asset_base}/assets/images/{raster}",
        })
    return out
