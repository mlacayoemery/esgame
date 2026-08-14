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
            got = score(PACK, as_allocation(case), case["setAsides"])
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
