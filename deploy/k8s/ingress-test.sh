#!/usr/bin/env bash
# Drive a real round through a real ingress controller.
#
# This closes the largest gap in docs/verification-status.rst. Everything k8s in this repo had
# only ever been reached by `kubectl port-forward`, which proves a Pod is listening and proves
# nothing at all about the Ingress: an Ingress with no class, or no controller, applies cleanly
# and routes nothing, silently. So every request here goes over the host port that kind maps to
# ingress-nginx, addressed by Host header — the same path a browser takes.
#
#   deploy/k8s/kind.sh up && deploy/k8s/kind.sh deploy
#   deploy/k8s/ingress-test.sh
set -euo pipefail
cd "$(dirname "$0")"

CLUSTER="${KIND_CLUSTER:-esgame}"
PORT="${KIND_HTTP_PORT:-8880}"
K=(kubectl --context "kind-${CLUSTER}")
BASE="http://localhost:${PORT}"

# Every request carries a Host header and none of them use port-forward.
ing()  { curl -s -H "Host: $1" "${BASE}${2:-/}" "${@:3}"; }
code() { curl -s -o /dev/null -w '%{http_code}' -H "Host: $1" "${BASE}${2:-/}" "${@:3}"; }
ctype(){ curl -s -o /dev/null -w '%{content_type}' -H "Host: $1" "${BASE}${2:-/}" "${@:3}"; }

fail=0
check() { if eval "$2" >/dev/null 2>&1; then echo "  ok   $1"; else echo "  FAIL $1"; fail=1; fi; }

echo "==> the controller is actually wired to our Ingresses"
# An Ingress only gets a status.loadBalancer address once a controller has adopted it. Empty here
# means the class did not match and nothing is routing, however healthy everything looks.
for i in esgame-angular-ingress esgame-calculation-ingress esgame-geoserver-ingress; do
  addr=$("${K[@]}" get ingress "$i" -o jsonpath='{.status.loadBalancer.ingress[*].ip}{.status.loadBalancer.ingress[*].hostname}' 2>/dev/null)
  cls=$("${K[@]}" get ingress "$i" -o jsonpath='{.spec.ingressClassName}' 2>/dev/null)
  check "${i} adopted by a controller (class=${cls:-none})" "[ -n '${addr}' ]"
done

