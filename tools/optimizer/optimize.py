"""Find the best possible board for each round of the agriculture game, exactly.

WHAT "BEST" MEANS, AND WHY IT IS TWO DIFFERENT QUESTIONS.

Round one shows only the two suitability maps: GameService builds level 1 from
``gameBoardType == SuitabilityMap`` alone, and level 2 is the one that adds the consequence
boards (``prepareNextLevel`` sets ``showConsequenceMaps = true``). So a player optimising round one
is optimising PRODUCTION, with no way to see what it costs. In round two the same allocation is
scored net of four consequence maps per production type.

That is the whole point of the game, and it is why this program answers both questions separately.
The round-one optimum is not the round-two optimum, and the gap between them is the lesson.

THE RULES, all read off the frontend rather than assumed:

  * The board is 28 x 29 cells (dataDynamicGridRect.json), a piece is 2 x 2 (``elementSize``), and each
    production type gets at most four pieces (``maxElements``).
  * A piece anchors at its top-left cell. GameService.getAssociatedFields clamps an anchor so the
    footprint stays on the board, so the distinct anchors are x in 1..27, y in 1..28 -- 756 of them.
  * GameService.canFieldBePlaced rejects a piece overlapping ANY already-placed piece, of either
    type. Two 2 x 2 anchors overlap exactly when they differ by at most one in both axes.
  * A cell's contribution depends only on which type covers it, so a board's score is the sum over
    its pieces. That is what makes this an exact search rather than a simulation.

The scoring itself is not reimplemented here: values come from tools/calculator's model pack, whose
grids are byte-identical to the rasters the frontend ships (checked by test_optimize.py), and every
answer is re-scored through ``model.score`` before it is written out.

    python3 tools/optimizer/optimize.py            # report both rounds
    python3 tools/optimizer/optimize.py --write    # ...and update the asset the button loads
"""

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "tools", "calculator", "src"))

import model  # noqa: E402  (after the path insert, deliberately)

PACK = os.path.join(ROOT, "tools", "calculator", "data", "tradeoff-ag.json")
# The answer ships beside the game it belongs to, in examples/; v2/scripts/sync-examples.mjs
# copies both into the app's assets at build time.
ASSET = os.path.join(ROOT, "examples", "optimalDynamicGridRect.json")

# The frontend's production type ids, against this pack's. dataDynamicGridRect.json productionTypes.
LULC = {"farm": "10", "ranch": "20"}
MAX_PIECES = 4


def anchors(pack):
    """Every distinct anchor, as 1-based (x, y). A piece covers x..x+1, y..y+1."""
    size = pack["placementSize"]
    return [(x, y)
            for y in range(1, pack["rows"] - size + 2)
            for x in range(1, pack["cols"] - size + 2)]


def values(pack, type_id, with_consequences):
    """Each anchor's score for one production type, as the frontend would score it.

    Round one is production alone; round two subtracts the type's four consequence maps. Both read
    the pack's own grids, which are 1-based and indexed [y][x].
    """
    size = pack["placementSize"]
    spec = next(t for t in pack["productionTypes"] if t["id"] == type_id)
    gains = pack["maps"][spec["production"]]["grid"]
    costs = [pack["maps"][m]["grid"] for m in spec["consequences"]] if with_consequences else []

    out = {}
    for (x, y) in anchors(pack):
        cells = [(x + dx, y + dy) for dx in range(size) for dy in range(size)]
        total = sum(gains[cy - 1][cx - 1] for (cx, cy) in cells)
        for grid in costs:
            total -= sum(grid[cy - 1][cx - 1] for (cx, cy) in cells)
        out[(x, y)] = total
    return out


def overlaps(a, b):
    """Two 2 x 2 anchors share a cell exactly when they differ by at most one in both axes."""
    return abs(a[0] - b[0]) <= 1 and abs(a[1] - b[1]) <= 1


