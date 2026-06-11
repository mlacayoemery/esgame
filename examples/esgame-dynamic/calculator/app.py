"""Simple example calculator for the esgame dynamic stack.

On each level submit (the POST the frontend makes to calcUrl) it returns, per consequence-map id,
a browser-facing raster URL for the matching coverage plus a simple allocation-based score. The
URL is built from RASTER_URL_TEMPLATE, which defaults to a GeoServer WCS GetCoverage URL but can be
pointed at any read-only raster backend that returns a GeoTIFF (e.g. pygeoapi).

It does NOT seed/publish the rasters — that is the backend's job. This calculator is stateless.
"""
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

# Browser-facing GeoServer base URL (the WCS URLs the frontend fetches).
GEOSERVER_PUBLIC_URL = os.environ.get("GEOSERVER_PUBLIC_URL", "http://localhost:8080/geoserver")
WORKSPACE = "esgame"

# Per-coverage raster URL, browser-facing. ``{coverage}`` is replaced with the coverage name.
# Defaults to a GeoServer WCS GetCoverage URL (image/tiff). Override RASTER_URL_TEMPLATE to point
# at any other read-only raster backend that can return a GeoTIFF — e.g. pygeoapi
# (OGC API - Coverages), a drop-in lighter-weight alternative to GeoServer:
#   RASTER_URL_TEMPLATE=http://localhost:5005/collections/{coverage}/coverage?f=GTiff
RASTER_URL_TEMPLATE = os.environ.get(
    "RASTER_URL_TEMPLATE",
    f"{GEOSERVER_PUBLIC_URL}/wcs?service=WCS&version=2.0.1&request=GetCoverage"
    f"&coverageId={WORKSPACE}__{{coverage}}&format=image/tiff",
)

# consequence-map id (from data.json) -> (coverage name, per-service score factor)
CONSEQUENCES = {
    "110": ("ag_carbon", 0.8), "111": ("ag_habitat", 1.0), "112": ("ag_water", 0.6), "113": ("ag_hunt", 0.4),
    "120": ("ranch_carbon", 0.8), "121": ("ranch_habitat", 1.0), "122": ("ranch_water", 0.6), "123": ("ranch_hunt", 0.4),
}
AG_IDS = {"110", "111", "112", "113"}

app = FastAPI(title="esgame example calculator")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


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
        url = RASTER_URL_TEMPLATE.format(coverage=coverage)
        results.append({"id": cid, "name": coverage, "score": score, "url": url})
    return {"results": results}
