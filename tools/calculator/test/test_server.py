"""The HTTP surface: what a caller actually meets.

    cd tools/calculator && python3 -m unittest discover -s test -t test

test_model.py proves the arithmetic. This proves the parts around it that are just as capable of
serving a wrong answer confidently: a body that is not JSON, an allocation that is not a list, a
placement whose coordinates are strings, a route that does not exist. Each of those has a
recognisable wrong behaviour — 500, or a 200 carrying a score computed from nothing — and the point
is that none of them happens.

The server is started in-process on an ephemeral port rather than mocked, because the thing under
test IS the request handling.
"""
import json
import pathlib
import sys
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))

import server  # noqa: E402


class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}"
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=5)

    def request(self, path, data=None, method=None, raw=None):
        body = raw if raw is not None else (json.dumps(data).encode() if data is not None else None)
        req = urllib.request.Request(
            self.base + path, data=body, method=method or ("POST" if body else "GET"),
            headers={"Content-Type": "application/json"} if body else {})
        try:
            with urllib.request.urlopen(req, timeout=10) as res:
                return res.status, res.read(), res.headers
        except urllib.error.HTTPError as err:
            return err.code, err.read(), err.headers

    def json_request(self, *args, **kwargs):
        status, body, headers = self.request(*args, **kwargs)
        return status, json.loads(body), headers


class ItAnswers(ServerTest):
    def test_health(self):
        status, body, _ = self.json_request("/health")
        self.assertEqual(status, 200)
        self.assertEqual(body["status"], "ok")

    def test_openapi_describes_this_pack(self):
        status, spec, _ = self.json_request("/openapi.json")
        self.assertEqual(status, 200)
        # Generated from the pack, not written beside it — so it must agree with the pack.
        enum = spec["components"]["schemas"]["Placement"]["properties"]["type"]["enum"]
        self.assertEqual(enum, [t["id"] for t in server.PACK["productionTypes"]])
        self.assertEqual(
            spec["components"]["schemas"]["Placement"]["properties"]["x"]["maximum"],
            server.PACK["cols"])

    def test_the_documented_example_actually_works(self):
        # An example in a spec that nobody runs is a promise, not a fact.
        _, spec, _ = self.json_request("/openapi.json")
        example = (spec["paths"]["/score"]["post"]["requestBody"]["content"]["application/json"]
                   ["examples"]["one"]["value"])
        status, body, _ = self.json_request("/score", example)
        self.assertEqual(status, 200, body)
        self.assertIn("score", body)

    def test_docs_page_is_served(self):
        status, body, headers = self.request("/docs")
        self.assertEqual(status, 200)
        self.assertIn("text/html", headers["Content-Type"])
        self.assertIn(b"openapi.json", body)

    def test_pack_summary_omits_the_grids(self):
        status, body, _ = self.json_request("/pack")
        self.assertEqual(status, 200)
        for m in body["maps"].values():
            self.assertNotIn("grid", m)

    def test_cors_is_allowed(self):
        # The browser posts to this directly, exactly as it does to the R calculator.
        _, _, headers = self.json_request("/health")
        self.assertEqual(headers["Access-Control-Allow-Origin"], "*")
        status, _, headers = self.request("/score", method="OPTIONS")
        self.assertEqual(status, 204)
        self.assertIn("POST", headers["Access-Control-Allow-Methods"])


class ItRefuses(ServerTest):
    def test_a_body_that_is_not_json(self):
        status, body, _ = self.json_request("/score", raw=b"{nope")
        self.assertEqual(status, 400)
        self.assertIn("not valid JSON", body["error"])

    def test_a_missing_allocation(self):
        status, body, _ = self.json_request("/score", {"setAsides": []})
        self.assertEqual(status, 400)
        self.assertIn("allocation", body["error"])

    def test_an_allocation_that_is_not_a_list(self):
        status, _, _ = self.json_request("/score", {"allocation": {"type": "farm", "x": 1, "y": 1}})
        self.assertEqual(status, 400)

    def test_coordinates_that_are_strings(self):
        # json.loads happily produces {"x": "10"}, and "10" - 1 would be a 500 several frames later.
        status, body, _ = self.json_request("/score", {"allocation": [{"type": "farm", "x": "10", "y": 10}]})
        self.assertEqual(status, 400)
        self.assertIn("integer", body["error"])

    def test_a_placement_off_the_board(self):
        status, body, _ = self.json_request(
            "/score", {"allocation": [{"type": "farm", "x": server.PACK["cols"], "y": 5}]})
        self.assertEqual(status, 400)
        self.assertIn("off a", body["error"])

    def test_an_unknown_production_type(self):
        status, body, _ = self.json_request("/score", {"allocation": [{"type": "orchard", "x": 5, "y": 5}]})
        self.assertEqual(status, 400)
        self.assertIn("orchard", body["error"])

    def test_get_on_score(self):
        status, _, _ = self.json_request("/score", method="GET")
        self.assertEqual(status, 404)

    def test_an_unknown_route(self):
        status, _, _ = self.json_request("/nothing")
        self.assertEqual(status, 404)


