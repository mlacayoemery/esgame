"""The scoring model of the static game, extracted from calc_files/game.js.

That file is the 2013 game's own calculator, and its first line says it "will be used in the backend
to calculate overall scores". This is that backend.

The model is a signed sum over placed cells::

    score = SUM(production map over placed cells) - SUM(each consequence map over placed cells)

and everything interesting is in which cells count as placed.

THE ORIGINAL'S BEHAVIOUR IS REPRODUCED, NOT TIDIED, and it is not reproduced on trust:
golden/allocations.json holds 200 allocations scored by game.js itself, and test_model.py requires
this to match every one of them. Two of those behaviours are surprising enough to name, and both
are the original's, measured rather than inferred:

OVERLAPPING PLACEMENTS DOUBLE-COUNT
    ``concat_pairs()`` checks each expanded cell against the ORIGINAL coordinate list, never
    against the cells it is in the middle of adding. Two farms whose 2x2 blocks overlap therefore
    contribute the shared cells twice.

PLACEMENTS AT THE EDGE RUN OFF THE BOARD
    The original's bounds test is ``!(x+1 === width+1) || !(y+1 === length+1)``, which rejects a
    cell only when it is off the board in BOTH directions — the bottom-right corner alone.
    Everywhere else along the right and bottom edges it indexes past the end of a row, ``map[y][x]``
    is undefined, and the whole total becomes NaN.

The second one this service refuses rather than reproduces: an allocation whose block leaves the
board is a 400, not a NaN. A caller cannot act on NaN, and a NaN reaching a player looks like a
broken server rather than an unplaceable farm.
"""


class Refused(Exception):
    """The allocation cannot be scored, and it is the caller's to fix. Answered as a 400."""


def _block(x, y, size):
    """Cells a placement covers: itself plus a (size-1) skirt right and down, as game.js does."""
    return [(x + dx, y + dy) for dy in range(size) for dx in range(size)]


def _expand(placements, size):
    """Expand placements into scored cells, reproducing ``concat_pairs()``.

    The duplicates are deliberate. Skirt cells are filtered against the ORIGINAL placement
    coordinates only, exactly as the original filters against ``p_array``; skirt cells added for
    different placements are never compared with each other, so overlaps repeat.
    """
    originals = [(p["x"], p["y"]) for p in placements]
    original_set = set(originals)
    skirt = []
    for x, y in originals:
        for cell in _block(x, y, size):
            if cell != (x, y) and cell not in original_set:
                skirt.append(cell)
    return originals + skirt


def _without(cells, drop):
    drop = set(drop)
    return [c for c in cells if c not in drop]


def score(pack, allocation, set_asides=()):
    """Score one allocation against a model pack.

    :param pack: the model pack (data/tradeoff-ag.json)
    :param allocation: [{"type", "x", "y"}] with 1-based coordinates, as the original's inputs are
    :param set_asides: [{"x", "y"}] single cells removed from every production type
    """
    types = {t["id"]: t for t in pack["productionTypes"]}
    for p in allocation:
        if p.get("type") not in types:
            raise Refused(
                f'unknown production type "{p.get("type")}"; '
                f'this pack has {", ".join(types)}')

    # Refused, not reproduced — see the module docstring. Reported against the cell that does not
    # exist rather than the one that was asked for, because that is the surprising half.
    checked = [(p, pack["placementSize"]) for p in allocation] + [(s, 1) for s in set_asides]
    for p, size in checked:
        for cx, cy in _block(p["x"], p["y"], size):
            if not (1 <= cx <= pack["cols"] and 1 <= cy <= pack["rows"]):
                raise Refused(
                    f'a placement at ({p["x"]}, {p["y"]}) covers ({cx}, {cy}), '
                    f'which is off a {pack["cols"]} x {pack["rows"]} board')

    aside = [(s["x"], s["y"]) for s in set_asides]
    cells_by_type = {}
    for t in pack["productionTypes"]:
        mine = [p for p in allocation if p["type"] == t["id"]]
        cells_by_type[t["id"]] = _without(_expand(mine, pack["placementSize"]), aside)

    # In the pack's own order: the original resolves farm-vs-ranch overlap in favour of farm, the
    # first type declared, by removing the shared cells from ranch.
    claimed = set()
    for t in pack["productionTypes"]:
        cells = _without(cells_by_type[t["id"]], claimed)
        cells_by_type[t["id"]] = cells
        claimed.update(cells)

    def total(map_name, cells):
        grid = pack["maps"][map_name]["grid"]
        # x, y are 1-based and the grid is [row][col], i.e. [y][x] — the original flips them here
        # and says so in capitals, having evidently been caught by it.
        return sum(grid[y - 1][x - 1] for x, y in cells)

    production = {}
    positive = 0
    for t in pack["productionTypes"]:
        v = total(t["production"], cells_by_type[t["id"]])
        production[t["id"]] = v
        positive += v

    indicators = {}
    negative = 0
    for indicator in pack["indicators"]:
        v = 0
        for t in pack["productionTypes"]:
            for map_name in t["consequences"]:
                if map_name in indicator["maps"]:
                    v += total(map_name, cells_by_type[t["id"]])
        indicators[indicator["id"]] = v
        negative += v

    return {
        "score": positive - negative,
        "positive": positive,
        "negative": negative,
        "production": production,
        "indicators": indicators,
        "cells": {k: len(v) for k, v in cells_by_type.items()},
    }
