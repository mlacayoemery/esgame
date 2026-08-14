#!/usr/bin/env bash
# Is there a newer GeoServer than the one deploy/geoserver/Dockerfile pins?
#
#   tools/newer-geoserver.sh
#
# WHY A SCRIPT AND NOT JUST DEPENDABOT. docker.osgeo.org is not Docker Hub, and Dependabot's
# support for arbitrary registries is uneven — .github/dependabot.yml has an entry for this
# directory, and this exists so the answer does not depend on whether that entry works.
#
# WHAT IT COST TO HAVE NOTHING. The k8s manifest carried "2.28.4 is the newest tag
# docker.osgeo.org publishes (2.28.5 and 2.29.0 are not). Checked, so nobody re-checks." That was
# true on 2026-08-06 and false by 2026-08-14, when 3.0.0 turned up — found by hand, while doing
# something else. A fact nobody re-derives is the recurring defect in this repository; this
# re-derives it every Monday.
#
# HOW IT FAILS, AND WHY THAT IS A CHOICE. It exits 1 when a newer stable patch exists, because the
# fix is a one-line bump and a red scheduled run is a signal somebody reads on Monday. If the
# newer version is deliberately NOT being taken, raise REVIEWED_UP_TO below — that turns "we are
# behind" into a recorded decision instead of a red run people learn to ignore. Same shape as the
# ACCEPTED list in tools/audit.sh.
set -uo pipefail
cd "$(dirname "$0")/.."

DOCKERFILE="deploy/geoserver/Dockerfile"
REGISTRY="https://docker.osgeo.org/v2/geoserver/tags/list"

# The newest release that has been looked at. Normally equal to the pin; raise it above the pin
# only to record "we know about that one and are not taking it yet", with a reason.
REVIEWED_UP_TO="3.0.0"

[ -f "${DOCKERFILE}" ] || { echo "!! ${DOCKERFILE} is missing; nothing to check"; exit 2; }

pinned=$(grep -oE '^FROM docker\.osgeo\.org/geoserver:[A-Za-z0-9._-]+' "${DOCKERFILE}" | sed 's/.*://')
[ -n "${pinned}" ] || { echo "!! no FROM docker.osgeo.org/geoserver:<tag> in ${DOCKERFILE}"; exit 2; }

# A temp file, not a here-string: `python3 - <<PY <<<"$tags"` gives python BOTH the script and
# the tag list on stdin, the here-string wins, and python reads the tag JSON as its program —
# printing nothing and exiting 0. Measured, here, on the first run. tools/audit.sh has the same
# note for the same reason.
taglist=$(mktemp)
trap 'rm -f "${taglist}"' EXIT
curl -sSf --max-time 60 "${REGISTRY}" > "${taglist}" 2>/dev/null || true
[ -s "${taglist}" ] || { echo "!! could not read ${REGISTRY}; nothing was checked"; exit 2; }

PINNED="${pinned}" REVIEWED="${REVIEWED_UP_TO}" python3 - "${taglist}" <<'PY'
import json, os, re, sys

pinned, reviewed = os.environ["PINNED"], os.environ["REVIEWED"]
data = json.load(open(sys.argv[1]))
tags = data.get("tags") or []
if not tags:
    print("!! the registry returned no tags at all; nothing was checked")
    raise SystemExit(2)

# Stable patch releases only. docker.osgeo.org also publishes 3.0.x, 3.0-latest, 3.0-RC, 2.28-M0
# and bare 3.0 — every one of which is a moving target, and none of which is a thing to pin.
SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")
def key(t):
    m = SEMVER.match(t)
    return tuple(int(g) for g in m.groups()) if m else None

stable = sorted((k for k in (key(t) for t in tags) if k), reverse=True)
if not stable:
    print(f"!! no stable x.y.z tags among {len(tags)} tags; the tag scheme may have changed")
    raise SystemExit(2)

def parse(label, value):
    k = key(value)
    if k is None:
        print(f"!! {label} is {value!r}, which is not a stable x.y.z version")
        raise SystemExit(2)
    return k

pk, rk = parse("the pin", pinned), parse("REVIEWED_UP_TO", reviewed)
newest = stable[0]
newest_s = ".".join(map(str, newest))

print(f"pinned:        {pinned}")
print(f"reviewed up to {reviewed}")
print(f"newest stable: {newest_s}   ({len(stable)} stable tags of {len(tags)})")

if rk < pk:
    print(f"\n!! REVIEWED_UP_TO ({reviewed}) is BEHIND the pin ({pinned}).")
    print("   That cannot be right — the pinned version has evidently been looked at.")
    raise SystemExit(1)

if newest > rk:
    ahead = [".".join(map(str, k)) for k in stable if k > rk]
    print(f"\n!! GeoServer {newest_s} is available and has not been reviewed.")
    print(f"   Unreviewed: {', '.join(ahead)}")
    print(f"   Take it in deploy/geoserver/Dockerfile, or raise REVIEWED_UP_TO in")
    print("   tools/newer-geoserver.sh with the reason it is being left.")
    raise SystemExit(1)

if pk < rk:
    print(f"\nbehind by choice: {reviewed} reviewed, {pinned} pinned. Nothing newer than that.")
else:
    print("\nup to date")
PY
