"""Serve the esgame frontend's dynamic mode from this model.

The frontend's SVG (dynamic) mode POSTs an allocation and expects back, per consequence map, a
score and a URL to a raster it can fetch and draw. That is the shape ``tools/R/calculator.r``
returns, and until now nothing else did — which is why the only dynamic game was the Dutch/PLACES
landscape model, and the static agriculture game had no dynamic counterpart at all.

This translates between the two, so ``examples/dataDynamicGridRect.json`` can be played against the
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

# Board geometry, matching v2/src/assets/images/esgame_ag_zones.tif exactly. That raster holds one
# zone per CELL, numbered by row-major index, because those are the ids the frontend does its
# placement arithmetic in (GameService.getAssociatedFields walks `id + j * columns`). If either
# side of this changes the other must too.
COLS = 28
ROWS = 29
PLACEMENT = 2            # a piece is 2 x 2 cells: dataDynamicGridRect.json's elementSize, and the pack's
MAX_PIECES_PER_TYPE = 4  # dataDynamicGridRect.json's maxElements, and the grid game's

# lulc as the frontend sends it (dataDynamicGridRect.json productionTypes) -> this pack's type ids.
# Anything else -- including the dataset's defaultProductionType "0" -- means "nothing here" and
# is dropped rather than refused: the frontend posts EVERY field each round, allocated or not.
LULC = {10: "farm", 20: "ranch"}

# One row per consequence board in dataDynamicGridRect.json, whose ids are dataStaticGridRect.json's ids:
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


def anchor_of(zone_id):
    """The 1-based (x, y) cell a zone id names.

    Inverse of the raster's own numbering, `y * COLS + x` over 0-based pixels.
    """
    return (zone_id % COLS) + 1, (zone_id // COLS) + 1


def placements(allocation):
    """The frontend's allocation as model placements, one piece per allocated field.

    ANCHORS, not cells. The frontend posts one entry per placed piece carrying that piece's
    top-left cell (`o.fields[0].id` in GameService.goToNextLevel), and expanding an anchor by
    placementSize is the model's own 2013 form — so the expansion happens in the model rather than
    being reimplemented here, where it could disagree about what a 2 x 2 piece covers.
    """
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
            raise BadRound(f'an allocated field needs an integer "id"; got {entry.get("id")!r}')
        if not 0 <= zone < COLS * ROWS:
            raise BadRound(f"field {zone} is not on this {COLS} x {ROWS} board")
        x, y = anchor_of(zone)
        # The frontend slides a piece that would leave the board (getAssociatedFields), so an
        # anchor arriving here should already fit. Refusing rather than clamping: a piece that
        # does not fit means the two sides disagree about the board, and quietly moving it would
        # score a round the player did not play.
        if x + PLACEMENT - 1 > COLS or y + PLACEMENT - 1 > ROWS:
            raise BadRound(
                f"a {PLACEMENT} x {PLACEMENT} piece anchored at ({x}, {y}) runs off a "
                f"{COLS} x {ROWS} board")
        out.append({"type": kind, "x": x, "y": y})
    return out


def worst_case(pack):
    """The largest cost each consequence map can carry, used to put scores on a 0-100 scale.

    Sixteen cells — MAX_PIECES_PER_TYPE pieces of PLACEMENT x PLACEMENT — times the map's own
    highest value. A flat ceiling rather than the sum of the sixteen highest cells: it is the same
    arithmetic on every map, so the axes of the chart are comparable, and it is reachable only by
    a board where all sixteen cells hold the maximum.
    Fixed for the pack, so a score means the same thing in every round -- which is the property
    esgame's own bounds.json exists to give the R calculator (see tools/R/derive-bounds.R).
    """
    cells = MAX_PIECES_PER_TYPE * PLACEMENT * PLACEMENT
    bounds = {}
    for _, _, map_name, _, _ in MAPS:
        top = max(v for row in pack["maps"][map_name]["grid"] for v in row)
        bounds[map_name] = cells * top
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
