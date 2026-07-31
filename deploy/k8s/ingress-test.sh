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

# NOTE ON `set -e` AND THE ASSIGNMENTS BELOW. Every value read from the cluster or over the
# network is suffixed `|| true`. Without it a failed kubectl or curl makes the assignment
# non-zero, `set -e` aborts, and the script stops mid-run: no FAIL line for the check that
# would have caught it, no summary, just silence. A missing Ingress should read as
# "FAIL: adopted by a controller", not as the test harness disappearing.

CLUSTER="${KIND_CLUSTER:-esgame}"
PORT="${KIND_HTTP_PORT:-8880}"
K=(kubectl --context "kind-${CLUSTER}")
BASE="http://localhost:${PORT}"

# Every request carries a Host header and none of them use port-forward.
ing()  { curl -s -H "Host: $1" "${BASE}${2:-/}" "${@:3}"; }
code() { curl -s -o /dev/null -w '%{http_code}' -H "Host: $1" "${BASE}${2:-/}" "${@:3}"; }

fail=0
check() { if eval "$2" >/dev/null 2>&1; then echo "  ok   $1"; else echo "  FAIL $1"; fail=1; fi; }

echo "==> the controller is actually wired to our Ingresses"
# An Ingress only gets a status.loadBalancer address once a controller has adopted it. Empty here
# means the class did not match and nothing is routing, however healthy everything looks.
for i in esgame-angular-ingress esgame-calculation-ingress esgame-geoserver-ingress; do
  addr=$("${K[@]}" get ingress "$i" -o jsonpath='{.status.loadBalancer.ingress[*].ip}{.status.loadBalancer.ingress[*].hostname}' 2>/dev/null || true)
  cls=$("${K[@]}" get ingress "$i" -o jsonpath='{.spec.ingressClassName}' 2>/dev/null || true)
  check "${i} adopted by a controller (class=${cls:-none})" "[ -n '${addr}' ]"
done

echo "==> frontend through the ingress"
check "esgame.local serves the app"        "[ \"\$(code esgame.local /)\" = 200 ]"
# Body captured first, NOT piped into `grep -q`. grep -q exits the moment it matches, curl then
# fails writing the rest of the body with exit 23, and pipefail reports the pipeline as failed —
# so the check failed precisely BECAUSE the pattern matched. Whether it bites depends on whether
# curl finishes writing before grep exits, which is why it looked intermittent.
body=$(ing esgame.local / || true)
check "index.html is really the app"       "grep -qi '<app-root\|<title' <<<\"\${body}\""
check "assets/config.json served"          "[ \"\$(code esgame.local /assets/config.json)\" = 200 ]"
# The premise of the whole deployment: one image, retargeted by env var at container start.
want=$("${K[@]}" get cm esgame-config -o jsonpath='{.data.CALC_URL}' 2>/dev/null || true)
got=$(ing esgame.local /assets/config.json 2>/dev/null | sed -n 's/.*"calcUrl"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' || true)
echo "     ConfigMap CALC_URL=${want}"
echo "     served    calcUrl =${got}"
check "CALC_URL reached the served config" "[ -n '${want}' ] && [ '${want}' = '${got}' ]"

echo "==> a wrong Host must NOT be served by our app"
# If this returns the app, the Ingress is matching everything and host routing is not working.
# Only meaningful once the ingress is serving SOMETHING: with nothing listening every request
# is 000, which is != 200, and this passes without having tested host routing at all.
# Same capture-then-match, same reason.
other=$(ing no-such-host.local / || true)
check "unknown host is not the esgame app" \
  "[ \"\$(code esgame.local /)\" = 200 ] && { [ \"\$(code no-such-host.local /)\" != 200 ] || ! grep -qi '<app-root' <<<\"\${other}\"; }"

echo "==> geoserver through the ingress"
gs_user=$("${K[@]}" get secret esgame-geoserver-admin -o jsonpath='{.data.username}' 2>/dev/null | base64 -d 2>/dev/null || true)
gs_pass=$("${K[@]}" get secret esgame-geoserver-admin -o jsonpath='{.data.password}' 2>/dev/null | base64 -d 2>/dev/null || true)
# GeoServer answers its port well before its REST API is initialised, and the Deployment is
# "available" in between. Without this the credential checks run too early and fail for the
# wrong reason — which they did on the first clean run, then passed on a re-run against the
# same cluster. places' test/stack.sh already waits like this; this one did not.
for _ in $(seq 1 90); do
  [ "$(code esgame-geoserver.local /geoserver/rest/about/version.json -u "${gs_user}:${gs_pass}")" = 200 ] && break
  sleep 2
done
check "geoserver REST answers with the Secret creds" \
  "[ \"\$(code esgame-geoserver.local /geoserver/rest/about/version.json -u '${gs_user}:${gs_pass}')\" = 200 ]"
# Same shape: with GeoServer unreachable the default login "fails" for the wrong reason. Require
# the Secret's credentials to work first, so this only ever compares two live answers.
check "the image default password does NOT work" \
  "[ \"\$(code esgame-geoserver.local /geoserver/rest/about/version.json -u '${gs_user}:${gs_pass}')\" = 200 ] && [ \"\$(code esgame-geoserver.local /geoserver/rest/about/version.json -u admin:geoserver)\" != 200 ]"

echo "==> a real round through the calculation ingress"
# Ids come from the raster the deployed calculator actually reads, not from an assumption.
pod=$("${K[@]}" get pod -l app=esgame-calculation -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
"${K[@]}" exec "${pod}" -- R -q -e '
  suppressMessages(library(raster))
  v <- sort(unique(na.omit(values(raster("/app/data/LU_and_NEW_hexa.tif")))))
  cat("IDS:", paste(v[v >= 9], collapse=","), "\n")' 2>/dev/null \
  | tr -d '\r' | sed -n 's/^IDS: //p' | tr -d ' ' > /tmp/esgame-ingress-ids.txt || true
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
# Assign, then default on failure. `|| echo 000` would append to curl's own "000" and report
# a six-digit status.
rm -f /tmp/esgame-ingress-round.json
http=$(curl -s -o /tmp/esgame-ingress-round.json -w '%{http_code}' -m 900 \
  -H 'Host: esgame-calculation.local' -H 'Content-Type: application/json' \
  --data @/tmp/esgame-ingress-payload.json "${BASE}/esgame") || http=000
echo "     POST /esgame via ingress -> ${http} in $(( $(date +%s) - start ))s"
check "round returns 200 through the ingress" "[ '${http}' = 200 ]"

# Only if the round actually produced a response; otherwise the summary would be a traceback.
: > /tmp/esgame-ingress-summary.txt
[ -s /tmp/esgame-ingress-round.json ] && python3 - /tmp/esgame-ingress-round.json > /tmp/esgame-ingress-summary.txt <<'PY' || true
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
grep -v '^SCORED=\|^URLS=' /tmp/esgame-ingress-summary.txt || true
scored=$(sed -n 's/^SCORED=//p' /tmp/esgame-ingress-summary.txt || true)
urls=$(sed -n 's/^URLS=//p' /tmp/esgame-ingress-summary.txt || true)
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
  ct=$(curl -s -o /dev/null -w '%{content_type}' -m 180 -H "Host: ${host}" "${BASE}${path}" || true)
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