if __name__ == "__main__":
    unittest.main()


class TheCellFormAndValidationOverHttp(ServerTest):
    """The two things the model gained, as a caller meets them."""

    def test_a_piece_given_as_cells(self):
        status, body, _ = self.json_request("/score", {"allocation": [
            {"type": "farm", "cells": [{"x": 10, "y": 10}, {"x": 11, "y": 10}, {"x": 10, "y": 11}]}]})
        self.assertEqual(status, 200, body)
        self.assertEqual(body["cells"]["farm"], 3)

    def test_overlapping_pieces_are_refused_by_default(self):
        status, body, _ = self.json_request("/score", {"allocation": [
            {"type": "farm", "x": 10, "y": 10}, {"type": "farm", "x": 11, "y": 10}]})
        self.assertEqual(status, 400)
        self.assertIn("claimed by two pieces", body["error"])

    def test_validation_false_scores_them(self):
        status, body, _ = self.json_request("/score", {"validation": False, "allocation": [
            {"type": "farm", "x": 10, "y": 10}, {"type": "farm", "x": 11, "y": 10}]})
        self.assertEqual(status, 200, body)
        self.assertEqual(body["cells"]["farm"], 7)

    def test_an_oversized_footprint_is_refused(self):
        status, body, _ = self.json_request("/score", {"allocation": [
            {"type": "farm", "cells": [{"x": 3, "y": 3}, {"x": 9, "y": 3}]}]})
        self.assertEqual(status, 400)
        self.assertIn("fits inside", body["error"])

    def test_validation_must_be_a_boolean(self):
        status, body, _ = self.json_request("/score", {"validation": "yes", "allocation": []})
        self.assertEqual(status, 400)
        self.assertIn("validation", body["error"])

    def test_the_spec_documents_both_forms(self):
        _, spec, _ = self.json_request("/openapi.json")
        placement = spec["components"]["schemas"]["Placement"]
        self.assertIn("cells", placement["properties"])
        self.assertEqual(placement["required"], ["type"])
        self.assertIn("validation", spec["components"]["schemas"]["ScoreRequest"]["properties"])


