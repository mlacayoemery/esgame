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
# Counted, not hand-tallied. docs/verification-status.rst quoted "16/16" for this script while it
# actually ran 18 checks — the ingress-adoption check is inside a loop over three Ingresses, so
# counting `check` in the source gives 16 and the run prints 18. Nothing re-derived it, so the
# number drifted the moment a check was added inside a loop. Now the script says what it ran.
checks=0
passed=0
check() {
  checks=$((checks + 1))
  if eval "$2" >/dev/null 2>&1; then passed=$((passed + 1)); echo "  ok   $1"; else echo "  FAIL $1"; fail=1; fi
}

echo "==> the controller is actually wired to our Ingresses"
# An Ingress only gets a status.loadBalancer address once a controller has adopted it. Empty here
# means the class did not match and nothing is routing, however healthy everything looks.
for i in esgame-angular-ingress esgame-calculation-ingress esgame-geoserver-ingress; do
  addr=$("${K[@]}" get ingress "$i" -o jsonpath='{.status.loadBalancer.ingress[*].ip}{.status.loadBalancer.ingress[*].hostname}' 2>/dev/null || true)
  cls=$("${K[@]}" get ingress "$i" -o jsonpath='{.spec.ingressClassName}' 2>/dev/null || true)
  check "${i} adopted by a controller (class=${cls:-none})" "[ -n '${addr}' ]"
done

echo "==> frontend through the ingress"
# WAIT FOR THE CONTROLLER TO PICK UP THE BACKEND, which is not the same as the pod being Ready.
#
# These are the FIRST request-serving checks in this script, and they run the instant
# `kind.sh deploy` returns. That deploy already waits for the rollout and for the Service to have
# endpoints — and neither is sufficient: ingress-nginx still has to observe the new endpoint and
# reload before it will route to it. In between it answers 503.
#
# Measured 2026-08-14. Two consecutive CI runs on the same commit failed all six checks below
# while every pod was 1/1 Running, the Ingress was adopted, the Service had its endpoint, and the
# published image served correctly when pulled and run by hand. Reproduced locally by replacing
# the frontend pod: 503 immediately, 200 at 31s, endpoint `ready=true` throughout. The geoserver
# and round checks passed in those same runs purely because they come later in this file and had
# already won the race.
#
# THIS ASSERTS NOTHING. It is a poll, not a check: `checks` is not incremented and nothing here
# can pass. If the app never serves, every check below fails exactly as it did before.
for _ in $(seq 1 45); do
  [ "$(code esgame.local /)" = 200 ] && break
  sleep 2
done

check "esgame.local serves the app"        "[ \"\$(code esgame.local /)\" = 200 ]"
# Body captured first, NOT piped into `grep -q`. grep -q exits the moment it matches, curl then
# fails writing the rest of the body with exit 23, and pipefail reports the pipeline as failed —
# so the check failed precisely BECAUSE the pattern matched. Whether it bites depends on whether
# curl finishes writing before grep exits, which is why it looked intermittent.
body=$(ing esgame.local / || true)
# `<app-root` only. The pattern used to be '<app-root\|<title', and ingress-nginx's own 404
# page is "<html><head><title>404 Not Found</title>...", so the <title> alternative matched it:
# with nothing serving esgame.local at all, this check reported the app was really being served.
# Found by running the whole script against a deleted deployment.
check "index.html is really the app"       "grep -qi '<app-root' <<<\"\${body}\""
check "assets/config.json served"          "[ \"\$(code esgame.local /assets/config.json)\" = 200 ]"
# The premise of the whole deployment: one image, retargeted by env var at container start.
want=$("${K[@]}" get cm esgame-config -o jsonpath='{.data.CALC_URL}' 2>/dev/null || true)
got=$(ing esgame.local /assets/config.json 2>/dev/null | sed -n 's/.*"calcUrl"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' || true)
echo "     ConfigMap CALC_URL=${want}"
echo "     served    calcUrl =${got}"
check "CALC_URL reached the served config" "[ -n '${want}' ] && [ '${want}' = '${got}' ]"

