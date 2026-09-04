"""Guards for the optimiser and the answer it ships.

The interesting one is `test_branch_and_bound_is_exact`: the search prunes, so "it returned an
answer" says nothing about whether the answer is the best one. It is checked against exhaustive
enumeration on a board small enough to enumerate.
"""

import itertools
import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "tools", "calculator", "src"))

import model  # noqa: E402
import optimize  # noqa: E402


def load_pack():
    with open(optimize.PACK) as fh:
        return json.load(fh)


class PackMatchesTheShippedRasters(unittest.TestCase):
    """The premise of the whole tool: the model's grids ARE the maps the browser draws.

    Without this the optimiser could be solving a different board than the one the button loads,
    and every number it prints would still look reasonable.
    """

    # pack grid -> the raster dataGridExample.json/dataAgDynamic.json point at
    PAIRS = [
        ("pts_crop_ag", "esgame_img_ag.tif"),
        ("pts_past_ps", "esgame_img_ranch.tif"),
        ("pts_agcarb", "esgame_img_ag_carbon.tif"),
        ("pts_aghq", "esgame_img_ag_habitat.tif"),
        ("pts_agwq", "esgame_img_ag_water.tif"),
        ("pts_agrec", "esgame_img_ag_hunt.tif"),
        ("pts_pscarb", "esgame_img_ranch_carbon.tif"),
        ("pts_pshq", "esgame_img_ranch_habitat.tif"),
        ("pts_pswq", "esgame_img_ranch_water.tif"),
        ("pts_psrec", "esgame_img_ranch_hunt.tif"),
    ]

    def test_every_grid_equals_its_raster(self):
        try:
            from PIL import Image
        except ImportError:
            self.skipTest("Pillow not installed; cannot read the GeoTIFFs")
        pack = load_pack()
        images = os.path.join(ROOT, "v2", "src", "assets", "images")
        for key, tif in self.PAIRS:
            flat = [v for row in pack["maps"][key]["grid"] for v in row]
            raster = list(Image.open(os.path.join(images, tif)).getdata())
            self.assertEqual(flat, raster, f"{key} differs from {tif}")


class BranchAndBoundIsExact(unittest.TestCase):
    """Compared against enumerating every board, on a board small enough to enumerate."""

    @staticmethod
    def tiny_pack(grids):
        return {
            "cols": 5, "rows": 5, "placementSize": 2,
            "productionTypes": [
                {"id": "a", "production": "ga", "consequences": ["ca"]},
                {"id": "b", "production": "gb", "consequences": ["cb"]},
            ],
            "maps": {k: {"grid": g} for k, g in grids.items()},
        }

    @staticmethod
    def brute_force(pack, per_type, budget):
        """Every legal board, scored. Exponential on purpose -- it is the thing being trusted."""
        spots = optimize.anchors(pack)
        types = [t["id"] for t in pack["productionTypes"]]
        best = float("-inf")
        for combo in itertools.combinations(spots, budget * len(types)):
            for split in itertools.combinations(range(len(combo)), budget):
                first = [combo[i] for i in split]
                second = [combo[i] for i in range(len(combo)) if i not in split]
                chosen = [(types[0], a) for a in first] + [(types[1], a) for a in second]
                if any(optimize.overlaps(x[1], y[1])
                       for i, x in enumerate(chosen) for y in chosen[i + 1:]):
                    continue
                best = max(best, sum(per_type[t][a] for (t, a) in chosen))
        return best

    def test_agrees_with_exhaustive_search(self):
        # Deterministic pseudo-random grids: several different value landscapes, including one
        # where the best anchors DO collide, which is the case the bound has to get right.
        for seed in (1, 7, 19, 23):
            grids = {}
            for n, name in enumerate(("ga", "gb", "ca", "cb")):
                grids[name] = [[(seed * (r + 1) * 7 + (c + 1) * 13 + n * 31) % 40
                                for c in range(5)] for r in range(5)]
            pack = self.tiny_pack(grids)
            order = [t["id"] for t in pack["productionTypes"]]
            for with_consequences in (False, True):
                per_type = {t: optimize.values(pack, t, with_consequences) for t in order}
                found = optimize.solve(order, per_type, budget=2)
                expected = self.brute_force(pack, per_type, budget=2)
                self.assertEqual(found["score"], expected,
                                 f"seed {seed}, consequences={with_consequences}")

    def test_the_answer_it_returns_is_a_legal_board(self):
        pack = load_pack()
        order = [t["id"] for t in pack["productionTypes"]]
        per_type = {t: optimize.values(pack, t, True) for t in order}
        answer = optimize.solve(order, per_type)
        pieces = answer["pieces"]
        self.assertEqual(len(pieces), 2 * optimize.MAX_PIECES)
        for t in order:
            self.assertEqual(sum(1 for p in pieces if p[0] == t), optimize.MAX_PIECES)
        for i, x in enumerate(pieces):
            for y in pieces[i + 1:]:
                self.assertFalse(optimize.overlaps(x[1], y[1]), f"{x} overlaps {y}")


