"""The scoring model of the static game, extracted from calc_files/game.js.

That file is the 2013 game's own calculator, and its first line says it "will be used in the backend
to calculate overall scores". This is that backend.

The model is a signed sum over placed cells::

    score = SUM(production map over placed cells) - SUM(each consequence map over placed cells)

and everything interesting is in which cells count as placed.

TWO INPUT FORMS, AND WHY
------------------------

A placement can be given as an ANCHOR (``{"type", "x", "y"}``) or as its CELLS
(``{"type", "cells": [{"x", "y"}, ...]}``).

The anchor form is the 2013 page's: it had four rows of x/y boxes, and ``concat_pairs()`` grew each
coordinate into a 2 x 2 block. The cell form is the one that can express a piece some of whose cells
have been taken away — a round in which a player gives individual cells back rather than whole farms
— which an anchor cannot say. Anchors are expanded to cells on the way in, so the cell form is what
the model actually scores.

VALIDATION, DEFAULT ON
----------------------

In the 2013 game the PAGE did the validating: you typed coordinates into a form that only allowed
so many, and the calculator summed whatever arrived. Split the two apart and that stops being true,
so this validates by default and can be asked not to:

    validation=True   (default)  reject cells off the board, cells claimed twice, and a piece whose
                                 footprint is bigger than placementSize x placementSize
    validation=False             score exactly what game.js scores, including the two bugs below

CELLS ARE NEVER COUNTED TWICE under validation, which is the substantive difference from the
original. game.js counts them twice, and it is not a design choice — ``concat_pairs()`` filters each
expanded cell against the ORIGINAL coordinate list and never against the cells it is in the middle
of adding, so two blocks that overlap contribute the shared cells once each. The page made that
unreachable by construction; a service reachable by anything else must say no.

The footprint check is what makes the cell form safe. A piece is at most placementSize wide and
placementSize tall — cells may be MISSING from it, but the ones present must still fit inside that
square, or "a 2 x 2 farm" could arrive as four cells scattered across the map.

Off the board is refused in BOTH modes, and that is the one place this deliberately parts company
with the original even at validation=False. game.js's bounds test rejects a cell only when it is off
the board in both directions at once — the bottom-right corner alone — so everywhere else along the
right and bottom edges it indexes past the end of a row, ``map[y][x]`` is undefined, and the whole
total becomes NaN. A caller cannot act on NaN, and a NaN reaching a player looks like a broken
server rather than an unplaceable farm. There is no allocation for which returning it is useful.
"""


class Refused(Exception):
    """The allocation cannot be scored, and it is the caller's to fix. Answered as a 400."""


def _block(x, y, size):
    """Cells an anchored placement covers: itself plus a (size-1) skirt right and down."""
    return [(x + dx, y + dy) for dy in range(size) for dx in range(size)]


def _cells_of(piece, size):
    """The cells a placement covers, from either input form.

    The anchor form reproduces ``concat_pairs()`` for a single placement. The duplicate behaviour
    that function has ACROSS placements is applied later, and only when validation is off, because
    it is a property of the original's filtering and not of any one piece.
    """
    if "cells" in piece:
        cells = piece["cells"]
        if not isinstance(cells, list) or not cells:
            raise Refused('"cells" must be a non-empty array of {x, y}')
        out = []
        for c in cells:
            if not isinstance(c, dict) or not isinstance(c.get("x"), int) or not isinstance(c.get("y"), int):
                raise Refused(f"every cell needs integer x and y; got {c!r}")
            out.append((c["x"], c["y"]))
        return out
    if not isinstance(piece.get("x"), int) or not isinstance(piece.get("y"), int):
        raise Refused(f'a placement needs either "cells" or integer x and y; got {piece!r}')
    return _block(piece["x"], piece["y"], size)


def _describe(piece):
    """Name a placement in an error the caller can act on, in whichever form they sent."""
    if "cells" in piece:
        return "cells " + ", ".join(f'({c.get("x")}, {c.get("y")})' for c in piece["cells"][:4])
    return f'the piece at ({piece.get("x")}, {piece.get("y")})'