echo "==> frontend through the ingress"
check "esgame.local serves the app"        "[ \"\$(code esgame.local /)\" = 200 ]"
check "index.html is really the app"       "ing esgame.local / | grep -qi '<app-root\|<title'"
check "assets/config.json served"          "[ \"\$(code esgame.local /assets/config.json)\" = 200 ]"
# The premise of the whole deployment: one image, retargeted by env var at container start.
want=$("${K[@]}" get cm esgame-config -o jsonpath='{.data.CALC_URL}')
got=$(ing esgame.local /assets/config.json | sed -n 's/.*"calcUrl"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
echo "     ConfigMap CALC_URL=${want}"
echo "     served    calcUrl =${got}"
check "CALC_URL reached the served config" "[ -n '${want}' ] && [ '${want}' = '${got}' ]"

echo "==> a wrong Host must NOT be served by our app"
# If this returns the app, the Ingress is matching everything and host routing is not working.
check "unknown host is not the esgame app"  "[ \"\$(code no-such-host.local /)\" != 200 ] || ! ing no-such-host.local / | grep -qi '<app-root'"

echo "==> geoserver through the ingress"
gs_user=$("${K[@]}" get secret esgame-geoserver-admin -o jsonpath='{.data.username}' | base64 -d)
gs_pass=$("${K[@]}" get secret esgame-geoserver-admin -o jsonpath='{.data.password}' | base64 -d)
check "geoserver REST answers with the Secret creds" \
  "[ \"\$(code esgame-geoserver.local /geoserver/rest/about/version.json -u '${gs_user}:${gs_pass}')\" = 200 ]"
check "the image default password does NOT work" \
  "[ \"\$(code esgame-geoserver.local /geoserver/rest/about/version.json -u admin:geoserver)\" != 200 ]"

echo "==> a real round through the calculation ingress"
# Ids come from the raster the deployed calculator actually reads, not from an assumption.
pod=$("${K[@]}" get pod -l app=esgame-calculation -o jsonpath='{.items[0].metadata.name}')
"${K[@]}" exec "${pod}" -- R -q -e '
  suppressMessages(library(raster))
  v <- sort(unique(na.omit(values(raster("/app/data/LU_and_NEW_hexa.tif")))))
  cat("IDS:", paste(v[v >= 9], collapse=","), "\n")' 2>/dev/null \
  | tr -d '\r' | sed -n 's/^IDS: //p' | tr -d ' ' > /tmp/esgame-ingress-ids.txt
n=$(tr ',' '\n' < /tmp/esgame-ingress-ids.txt | grep -c . || echo 0)
echo "     ${n} allocatable ids read from the deployed raster"
check "read the id space from the pod"     "[ '${n}' -gt 100 ]"

python3 - /tmp/esgame-ingress-ids.txt > /tmp/esgame-ingress-payload.json <<'PY'
import json, sys
ids = [int(x) for x in open(sys.argv[1]).read().strip().split(',') if x]
types = [10, 20, 30, 40, 50, 60]
json.dump({"game_id": "ingress", "round": 1, "score": 42,
           "allocation": [{"id": i, "lulc": types[n % len(types)]} for n, i in enumerate(ids)]}, sys.stdout)
PY

start=$(date +%s)
http=$(curl -s -o /tmp/esgame-ingress-round.json -w '%{http_code}' -m 900 \
  -H 'Host: esgame-calculation.local' -H 'Content-Type: application/json' \
  --data @/tmp/esgame-ingress-payload.json "${BASE}/esgame")
echo "     POST /esgame via ingress -> ${http} in $(( $(date +%s) - start ))s"
check "round returns 200 through the ingress" "[ '${http}' = 200 ]"

python3 - /tmp/esgame-ingress-round.json > /tmp/esgame-ingress-summary.txt <<'PY' || true
import json, sys, math
rows = json.load(open(sys.argv[1]))["results"]
scored, urls = 0, []
for it in rows:
    if it.get("url"): urls.append(str(it["url"]))
    if it.get("id") == -1:
        print(f"     {it.get('name',''):<40} (plot)"); continue
    s = it.get("score")
    ok = isinstance(s, (int, float)) and not isinstance(s, bool) and math.isfinite(float(s))
    if ok: scored += 1
    print(f"     {it.get('name',''):<40} score={s}{'' if ok else '  <-- NOT FINITE'}")
print(f"SCORED={scored}")
print("URLS=" + " ".join(urls))
PY
grep -v '^SCORED=\|^URLS=' /tmp/esgame-ingress-summary.txt
scored=$(sed -n 's/^SCORED=//p' /tmp/esgame-ingress-summary.txt)
urls=$(sed -n 's/^URLS=//p' /tmp/esgame-ingress-summary.txt)
check "indicators scored (not NaN)"        "[ -n '${scored}' ] && [ '${scored}' -ge 5 ]"

echo "==> the returned coverage URLs are fetchable as a browser would fetch them"
# The GEOSERVER_PUBLIC_URL split, end to end: these URLs must name the geoserver INGRESS host,
# and must actually return GeoTIFFs over it. Built from the Service name they would 200 from
# inside the cluster and be unreachable from anywhere a browser runs.
tot=0; ok=0
for u in ${urls}; do
  case "${u}" in *"/wcs?"*) ;; *) continue ;; esac
  tot=$((tot + 1))
  host=$(sed -E 's|https?://([^/:]+).*|\1|' <<<"${u}")
  path=$(sed -E 's|https?://[^/]+||' <<<"${u}")
  ct=$(curl -s -o /dev/null -w '%{content_type}' -m 180 -H "Host: ${host}" "${BASE}${path}")
  case "${ct}" in *tiff*) ok=$((ok + 1));; *) echo "     unfetchable via ingress: ${host} (${ct:-none})";; esac
done
echo "     WCS GetCoverage through the ingress: ${ok}/${tot}"
# The -n guard is load-bearing: `! grep -q` over an EMPTY list finds nothing and inverts to
# true, so a round that returned no URLs at all would report this as green — and this is the
# check that proves GEOSERVER_PUBLIC_URL reached the client. Seventh instance of that shape
# found on 2026-07-30; see docs/verification-status.rst, "The checks were audited for vacuity".
check "coverage URLs use an ingress host"  "[ -n '${urls}' ] && ! grep -q 'esgame-geoserver-service' <<<'${urls}'"
check "coverage URLs return GeoTIFFs"      "[ ${tot} -gt 0 ] && [ ${ok} = ${tot} ]"

echo
if [ "${fail}" = 0 ]; then
  echo "ingress round-trip: PASS   (${n} ids, ${scored} scores, ${ok}/${tot} coverages, all via http://localhost:${PORT})"
else
  echo "ingress round-trip: FAIL"; exit 1
fi
