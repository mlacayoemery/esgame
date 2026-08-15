"""A small HTTP service that scores allocations against the static game's board.

    python3 tools/calculator/src/server.py

    PORT             8000
    PACK             path to a model pack (default ../data/tradeoff-ag.json)
    ALLOWED_ORIGIN   Access-Control-Allow-Origin (default *, as the R calculator sends)

NO DEPENDENCIES, ON PURPOSE. The standard library is the whole runtime, so the image is a base image
plus about 30 KB of source and the dependency review has nothing to say about it. Measured on
2026-08-15, the alternatives for a service whose model is a signed sum over a 29 x 28 grid of
integers:

    python:3.13-alpine + this          70 MB
    oven/bun:1-alpine                 146 MB
    node:26-alpine                    251 MB
    the R calculator beside it      2,590 MB

The docs page is hand-rolled for the same reason. swagger-ui-dist would be ~10 MB of vendored
JavaScript to audit and update, and the frontend in this repository is held to
``resource-summary:third-party:size <= 0`` — pulling a CDN script in here would be the one place
that rule is not applied.

ThreadingHTTPServer rather than an ASGI stack: the R calculator this sits beside is single-threaded
plumber sustaining about one concurrent player, and this model answers in under a millisecond. The
constraint that made a real server worth having there does not exist here.
"""
import json
import os
import pathlib
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from model import Refused, score  # noqa: E402
from openapi import openapi  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "8000"))
PACK_PATH = pathlib.Path(os.environ.get("PACK", HERE.parent / "data" / "tradeoff-ag.json")).resolve()
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")
MAX_BODY = 1_000_000


def load_pack(path):
    """Read and validate the pack, at STARTUP.

    A calculator whose pack is missing or malformed should not come up. The alternative is a service
    that passes every health check and 500s on every round, which is the exact shape the dynamic
    compose stack next door was in for months: healthy containers, GDAL error 4, and a frontend
    reporting that 0% of the round reached the model.
    """
    try:
        pack = json.loads(path.read_text())
    except OSError as cause:
        sys.exit(f"[calc] ERROR: cannot read the model pack at {path}: {cause}")
    except json.JSONDecodeError as cause:
        sys.exit(f"[calc] ERROR: {path} is not valid JSON: {cause}")

    problems = []
    for field in ("rows", "cols"):
        if not isinstance(pack.get(field), int) or pack[field] < 1:
            problems.append(f"{field} is not a positive integer")
    if not pack.get("productionTypes"):
        problems.append("no productionTypes")
    if not isinstance(pack.get("indicators"), list):
        problems.append("no indicators")
    for t in pack.get("productionTypes", []):
        for name in [t.get("production"), *t.get("consequences", [])]:
            if name not in pack.get("maps", {}):
                problems.append(f'production type "{t.get("id")}" names map "{name}", '
                                "which the pack does not have")
    # Shape, not just presence: a grid one row short scores every allocation reaching the last row
    # as an IndexError, and nothing else here would notice until a player hit it.
    for name, m in pack.get("maps", {}).items():
        grid = m.get("grid")
        if not isinstance(grid, list) or len(grid) != pack.get("rows"):
            problems.append(f'map "{name}" has {len(grid) if isinstance(grid, list) else "no"} rows, '
                            f'expected {pack.get("rows")}')
            continue
        for i, row in enumerate(grid):
            if not isinstance(row, list) or len(row) != pack["cols"]:
                problems.append(f'map "{name}" row {i} has '
                                f'{len(row) if isinstance(row, list) else "no"} cols, '
                                f'expected {pack["cols"]}')
                break
    if problems:
        print(f"[calc] ERROR: {path} is not a usable model pack:", file=sys.stderr)
        for problem in problems:
            print(f"[calc]        - {problem}", file=sys.stderr)
        raise SystemExit(1)
    return pack


PACK = load_pack(PACK_PATH)
SPEC = openapi(PACK)
# The pack without its grids — 8,120 numbers nobody wants in a summary.
PACK_SUMMARY = {**PACK, "maps": {k: {"description": v.get("description")}
                                 for k, v in PACK["maps"].items()}}

