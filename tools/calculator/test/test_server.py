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
