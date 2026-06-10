"""Simple example calculator for the esgame dynamic stack.

On startup it preseeds GeoServer with the example consequence rasters (in ./data) as coverages.
On each level submit (the POST the frontend makes to calcUrl) it returns, per consequence-map id,
a GeoServer WCS GetCoverage URL for the matching coverage plus a simple allocation-based score.

This is a stand-in for the real R calculator: it serves the *static* example consequence maps
rather than computing new ones, which is enough to demonstrate the full dynamic architecture.
"""
import base64
import os
import threading
import time
import urllib.error
import urllib.request

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

GEOSERVER_URL = os.environ.get("GEOSERVER_URL", "http://localhost:8080/geoserver")               # in-cluster (preseed)
GEOSERVER_PUBLIC_URL = os.environ.get("GEOSERVER_PUBLIC_URL", "http://localhost:8080/geoserver")  # browser-facing
WORKSPACE = "esgame"
GS_AUTH = base64.b64encode(b"admin:geoserver").decode()
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

# consequence-map id (from data.json) -> (coverage name, per-service score factor)
CONSEQUENCES = {
    "110": ("ag_carbon", 0.8), "111": ("ag_habitat", 1.0), "112": ("ag_water", 0.6), "113": ("ag_hunt", 0.4),
    "120": ("ranch_carbon", 0.8), "121": ("ranch_habitat", 1.0), "122": ("ranch_water", 0.6), "123": ("ranch_hunt", 0.4),
}
AG_IDS = {"110", "111", "112", "113"}


def _gs(method, path, data=None, content_type=None):
    req = urllib.request.Request(f"{GEOSERVER_URL}{path}", data=data, method=method)
    req.add_header("Authorization", f"Basic {GS_AUTH}")
    if content_type:
        req.add_header("Content-Type", content_type)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def preseed():
    """Wait for GeoServer, create the workspace, and upload each consequence raster as a coverage."""
    for _ in range(120):
        try:
            if _gs("GET", "/rest/about/version.json") == 200:
                break
        except Exception:
            pass
        time.sleep(2)
    _gs("POST", "/rest/workspaces",
        data=f"<workspace><name>{WORKSPACE}</name></workspace>".encode(), content_type="text/xml")
    for fn in sorted(os.listdir(DATA_DIR)):
        if not fn.endswith(".tif"):
            continue
        name = fn[:-4]
        with open(os.path.join(DATA_DIR, fn), "rb") as f:
            code = _gs("PUT",
                       f"/rest/workspaces/{WORKSPACE}/coveragestores/{name}/file.geotiff?coverageName={name}",
                       data=f.read(), content_type="image/tiff")
        print(f"[calculator] preseed {name}: {code}", flush=True)
    print("[calculator] preseed complete", flush=True)


app = FastAPI(title="esgame example calculator")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def _startup():
    threading.Thread(target=preseed, daemon=True).start()


@app.get("/")
def health():
    return {"status": "ok"}


@app.post("/")
async def calculate(req: Request):
    body = await req.json()
    alloc = body.get("allocation", [])
    n_ag = sum(1 for a in alloc if str(a.get("lulc")) == "10")
    n_ranch = sum(1 for a in alloc if str(a.get("lulc")) == "20")
    total = max(len(alloc), 1)
    results = []
    for cid, (coverage, factor) in CONSEQUENCES.items():
        count = n_ag if cid in AG_IDS else n_ranch
        score = round(count / total * factor, 3)
        url = (f"{GEOSERVER_PUBLIC_URL}/wcs?service=WCS&version=2.0.1&request=GetCoverage"
               f"&coverageId={WORKSPACE}__{coverage}&format=image/tiff")
        results.append({"id": cid, "name": coverage, "score": score, "url": url})
    return {"results": results}