class TheShippedAnswer(unittest.TestCase):
    """What the button loads, checked against the model rather than against the writer."""

    def setUp(self):
        with open(optimize.ASSET) as fh:
            self.asset = json.load(fh)
        self.pack = load_pack()
        # frontend production type id -> pack type id
        self.to_pack = {v: k for k, v in optimize.LULC.items()}

    def pieces_of(self, rnd):
        cols = self.pack["cols"]
        return [{"type": self.to_pack[p["productionType"]],
                 "x": p["id"] % cols + 1, "y": p["id"] // cols + 1}
                for p in self.asset["rounds"][rnd]["pieces"]]

    def test_round_two_scores_what_it_claims(self):
        scored = model.score(self.pack, self.pieces_of("2"))
        self.assertEqual(scored["score"], self.asset["rounds"]["2"]["score"])

    def test_round_one_produces_what_it_claims(self):
        # Round one is scored on production alone: level 1 has no consequence boards.
        scored = model.score(self.pack, self.pieces_of("1"))
        self.assertEqual(sum(scored["production"].values()), self.asset["rounds"]["1"]["score"])

    def test_both_rounds_are_boards_the_game_would_accept(self):
        for rnd in ("1", "2"):
            pieces = self.pieces_of(rnd)
            self.assertEqual(len(pieces), 2 * optimize.MAX_PIECES, rnd)
            for t in ("farm", "ranch"):
                self.assertEqual(sum(1 for p in pieces if p["type"] == t),
                                 optimize.MAX_PIECES, rnd)
            for i, a in enumerate(pieces):
                self.assertTrue(1 <= a["x"] <= self.pack["cols"] - 1, rnd)
                self.assertTrue(1 <= a["y"] <= self.pack["rows"] - 1, rnd)
                for b in pieces[i + 1:]:
                    self.assertFalse(optimize.overlaps((a["x"], a["y"]), (b["x"], b["y"])),
                                     f"round {rnd}: {a} overlaps {b}")

    def test_the_board_matches_the_dataset_the_frontend_plays(self):
        data = os.path.join(ROOT, "v2", "src", "assets", "dataAgDynamic.json")
        with open(data) as fh:
            dataset = json.load(fh)
        self.assertEqual(self.asset["board"]["columns"], dataset["gameBoardColumns"])
        self.assertEqual(self.asset["board"]["rows"], dataset["gameBoardRows"])
        self.assertEqual(self.asset["board"]["elementSize"], dataset["elementSize"])
        for pt in dataset["productionTypes"]:
            self.assertEqual(pt["maxElements"], optimize.MAX_PIECES)

    # The lesson the two rounds are built to teach, pinned so a data change that erases it is
    # visible: the board that maximises what round one SHOWS is not the board that scores best
    # once round two reveals what it cost.
    def test_the_blind_optimum_is_worse_than_the_informed_one(self):
        blind = model.score(self.pack, self.pieces_of("1"))["score"]
        informed = model.score(self.pack, self.pieces_of("2"))["score"]
        self.assertLess(blind, informed)


if __name__ == "__main__":
    unittest.main()
