"""The service must reproduce the original game.js, allocation for allocation.

    python3 -m unittest discover -s tools/calculator/test -t .

golden/allocations.json holds 200 allocations and the totals calc_files/game.js itself produced for
them, written by extract/make-golden.mjs. This is the only check here that means anything: a
reimplementation of a thirteen-year-old scoring script is exactly the kind of thing that looks
right, passes its own unit tests, and disagrees with the game it claims to reproduce for
allocations nobody thought to try — the 2x2 skirt, the farm-beats-ranch overlap rule, the [y][x]
flip and the double-counting of overlapping blocks are each one transposition away from silently
wrong numbers.

extract/golden.test.mjs separately re-derives that fixture from game.js and diffs it, so it cannot
quietly become a record of what this file happens to do.
"""
import json
import pathlib
import sys
import unittest

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))

from model import Refused, score  # noqa: E402

PACK = json.loads((HERE.parent / "data" / "tradeoff-ag.json").read_text())
GOLDEN = json.loads((HERE.parent / "golden" / "allocations.json").read_text())

# The original's output fields, and what they are called here.
INDICATORS = {"hq_total": "habitat-quality", "c_total": "carbon",
              "hf_total": "hunting", "wq_total": "water-quality"}


def as_allocation(case):
    return ([{"type": "farm", **p} for p in case["farms"]]
            + [{"type": "ranch", **p} for p in case["ranches"]])