DOCS = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>esgame static calculator</title>
<style>
:root{color-scheme:light dark}
body{font:16px/1.5 system-ui,sans-serif;margin:0 auto;padding:2rem 1.25rem;max-width:52rem}
code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
pre{background:color-mix(in srgb,currentColor 8%,transparent);padding:.75rem 1rem;border-radius:6px;overflow-x:auto}
.m{display:inline-block;padding:.1rem .5rem;border-radius:4px;background:color-mix(in srgb,currentColor 15%,transparent);font-size:.85em}
h2{margin-top:2rem}table{border-collapse:collapse;width:100%}
td,th{text-align:left;padding:.3rem .6rem;border-bottom:1px solid color-mix(in srgb,currentColor 20%,transparent)}
</style></head><body>
<h1>esgame static calculator</h1>
<p id="about"></p>
<p>The machine-readable description is at <a href="openapi.json"><code>openapi.json</code></a>.</p>
<div id="paths"></div>
<h2>Try it</h2>
<pre id="curl"></pre>
<script>
fetch('openapi.json').then(r => r.json()).then(spec => {
  document.getElementById('about').textContent = spec.info.description.split('\\n\\n')[0];
  const out = [];
  for (const [path, ops] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(ops)) {
      out.push('<h2><span class="m">' + method.toUpperCase() + '</span> <code>' + path + '</code></h2>');
      out.push('<p>' + op.summary + '</p>');
      const codes = Object.entries(op.responses).map(([c, r]) =>
        '<tr><td><code>' + c + '</code></td><td>' + r.description + '</td></tr>');
      out.push('<table><tr><th>Status</th><th></th></tr>' + codes.join('') + '</table>');
    }
  }
  document.getElementById('paths').innerHTML = out.join('');
  const ex = spec.paths['/score'].post.requestBody.content['application/json'].examples.one.value;
  document.getElementById('curl').textContent =
    "curl -s -X POST " + location.origin + "/score \\\\\\n  -H 'Content-Type: application/json' \\\\\\n  -d '"
    + JSON.stringify(ex) + "'";
});
</script></body></html>"""


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "esgame-calc"
    sys_version = ""

    def log_message(self, fmt, *args):
        print(f"[calc] {self.address_string()} {fmt % args}")

    def _send(self, status, body, content_type="application/json"):
        payload = (json.dumps(body) if content_type == "application/json" else body).encode()
        self.send_response(status)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
        self.end_headers()
        self.wfile.write(payload)

    @property
    def _path(self):
        return self.path.split("?")[0].rstrip("/") or "/"

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers",
                         self.headers.get("Access-Control-Request-Headers", "Content-Type"))
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        path = self._path
        if path in ("/", "/docs"):
            return self._send(200, DOCS, "text/html")
        if path == "/openapi.json":
            return self._send(200, SPEC)
        if path == "/pack":
            return self._send(200, PACK_SUMMARY)
        if path == "/health":
            return self._send(200, {"status": "ok", "pack": PACK["id"]})
        self._send(404, {"error": f"no route for GET {path}; see /openapi.json"})

    def do_POST(self):
        if self._path != "/score":
            return self._send(404, {"error": f"no route for POST {self._path}; see /openapi.json"})

        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            # An allocation is a few dozen small objects. Anything approaching a megabyte is a
            # mistake or an attempt, and either way it should not be buffered.
            return self._send(413, {"error": "request body is too large"})
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError as cause:
            return self._send(400, {"error": f"the request body is not valid JSON: {cause}"})

        if not isinstance(body, dict) or not isinstance(body.get("allocation"), list):
            return self._send(400, {"error": 'the request needs an "allocation" array of {type, x, y}'})
        set_asides = body.get("setAsides", [])
        if not isinstance(set_asides, list):
            return self._send(400, {"error": '"setAsides" must be an array of {x, y}'})
        # Shape only. A placement is either {x, y} or {cells: [...]}, and which fields each form
        # needs is the model's business — it raises Refused naming the piece and the coordinate,
        # which is more use than anything that could be said from here.
        for p in [*body["allocation"], *set_asides]:
            if not isinstance(p, dict):
                return self._send(400, {"error": f"every placement must be an object; got {p!r}"})

        validation = body.get("validation", True)
        if not isinstance(validation, bool):
            return self._send(400, {"error": '"validation" must be true or false'})

        try:
            return self._send(200, score(PACK, body["allocation"], set_asides, validation))
        except Refused as cause:
            # The model refusing the allocation is the caller's business.
            return self._send(400, {"error": str(cause)})
        except Exception:  # noqa: BLE001 — anything else is this service being broken, not them
            import traceback
            print(f"[calc] ERROR scoring:\n{traceback.format_exc()}", file=sys.stderr)
            return self._send(500, {"error": "the allocation could not be scored"})


def main():
    print(f'[calc] pack "{PACK["id"]}" from {PACK_PATH}: '
          f'{PACK["cols"]} x {PACK["rows"]}, {len(PACK["productionTypes"])} production types, '
          f'{len(PACK["indicators"])} indicators')
    print(f"[calc] listening on 0.0.0.0:{PORT} — docs at /docs, spec at /openapi.json")
    sys.stdout.flush()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        # Without this the container takes the full SIGKILL grace on every rollout.
        server.server_close()


if __name__ == "__main__":
    main()