def _expand_original(placements, size):
    """Reproduce ``concat_pairs()``, duplicates and all. Only used when validation is off.

    Skirt cells are filtered against the ORIGINAL placement coordinates only, exactly as the
    original filters against ``p_array``; skirt cells added for different placements are never
    compared with each other, so overlaps repeat.
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


def score(pack, allocation, set_asides=(), validation=True):
    """Score one allocation against a model pack.

    :param pack: the model pack (data/tradeoff-ag.json)
    :param allocation: placements, each ``{"type", "x", "y"}`` or ``{"type", "cells": [...]}``,
        with 1-based coordinates as the original's inputs are
    :param set_asides: ``[{"x", "y"}]`` single cells removed from every production type
    :param validation: reject off-board cells, cells claimed twice, and oversized footprints.
        False scores exactly what game.js scores — see the module docstring.
    """
    size = pack["placementSize"]
    types = {t["id"]: t for t in pack["productionTypes"]}
    for p in allocation:
        if p.get("type") not in types:
            raise Refused(
                f'unknown production type "{p.get("type")}"; '
                f'this pack has {", ".join(types)}')

    # Anchors only, and the original's cross-placement duplicate behaviour, when reproducing 2013.
    if not validation and all("cells" not in p for p in allocation):
        cells_per_piece = None
    else:
        cells_per_piece = [_cells_of(p, size) for p in allocation]

    aside = []
    for s in set_asides:
        if not isinstance(s, dict) or not isinstance(s.get("x"), int) or not isinstance(s.get("y"), int):
            raise Refused(f"every set-aside needs integer x and y; got {s!r}")
        aside.append((s["x"], s["y"]))

    def on_board(cell):
        cx, cy = cell
        return 1 <= cx <= pack["cols"] and 1 <= cy <= pack["rows"]

    # Refused in both modes — see the module docstring. Reported against the cell that does not
    # exist rather than the one that was asked for, because that is the surprising half.
    for piece, cells in zip(allocation, cells_per_piece if cells_per_piece is not None
                            else [_block(p["x"], p["y"], size) for p in allocation]):
        for cell in cells:
            if not on_board(cell):
                raise Refused(
                    f"{_describe(piece)} covers ({cell[0]}, {cell[1]}), which is off a "
                    f'{pack["cols"]} x {pack["rows"]} board')
    for s in aside:
        if not on_board(s):
            raise Refused(f"a set-aside at ({s[0]}, {s[1]}) is off a "
                          f'{pack["cols"]} x {pack["rows"]} board')

    if validation:
        # A piece may be MISSING cells — that is the point of the cell form — but the ones it has
        # must still fit inside one placementSize x placementSize footprint, or "a 2 x 2 farm"
        # could arrive as four cells scattered across the map.
        for piece, cells in zip(allocation, cells_per_piece):
            xs = [c[0] for c in cells]
            ys = [c[1] for c in cells]
            if max(xs) - min(xs) + 1 > size or max(ys) - min(ys) + 1 > size:
                raise Refused(
                    f"{_describe(piece)} spans {max(xs) - min(xs) + 1} x {max(ys) - min(ys) + 1} "
                    f"cells; a piece fits inside {size} x {size}")
            if len(set(cells)) != len(cells):
                raise Refused(f"{_describe(piece)} lists the same cell twice")

        # Cells are never counted twice. game.js counts them twice; the page made that unreachable
        # and a service cannot.
        seen = {}
        for piece, cells in zip(allocation, cells_per_piece):
            for cell in cells:
                if cell in seen:
                    raise Refused(
                        f"({cell[0]}, {cell[1]}) is claimed by two pieces — {seen[cell]} and "
                        f"{_describe(piece)}; cells cannot be counted twice")
                seen[cell] = _describe(piece)

    cells_by_type = {}
    if cells_per_piece is None:
        # 2013, anchors: expand per type with the original's filtering, then drop set-asides.
        for t in pack["productionTypes"]:
            mine = [p for p in allocation if p["type"] == t["id"]]
            cells_by_type[t["id"]] = _without(_expand_original(mine, size), aside)
    else:
        for t in pack["productionTypes"]:
            mine = [c for p, cells in zip(allocation, cells_per_piece) if p["type"] == t["id"]
                    for c in cells]
            cells_by_type[t["id"]] = _without(mine, aside)

    # In the pack's own order: the original resolves farm-vs-ranch overlap in favour of farm, the
    # first type declared, by removing the shared cells from ranch. Under validation no cell is
    # shared in the first place, so this only ever does anything at validation=False.
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
    # Per consequence MAP, not just per indicator. An indicator sums the same cost across every
    # production type that causes it — carbon is pts_agcarb + pts_pscarb — so the aggregate cannot
    # say which activity incurred it. The grid game draws those as separate boards and so does the
    # SVG one (dataDynamicGridRect.json), which is why the breakdown is reported rather than recomputed
    # by the caller: it has to come from the same resolved cells, after validation has dropped
    # overlaps, or it would not add up to the indicator beside it.
    by_map = {}
    negative = 0
    for indicator in pack["indicators"]:
        v = 0
        for t in pack["productionTypes"]:
            for map_name in t["consequences"]:
                if map_name in indicator["maps"]:
                    one = total(map_name, cells_by_type[t["id"]])
                    by_map[map_name] = one
                    v += one
        indicators[indicator["id"]] = v
        negative += v

    return {
        "score": positive - negative,
        "positive": positive,
        "negative": negative,
        "production": production,
        "indicators": indicators,
        "by_map": by_map,
        "cells": {k: len(v) for k, v in cells_by_type.items()},
    }
