#!/usr/bin/env bash
# Does the scoring model still return what it returned last time?
#
# WHAT THIS IS, AND WHAT IT IS NOT
#
# A characterization test. It POSTs one fixed allocation and compares the five indicator scores
# against numbers recorded from a previous run. It catches a CHANGE. It says nothing whatever
# about whether those numbers are scientifically right — nobody has a reference answer for this
# model, which is why this shape was chosen over asserting correctness we cannot establish.
#
# So a failure here means "the model's output moved; find out why", not "the model is wrong". The
# honest reasons it can move are a change to calculator.r, a change to the base raster, or a
# change to the R packages underneath — tools/R/Dockerfile pins its base but still installs R
# packages from p3m at build time, so
# the third can happen without anyone touching this repository. See docs/dependency-review.rst.
#
# Scores are integers, which is what makes this viable: small numeric drift in raster/terra does
# not move an integer unless it was already on a boundary.
#
# The model was checked to be deterministic before this was written: the same allocation POSTed
# twice returned identical scores.
#
#   deploy/k8s/ingress-test.sh must pass first — this assumes a working stack and only asks
#   whether the numbers moved.
#
#   BASE=http://localhost:8880 CALC_HOST=esgame-calculation.local tools/R/golden-test.sh
#   UPDATE_GOLDEN=1 ... tools/R/golden-test.sh    # re-record, when a move is understood and wanted
set -euo pipefail
cd "$(dirname "$0")/../.."

BASE="${BASE:-http://localhost:8880}"
CALC_HOST="${CALC_HOST:-esgame-calculation.local}"
ALLOC=tools/R/golden/allocation.json
GOLDEN=tools/R/golden/scores.json

# Presence first: without the payload this would POST nothing and compare nothing.
[ -s "${ALLOC}" ] || { echo "!! ${ALLOC} is missing or empty; this test covers nothing" >&2; exit 1; }

echo "==> POSTing the golden allocation ($(python3 -c "
import json;print(len(json.load(open('${ALLOC}'))['allocation']))") hexagons)"
body=$(mktemp); trap 'rm -f "${body}"' EXIT
code=$(curl -s -o "${body}" -w '%{http_code}' --max-time 600 \
  -H "Host: ${CALC_HOST}" -H 'Content-Type: application/json' \
  --data @"${ALLOC}" "${BASE}/esgame" || echo 000)
echo "    POST /esgame -> ${code}"
[ "${code}" = 200 ] || { echo "!! the round did not return 200; nothing to compare" >&2; head -c 400 "${body}" >&2; exit 1; }

got=$(python3 - "${body}" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
rows = d.get("results", [])
# id -1 was the rendered spider plot, which carried no score. calculator.r no longer returns it —
# v2 draws the chart from the scores — but the filter stays, because this script is also pointed
# at deployments running an older calculation image.
scores = {r["name"].split("_")[0]: r.get("score") for r in rows if r.get("id") != -1}
if not scores:
    print("NO_SCORES"); raise SystemExit
# Refuse to compare NaN: it is not a value that means anything, and recording one as golden would
# freeze a broken round in place as the expected answer.
bad = [k for k, v in scores.items() if not isinstance(v, (int, float)) or v != v]
if bad:
    print("NOT_FINITE:" + ",".join(sorted(bad))); raise SystemExit
print(json.dumps(dict(sorted(scores.items())), indent=1))
PY
)
case "${got}" in
  NO_SCORES)      echo "!! the response carried no indicator scores" >&2; exit 1 ;;
  NOT_FINITE:*)   echo "!! not a finite score: ${got#NOT_FINITE:}" >&2; exit 1 ;;
esac

if [ "${UPDATE_GOLDEN:-}" = 1 ]; then
  printf '%s\n' "${got}" > "${GOLDEN}"
  echo "==> re-recorded ${GOLDEN}:"; sed 's/^/    /' "${GOLDEN}"
  echo "    (commit this only if you understand why the numbers moved)"
  exit 0
fi

[ -s "${GOLDEN}" ] || {
  echo "!! ${GOLDEN} is missing. Record it with UPDATE_GOLDEN=1 and commit it." >&2; exit 1; }

want=$(cat "${GOLDEN}")
if [ "${got}" = "${want}" ]; then
  echo "==> scores unchanged:"; printf '%s\n' "${got}" | sed 's/^/    /'
  echo "golden scores: PASS"
else
  echo "!! the model's output moved." >&2
  echo "   expected:"; printf '%s\n' "${want}" | sed 's/^/     /'
  echo "   got:";      printf '%s\n' "${got}"  | sed 's/^/     /'
  echo "   A change to calculator.r, to the base raster, or to the R packages underneath can do" >&2
  echo "   this. Work out which before re-recording with UPDATE_GOLDEN=1." >&2
  echo "golden scores: FAIL" >&2
  exit 1
fi