class TheOriginalIsReproduced(unittest.TestCase):
    def test_every_golden_allocation(self):
        cases = GOLDEN["cases"]
        # A fixture that had lost its cases would make every assertion below vacuous.
        self.assertGreaterEqual(len(cases), 200)
        self.assertGreaterEqual(sum(1 for c in cases if c["expected"]["score"] != 0), len(cases) // 2)

        for i, case in enumerate(cases):
            # validation=False: the fixture reproduces game.js, which counts overlapping cells
            # twice. Under validation those allocations are refused instead — see
            # TheModelRefusesWhatItCannotScore below, and the module docstring for why the default
            # is the other way round.
            got = score(PACK, as_allocation(case), case["setAsides"], validation=False)
            want = case["expected"]
            where = f"case #{i}: {json.dumps({k: case[k] for k in ('farms', 'ranches', 'setAsides')})}"
            with self.subTest(case=i):
                self.assertEqual(got["production"]["farm"], want["a_total"], f"farm total, {where}")
                self.assertEqual(got["production"]["ranch"], want["r_total"], f"ranch total, {where}")
                self.assertEqual(got["positive"], want["pos_total"], f"positive, {where}")
                for field, name in INDICATORS.items():
                    self.assertEqual(got["indicators"][name], want[field], f"{name}, {where}")
                self.assertEqual(got["negative"], want["neg_total"], f"negative, {where}")
                self.assertEqual(got["score"], want["score"], f"overall, {where}")


class TheModelRefusesWhatItCannotScore(unittest.TestCase):
    def test_a_placement_that_leaves_the_board(self):
        # The original scores NaN here; this refuses. Deliberate, and the reason the golden fixture
        # keeps its coordinates in bounds.
        with self.assertRaises(Refused) as caught:
            score(PACK, [{"type": "farm", "x": PACK["cols"], "y": 5}])
        self.assertIn("off a", str(caught.exception))

    def test_off_the_board_is_refused_even_with_validation_off(self):
        # The one place this parts company with game.js in BOTH modes. The original indexes past
        # the end of a row and the total becomes NaN, which no caller can act on.
        with self.assertRaises(Refused):
            score(PACK, [{"type": "farm", "x": PACK["cols"], "y": 5}], validation=False)

    def test_the_far_corner_is_in_bounds(self):
        # Guards the check above from being off by one: a placement whose whole 2x2 block is on the
        # board must be accepted, including the last one that fits.
        got = score(PACK, [{"type": "farm", "x": PACK["cols"] - 1, "y": PACK["rows"] - 1}])
        self.assertEqual(got["cells"]["farm"], 4)

    def test_an_unknown_production_type(self):
        with self.assertRaises(Refused) as caught:
            score(PACK, [{"type": "orchard", "x": 5, "y": 5}])
        self.assertIn("orchard", str(caught.exception))

    def test_an_empty_allocation_scores_zero(self):
        self.assertEqual(score(PACK, [])["score"], 0)


class ThePackIsWhatItClaims(unittest.TestCase):
    def test_shape(self):
        self.assertEqual(PACK["rows"], 29)
        self.assertEqual(PACK["cols"], 28)
        for name, m in PACK["maps"].items():
            self.assertEqual(len(m["grid"]), PACK["rows"], name)
            for row in m["grid"]:
                self.assertEqual(len(row), PACK["cols"], name)

    def test_every_named_map_exists(self):
        for t in PACK["productionTypes"]:
            for name in [t["production"], *t["consequences"]]:
                self.assertIn(name, PACK["maps"])
        for indicator in PACK["indicators"]:
            for name in indicator["maps"]:
                self.assertIn(name, PACK["maps"])


if __name__ == "__main__":
    unittest.main()


class ValidationIsOnByDefault(unittest.TestCase):
    """The rules the 2013 PAGE enforced, which a service reachable by anything else must enforce.

    game.js summed whatever arrived because the form it read could not express anything else. Split
    the calculator out and that stops being true.
    """

    def scoring_cell(self):
        """A cell where a 2x2 farm scores something, found in the pack rather than guessed."""
        grid = PACK["maps"]["pts_crop_ag"]["grid"]
        for y in range(1, PACK["rows"]):
            for x in range(1, PACK["cols"]):
                if grid[y - 1][x - 1] > 0:
                    return x, y
        self.fail("the farm production map is entirely zero")

    def test_cells_are_never_counted_twice(self):
        x, y = self.scoring_cell()
        overlapping = [{"type": "farm", "x": x, "y": y}, {"type": "farm", "x": x + 1, "y": y}]
        with self.assertRaises(Refused) as caught:
            score(PACK, overlapping)
        self.assertIn("claimed by two pieces", str(caught.exception))

    def test_the_original_counts_them_twice(self):
        # The behaviour being refused above, and proof the flag actually switches something: the
        # same allocation scores MORE with validation off, because the shared column is counted
        # once for each piece.
        x, y = self.scoring_cell()
        overlapping = [{"type": "farm", "x": x, "y": y}, {"type": "farm", "x": x + 1, "y": y}]
        loose = score(PACK, overlapping, validation=False)
        # Two 2x2 blocks one column apart cover SIX distinct cells (x..x+2, y..y+1). game.js
        # scores SEVEN: the skirt is filtered against the original anchors — so (x+1, y) is not
        # re-added — but never against the other skirt cells, so (x+1, y+1) goes in once for each
        # piece. Seven against six distinct is the double-count, exactly.
        distinct = 6
        self.assertEqual(loose["cells"]["farm"], distinct + 1,
                         "game.js counts the shared skirt cell twice")

    def test_a_piece_may_be_missing_cells(self):
        # The reason the cell form exists: a round in which individual cells are given back.
        x, y = self.scoring_cell()
        whole = score(PACK, [{"type": "farm", "x": x, "y": y}])
        partial = score(PACK, [{"type": "farm", "cells": [
            {"x": x, "y": y}, {"x": x + 1, "y": y}, {"x": x, "y": y + 1}]}])
        self.assertEqual(whole["cells"]["farm"], 4)
        self.assertEqual(partial["cells"]["farm"], 3)
        self.assertNotEqual(partial["positive"], whole["positive"])

    def test_the_cell_form_agrees_with_the_anchor_form(self):
        # Same four cells, said two ways, must score the same — or the two input forms are two
        # models and only one of them is tested.
        x, y = self.scoring_cell()
        anchored = score(PACK, [{"type": "farm", "x": x, "y": y}])
        spelled = score(PACK, [{"type": "farm", "cells": [
            {"x": x, "y": y}, {"x": x + 1, "y": y},
            {"x": x, "y": y + 1}, {"x": x + 1, "y": y + 1}]}])
        self.assertEqual(anchored, spelled)

    def test_a_piece_must_fit_its_footprint(self):
        # Cells may be missing; the ones present must still fit inside placementSize x
        # placementSize, or "a 2x2 farm" is four cells scattered across the map.
        with self.assertRaises(Refused) as caught:
            score(PACK, [{"type": "farm", "cells": [{"x": 3, "y": 3}, {"x": 9, "y": 3}]}])
        self.assertIn("fits inside", str(caught.exception))

    def test_the_footprint_check_uses_both_axes(self):
        with self.assertRaises(Refused):
            score(PACK, [{"type": "farm", "cells": [{"x": 3, "y": 3}, {"x": 3, "y": 9}]}])

    def test_a_piece_cannot_list_the_same_cell_twice(self):
        with self.assertRaises(Refused) as caught:
            score(PACK, [{"type": "farm", "cells": [{"x": 3, "y": 3}, {"x": 3, "y": 3}]}])
        self.assertIn("same cell twice", str(caught.exception))

    def test_cells_must_be_integers(self):
        with self.assertRaises(Refused):
            score(PACK, [{"type": "farm", "cells": [{"x": "3", "y": 3}]}])

    def test_two_types_cannot_share_a_cell_either(self):
        x, y = self.scoring_cell()
        with self.assertRaises(Refused):
            score(PACK, [{"type": "farm", "x": x, "y": y}, {"type": "ranch", "x": x, "y": y}])

    def test_a_valid_neighbouring_pair_is_accepted(self):
        # Guards every refusal above from passing on everything: pieces that merely touch are fine.
        x, y = self.scoring_cell()
        got = score(PACK, [{"type": "farm", "x": x, "y": y},
                           {"type": "ranch", "x": x + 2, "y": y}])
        self.assertEqual(got["cells"]["farm"], 4)
        self.assertEqual(got["cells"]["ranch"], 4)