def solve(order, per_type, budget=MAX_PIECES):
    """The exact best board, by branch and bound.

    `order` is the production types in a fixed sequence and `per_type` maps each to its anchor
    values. Pieces of one type are chosen in descending-value order and by increasing index, so
    each set is reached once rather than 4! times.

    The bound is the running total plus, for every piece still to place, the best values left in
    that type's list -- ignoring overlap, which can only make a board worse. Sorted descending,
    "the best k left from position i" is just the next k, so a prefix sum answers it in O(1).
    """
    ranked, prefix = {}, {}
    for t in order:
        vals = sorted(per_type[t].items(), key=lambda kv: -kv[1])
        ranked[t] = vals
        sums = [0]
        for _, v in vals:
            sums.append(sums[-1] + v)
        prefix[t] = sums

    def top(t, start, k):
        """The best k values from position `start` on, or -inf if there are not k left."""
        if k == 0:
            return 0
        if start + k > len(ranked[t]):
            return float("-inf")
        return prefix[t][start + k] - prefix[t][start]

    best = {"score": float("-inf"), "pieces": None}
    # A whole type's best-case contribution, for the types not yet reached.
    rest = [sum(top(t, 0, budget) for t in order[i + 1:]) for i in range(len(order))]

    def search(ti, start, left, placed, total):
        if left == 0:
            if ti + 1 == len(order):
                if total > best["score"]:
                    best["score"], best["pieces"] = total, list(placed)
                return
            return search(ti + 1, 0, budget, placed, total)

        t = order[ti]
        if total + top(t, start, left) + rest[ti] <= best["score"]:
            return

        for i in range(start, len(ranked[t]) - left + 1):
            anchor, value = ranked[t][i]
            # Re-checked inside the loop: `best` improves as we go, so a branch worth taking when
            # the loop began may not be by the time we reach it.
            if total + top(t, i, left) + rest[ti] <= best["score"]:
                return
            if any(overlaps(anchor, p[1]) for p in placed):
                continue
            placed.append((t, anchor))
            search(ti, i + 1, left - 1, placed, total + value)
            placed.pop()

    search(0, 0, budget, [], 0)
    return best


def as_allocation(pieces):
    """The pieces as model.score wants them: 1-based anchors, this pack's type ids."""
    return [{"type": t, "x": x, "y": y} for (t, (x, y)) in pieces]


def report(pack, label, pieces, total, with_consequences):
    """Re-score through the pinned model, and say what the board is worth on every map.

    The check is not a formality. The search works on per-anchor sums it computes itself, so
    agreeing with ``model.score`` -- which is golden-tested against the 2013 original -- is what
    says the two are scoring the same game. Round one is scored on production alone, because that
    is the only thing its board shows, so only round two can be compared against the full model.
    """
    scored = model.score(pack, as_allocation(pieces))
    print(f"\n=== {label} ===")
    for (t, (x, y)) in sorted(pieces, key=lambda p: (p[0], p[1][1], p[1][0])):
        print(f"   {t:6s} at x={x:3d} y={y:3d}   (cell id {(y - 1) * pack['cols'] + (x - 1)})")
    print(f"   search total   {total}")
    if with_consequences:
        print(f"   model score    {scored['score']}   <- must agree")
        assert scored["score"] == total, f"search {total} but model {scored['score']}"
    else:
        gained = sum(scored["production"].values())
        print(f"   model production {gained}   <- must agree")
        assert gained == total, f"search {total} but model {gained}"
    print(f"   production {scored['production']}")
    print(f"   costs      {scored['indicators']}")
    return scored


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--write", action="store_true",
                    help=f"write the answer to {os.path.relpath(ASSET, ROOT)}")
    args = ap.parse_args()

    with open(PACK) as fh:
        pack = json.load(fh)
    order = [t["id"] for t in pack["productionTypes"]]

    rounds = {}
    for rnd, with_consequences in ((1, False), (2, True)):
        per_type = {t: values(pack, t, with_consequences) for t in order}
        answer = solve(order, per_type)
        label = ("round 1 - production only, which is all the round shows"
                 if not with_consequences else
                 "round 2 - production net of consequences")
        report(pack, label, answer["pieces"], answer["score"], with_consequences)
        rounds[rnd] = answer

    # What round one's board is actually worth once the costs appear -- the gap the game is about.
    net = {t: values(pack, t, True) for t in order}
    blind = sum(net[t][a] for (t, a) in rounds[1]["pieces"])
    print(f"\nRound 1's optimum, scored as round 2 would score it: {blind}")
    print(f"Round 2's optimum:                                   {rounds[2]['score']}")
    print(f"The cost of optimising what you can see:             {rounds[2]['score'] - blind}")

    if args.write:
        out = {
            "_comment": "Generated by tools/optimizer/optimize.py -- do not edit by hand.",
            "dataset": "dataDynamicGridRect.json",
            "board": {"columns": pack["cols"], "rows": pack["rows"],
                      "elementSize": pack["placementSize"]},
            "rounds": {
                str(rnd): {
                    "score": rounds[rnd]["score"],
                    "pieces": [
                        {"productionType": LULC[t], "id": (y - 1) * pack["cols"] + (x - 1)}
                        for (t, (x, y)) in sorted(rounds[rnd]["pieces"],
                                                  key=lambda p: (p[0], p[1][1], p[1][0]))
                    ],
                } for rnd in rounds
            },
        }
        with open(ASSET, "w") as fh:
            json.dump(out, fh, indent="\t")
            fh.write("\n")
        print(f"\nwrote {os.path.relpath(ASSET, ROOT)}")


if __name__ == "__main__":
    main()