# ...but agreeing with the ConfigMap only proves the env var was plumbed. It says nothing about
# whether the URL WORKS, and the rest of this script never finds out: every other request here is
# built from ${BASE} plus a Host header, so it reaches the ingress no matter what the served config
# says. A CALC_URL with no port passed every check in this file while no browser could play a
# round — the browser resolves the host and posts to :80, where nothing listens.
#
# So take the served URL at its word: resolve ITS host and ITS port the way a client would.
calc_host=$(sed -E 's|^https?://([^:/]+).*|\1|' <<<"${got}")
calc_port=$(sed -nE 's|^https?://[^:/]+:([0-9]+).*|\1|p' <<<"${got}")
[ -n "${calc_port}" ] || calc_port=$(grep -q '^https' <<<"${got}" && echo 443 || echo 80)
calc_path=$(sed -E 's|^https?://[^/]+||' <<<"${got}")
echo "     as a client reads it: host=${calc_host} port=${calc_port} path=${calc_path}"
# --resolve is what a browser's DNS would do; the port is the one the URL actually names.
calc_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
  --resolve "${calc_host}:${calc_port}:127.0.0.1" \
  "http://${calc_host}:${calc_port}${calc_path}" -X POST \
  -H 'Content-Type: application/json' -d '{"allocation":[]}' 2>/dev/null || true)
