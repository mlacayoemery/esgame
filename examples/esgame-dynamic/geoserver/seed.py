#!/usr/bin/env python3
"""One-shot GeoServer seeder for the esgame dynamic example.

Idempotent. Registers each /rasters/*.tif as an EXTERNAL GeoTIFF coverage (GeoServer references the
file in place and stores only the catalog config in its persistent data dir), then creates a raster
style per palette from palettes.json and sets it as the matching coverage's default style.

After the first run GeoServer reloads everything from its data dir on boot - no re-seeding.
"""
import base64
import json
import os
import time
import urllib.error
import urllib.request

GS = os.environ.get("GEOSERVER_URL", "http://geoserver:8080/geoserver")
WS = "esgame"
AUTH = base64.b64encode(b"admin:geoserver").decode()
RASTERS = os.environ.get("RASTERS_DIR", "/rasters")
PALETTES_FILE = os.environ.get("PALETTES_FILE", "/palettes.json")


def gs(method, path, data=None, ctype=None):
    req = urllib.request.Request(GS + path, data=data, method=method)
    req.add_header("Authorization", "Basic " + AUTH)
    if ctype:
        req.add_header("Content-Type", ctype)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def exists(path):
    return gs("GET", path) == 200


def wait_for_geoserver():
    for _ in range(120):
        try:
            if gs("GET", "/rest/about/version.json") == 200:
                return
        except Exception:
            pass
        time.sleep(2)


def sld(name, colors, vmin, vmax):
    n = len(colors)
    entries = "".join(
        f'<ColorMapEntry color="{c}" quantity="{vmin + (vmax - vmin) * i / (n - 1):.3f}"/>'
        for i, c in enumerate(colors)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld"'
        ' xmlns:ogc="http://www.opengis.net/ogc">'
        f'<NamedLayer><Name>{name}</Name><UserStyle><Name>{name}</Name>'
        '<FeatureTypeStyle><Rule><RasterSymbolizer>'
        f'<ColorMap type="ramp">{entries}</ColorMap>'
        '</RasterSymbolizer></Rule></FeatureTypeStyle></UserStyle></NamedLayer>'
        '</StyledLayerDescriptor>'
    )


def main():
    cfg = json.load(open(PALETTES_FILE))
    palettes = cfg["palettes"]
    coverage_styles = cfg["coverageStyles"]
    vr = cfg.get("valueRange", {})
    vmin, vmax = vr.get("min", 0), vr.get("max", 125)

    print(f"[seed] waiting for GeoServer at {GS} ...", flush=True)
    wait_for_geoserver()

    if not exists(f"/rest/workspaces/{WS}.json"):
        gs("POST", "/rest/workspaces", f"<workspace><name>{WS}</name></workspace>".encode(), "text/xml")
        print(f"[seed] workspace '{WS}' created", flush=True)

    # External coverages
    for fn in sorted(os.listdir(RASTERS)):
        if not fn.endswith(".tif"):
            continue
        name = fn[:-4]
        if exists(f"/rest/workspaces/{WS}/coveragestores/{name}.json"):
            continue
        gs("PUT", f"/rest/workspaces/{WS}/coveragestores/{name}/external.geotiff?coverageName={name}",
           f"file://{RASTERS}/{fn}".encode(), "text/plain")
        print(f"[seed] coverage {name}", flush=True)

    # Styles (one per palette actually used), create-or-update
    for pname in sorted(set(coverage_styles.values())):
        p = palettes[pname]
        body = sld(pname, p["colors"], vmin, vmax).encode()
        if exists(f"/rest/workspaces/{WS}/styles/{pname}.json"):
            gs("PUT", f"/rest/workspaces/{WS}/styles/{pname}", body, "application/vnd.ogc.sld+xml")
        else:
            gs("POST", f"/rest/workspaces/{WS}/styles?name={pname}", body, "application/vnd.ogc.sld+xml")
        print(f"[seed] style {pname}", flush=True)

    # Default style per coverage's layer
    for cov, pal in coverage_styles.items():
        gs("PUT", f"/rest/layers/{WS}:{cov}",
           f"<layer><defaultStyle><name>{WS}:{pal}</name></defaultStyle></layer>".encode(), "text/xml")
        print(f"[seed] {cov} -> default style {pal}", flush=True)

    print("[seed] done", flush=True)


if __name__ == "__main__":
    main()