class ItServesTheEsgameFrontend(ServerTest):
    """POST /esgame — the route v2's dynamic mode posts to.

    The frontend cannot be asked to adapt: it sends {allocation:[{id, lulc}]} and reads back a
    score and a fetchable raster URL per consequence board, because that is what
    tools/R/calculator.r returns. These pin this end of that contract, so dataDynamicGridRect.json can be
    played against this model rather than only against the R one.
    """

    # ANCHOR cells, not lattice zones: a piece is a 2 x 2 block whose top-left cell the frontend
    # posts, and it may be anchored anywhere. Chosen greedily for cost AND mutual disjointness —
    # the highest-scoring anchors are adjacent and overlap, which validation rightly refuses, and
    # most of this board is zero, so an allocation picked by eye would let every assertion below
    # pass against a model that had done nothing at all.
    FARM = [552, 554, 424, 550]
    RANCH = [498, 464, 606, 215]

    def a_round(self, **over):
        body = {"allocation": [{"id": z, "lulc": 10} for z in self.FARM]
                             + [{"id": z, "lulc": 20} for z in self.RANCH],
                "round": 2, "score": 9725, "game_id": "test"}
        body.update(over)
        return body

    def test_a_round_scores_every_consequence_board(self):
        status, body, _ = self.json_request("/esgame", self.a_round())
        self.assertEqual(status, 200, body)
        got = [r["id"] for r in body["results"]]
        # Exactly the consequence ids in examples/dataDynamicGridRect.json. A missing one is not a
        # cosmetic gap: prepareNextLevel looks each board's id up in the response and assigns the
        # url it finds, so an absent id becomes urlToData undefined and the level fails to build.
        self.assertEqual(got, ["4", "5", "6", "7", "8", "9", "10", "11"])

    def test_the_scores_are_real_numbers_on_a_0_100_scale(self):
        _, body, _ = self.json_request("/esgame", self.a_round())
        scores = [r["score"] for r in body["results"]]
        for s in scores:
            self.assertIsInstance(s, int)
            self.assertGreaterEqual(s, 0)
            self.assertLessEqual(s, 100)
        # And they are not all zero, which is what this would report if the allocation never
        # reached the model — a 200 full of zeroes being the shape that looks like a working round.
        self.assertTrue(any(s > 0 for s in scores), scores)

    def test_moving_the_allocation_moves_the_scores(self):
        """The scores depend on WHERE things went, not merely on how many there were."""
        _, hot, _ = self.json_request("/esgame", self.a_round())
        # Anchors four columns apart, so the 2 x 2 pieces do not overlap each other — adjacent
        # ids would, now that an id is a cell rather than a lattice slot.
        cold = self.a_round(allocation=[{"id": z, "lulc": 10} for z in (0, 4, 8, 12)])
        _, mild, _ = self.json_request("/esgame", cold)
        self.assertNotEqual([r["score"] for r in hot["results"]],
                            [r["score"] for r in mild["results"]])

    def test_urls_point_at_the_browser_facing_asset_base(self):
        _, body, _ = self.json_request("/esgame", self.a_round())
        for r in body["results"]:
            self.assertTrue(r["url"].startswith(server.ASSET_BASE + "/assets/images/"), r["url"])
            self.assertTrue(r["url"].endswith(".tif"), r["url"])

    def test_unallocated_land_is_ignored_not_refused(self):
        """The frontend posts EVERY field each round, allocated or not."""
        body = self.a_round()
        body["allocation"] += [{"id": z, "lulc": 0} for z in range(1, 30)]
        status, got, _ = self.json_request("/esgame", body)
        self.assertEqual(status, 200, got)
        self.assertTrue(any(r["score"] > 0 for r in got["results"]))

    def test_an_empty_round_is_refused(self):
        status, body, _ = self.json_request("/esgame", {"allocation": []})
        self.assertEqual(status, 400)
        self.assertIn("empty", body["error"])

    def test_a_field_off_the_board_is_named(self):
        status, body, _ = self.json_request("/esgame", {"allocation": [{"id": 812, "lulc": 10}]})
        self.assertEqual(status, 400)
        self.assertIn("not on this", body["error"])

    def test_a_piece_that_would_run_off_the_board_is_refused(self):
        # The frontend slides such a piece back on (getAssociatedFields), so one arriving here
        # means the two sides disagree about the board. Refused rather than quietly moved.
        last_column = 27          # x = 28, so a 2 x 2 piece needs column 29
        status, body, _ = self.json_request("/esgame", {"allocation": [{"id": last_column, "lulc": 10}]})
        self.assertEqual(status, 400)
        self.assertIn("runs off", body["error"])

    def test_the_same_cells_cannot_be_claimed_twice(self):
        both = [{"id": 552, "lulc": 10}, {"id": 552, "lulc": 20}]
        status, body, _ = self.json_request("/esgame", {"allocation": both})
        self.assertEqual(status, 400)
        self.assertIn("cannot be counted twice", body["error"])

    def test_field_ids_are_the_raster_index_the_frontend_places_in(self):
        import esgame
        # id 0 is the top-left cell, ids run along rows, and a row is COLS wide. This is the id
        # space GameService.getAssociatedFields does `id + j * columns` in, which is what lets a
        # piece be anchored on ANY cell rather than snapped to a 2 x 2 lattice.
        self.assertEqual(esgame.anchor_of(0), (1, 1))
        self.assertEqual(esgame.anchor_of(1), (2, 1))
        self.assertEqual(esgame.anchor_of(esgame.COLS), (1, 2))
        self.assertEqual(esgame.anchor_of(esgame.COLS + 1), (2, 2))

    def test_a_piece_may_be_anchored_one_cell_over(self):
        """Placement has single-cell granularity, as the grid game's does."""
        near = self.a_round(allocation=[{"id": 552, "lulc": 10}])
        over = self.a_round(allocation=[{"id": 553, "lulc": 10}])
        _, a, _ = self.json_request("/esgame", near)
        _, b, _ = self.json_request("/esgame", over)
        # Shifting by ONE cell is a different allocation, and must score differently. If the board
        # still snapped to a 2 x 2 lattice these two would round to the same piece.
        self.assertNotEqual([r["score"] for r in a["results"]],
                            [r["score"] for r in b["results"]])