# Any HTTP response proves something is listening and routing there; 000 means it is not.
check "CALC_URL is reachable as written"    "[ -n '${calc_code}' ] && [ '${calc_code}' != 000 ]"

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
# Ids come from the raster the deployed calculator actually reads, not from an assumption — and
# ESGAME_BASE_RASTER is resolved INSIDE the pod, so this follows whichever board is deployed.
#
# It used to name LU_and_NEW_hexa.tif literally, which was the same thing when there was one board.
# With two it would have been a check that cannot fail: overlays/rectangular ships both rasters, so
# reading the hexagonal one still works, its ids (100..46500) are all present in the rectangular
# raster (100..52900), and the round below would report 100% coverage while allocating to a board
# the browser never drew. Exactly the circularity this file already warns about further down.
pod=$("${K[@]}" get pod -l app=esgame-calculation -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
"${K[@]}" exec "${pod}" -- R -q -e '
  suppressMessages(library(raster))
  p <- file.path("/app/data", Sys.getenv("ESGAME_BASE_RASTER", "LU_and_NEW_hexa.tif"))
  cat("RASTER:", basename(p), "\n")
  v <- sort(unique(na.omit(values(raster(p)))))
  cat("IDS:", paste(v[v >= 9], collapse=","), "\n")' 2>/dev/null \
  | tr -d '\r' > /tmp/esgame-ingress-raster.txt || true
sed -n 's/^IDS: //p' /tmp/esgame-ingress-raster.txt | tr -d ' ' > /tmp/esgame-ingress-ids.txt
base_raster=$(sed -n 's/^RASTER: //p' /tmp/esgame-ingress-raster.txt | tr -d ' ' | head -1)
n=$(tr ',' '\n' < /tmp/esgame-ingress-ids.txt | grep -c . || echo 0)
echo "     ${n} allocatable ids read from ${base_raster:-<unknown>}, the deployed board"
check "the deployed base raster was identified" "[ -n '${base_raster}' ]"
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

echo "==> how much of the allocation the calculator could actually use"
# Everything above can pass on a round that ignored the allocation entirely. The committed
# LU_and_NEW_hexa.tif numbers its hexagons 10-474 while the board numbers its own 100-46500, so
# only 4 of 465 ids overlap: reclassify is very nearly a no-op and the same five scores come back
# for ANY allocation. tools/R/coverage.R detects this and logs it — and nothing ever read that
# log, so this script printed "PASS (455 ids, 5 scores, 5/5 coverages)" over a game that was
# inert. See docs/verification-status.rst, "The committed base raster makes the game inert".
cov=$("${K[@]}" logs deploy/esgame-calculation --tail=400 2>/dev/null \
      | grep -F 'Allocation coverage:' | tail -1 || true)
echo "     ${cov:-<no coverage line in the calculation log>}"
# Presence first: the reporter being wired in at all is the thing worth failing on. If someone
# removes the source() of coverage.R, every other check here still passes.
check "the calculator reported coverage"   "[ -n '${cov}' ]"

pct=$(sed -nE 's/.*\(([0-9]+)%\).*/\1/p' <<<"${cov}")
# ...and this number is CIRCULAR here, so do not read it as evidence about the data. The payload
# above is built from ids this script read out of the deployed raster, so it matches by
# construction and reports ~100% however wrong the raster is for the actual game board.
#
# A real player does not do that. Measured on this same cluster, minutes apart:
#
#   ingress-test.sh (ids taken from the raster)   455 of 455  (100%)
#   a browser playing a round (real board ids)      4 of 465  (1%)
#
# So the honest figure comes from v2/e2e-cluster, not from here. What this proves is that the
# reporter is wired in and runs — which is worth proving, because nothing else here would notice
# if it were removed.
if [ -n "${pct}" ] && [ "${pct}" -lt 50 ]; then
  echo "     !! ${pct}% of the allocation matched the base raster."
  echo "     !! The scores above are very nearly independent of what was allocated."
  echo "     !! This is EXPECTED with the raster committed to this repository, which is only"
  echo "     !! good for exercising the plumbing. A deployment supplies the data-release raster."
  inert=" — but only ${pct}% of the allocation was used"
elif [ -n "${pct}" ]; then
  echo "     (${pct}% — circular: this payload's ids came from that raster. See v2/e2e-cluster"
  echo "      for the figure a real browser produces, which on this data is 1%.)"
fi

echo "==> what was actually under test"
# A green run says nothing about WHICH build was green. Both images roll on :master, so a pod
# that started before the last publish keeps serving the old one — `kubectl apply` sees no change
# in a rolling tag and does nothing. That happened during this script's own development: the
# cluster served a frontend image seven merges old while every check here passed.
#
# kind.sh deploy does `rollout restart`, which re-pulls under imagePullPolicy: Always. This just
# records the result, so the output says what it tested rather than leaving it to be assumed.
for d in esgame-angular esgame-calculation; do
  app=$("${K[@]}" get deploy "${d}" -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || true)
  running=$("${K[@]}" get pod -l "app=${d}" -o jsonpath='{.items[0].status.containerStatuses[0].imageID}' 2>/dev/null || true)
  echo "     ${d}"
  echo "       spec:    ${app:-<unknown>}"
  echo "       running: ${running:-<unknown>}"
done
# Presence, not a comparison: the digest a rolling tag resolves to is only knowable by pulling,
# which this script should not do. Asserting it is non-empty keeps the record honest — an empty
# line here would mean the pod is not reporting an image at all.
digests=$("${K[@]}" get pod -l 'app in (esgame-angular,esgame-calculation)' \
  -o jsonpath='{range .items[*]}{.status.containerStatuses[0].imageID}{"\n"}{end}' 2>/dev/null | grep -c '@sha256:' || true)
check "both pods report an image digest"    "[ '${digests}' = '2' ]"

echo
# A run that executed no checks would otherwise report PASS. That is not hypothetical here: every
# check is guarded by data read from the cluster, and an early `kubectl` failure could skip them.
if [ "${checks}" -lt 10 ]; then
  echo "ingress round-trip: FAIL   only ${checks} checks ran; this script covers more than that"
  exit 1
fi
if [ "${fail}" = 0 ]; then
  echo "ingress round-trip: PASS   ${passed}/${checks} checks   (${n} ids, ${scored} scores, ${ok}/${tot} coverages, all via http://localhost:${PORT})${inert:-}"
else
  echo "ingress round-trip: FAIL   ${passed}/${checks} checks"; exit 1
fi
