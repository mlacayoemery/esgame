#!/usr/bin/env bash
# Exercises v2/docker-entrypoint.sh, which decides what a deployed frontend actually talks to.
#
#   v2/entrypoint-test.sh
#
# Every case below is a way of serving the WRONG configuration while looking healthy, which is the
# only failure mode that matters here: nginx starts, the page loads, and the game quietly talks to
# the wrong backend or draws the wrong board. The script's job is to refuse instead, and these
# assert that it does — including the negative cases, which are the ones that rot.
set -uo pipefail
cd "$(dirname "$0")"

# Invoked through `sh`, not executed: the file is mode 644 in git and the Dockerfile chmods it on
# the way into /docker-entrypoint.d/. Requiring +x here would fail on a correct checkout.
SCRIPT="./docker-entrypoint.sh"
[ -r "${SCRIPT}" ] || { echo "!! ${SCRIPT} is missing"; exit 2; }

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
pass=0; fail=0

# $1 what it is, $2 expected exit, $3 expected config.json content (or "-" to skip), rest: env
check() {
  local what="$1" want_rc="$2" want_grep="$3"; shift 3
  local cfg="${WORK}/config.json"
  cat > "${cfg}" <<'JSON'
{
	"staticDataUrl": "assets/dataGridExample.json",
	"dynamicDataUrl": "assets/data.json",
	"calcUrl": "",
	"defaultMode": "static"
}
JSON
  [ "${1:-}" = "--config" ] && { printf '%s' "$2" > "${cfg}"; shift 2; }

  local out rc
  out="$(env ESGAME_CONFIG="${cfg}" "$@" sh "${SCRIPT}" 2>&1)"; rc=$?

  if [ "${rc}" != "${want_rc}" ]; then
    echo "FAIL  ${what}"
    echo "      exit ${rc}, expected ${want_rc}"
    echo "      ${out}"
    fail=$((fail + 1)); return
  fi
  if [ "${want_grep}" != "-" ] && ! grep -q "${want_grep}" "${cfg}"; then
    echo "FAIL  ${what}"
    echo "      config.json does not contain: ${want_grep}"
    echo "      $(tr -d '\n\t' < "${cfg}")"
    fail=$((fail + 1)); return
  fi
  echo "ok    ${what}"
  pass=$((pass + 1))
}

echo "--- doing nothing ---"
# The shipped default. An entrypoint that rewrote config.json when asked for nothing would make
# every deployment's served config depend on the image build rather than on the file.
check "no variables set: exits 0 and leaves the config alone" 0 '"calcUrl": ""'

echo "--- injecting ---"
check "CALC_URL is injected"        0 '"calcUrl": "http://calc:8000"'  CALC_URL=http://calc:8000
check "CALC_URL='' is injected"     0 '"calcUrl": ""'                  CALC_URL=
check "DEFAULT_MODE is injected"    0 '"defaultMode": "dynamic"'       DEFAULT_MODE=dynamic
check "DYNAMIC_DATA_URL is injected" 0 '"dynamicDataUrl": "assets/dataRect.json"' \
      DYNAMIC_DATA_URL=assets/dataRect.json
check "STATIC_DATA_URL is injected" 0 '"staticDataUrl": "assets/other.json"' \
      STATIC_DATA_URL=assets/other.json

# The whole point of the rectangular board: one image, three variables, a different game at "/".
check "the rectangular dynamic game, all at once" 0 '"dynamicDataUrl": "assets/dataRect.json"' \
      CALC_URL=http://calc:8000 DEFAULT_MODE=dynamic DYNAMIC_DATA_URL=assets/dataRect.json
check "...and defaultMode came with it" 0 '"defaultMode": "dynamic"' \
      CALC_URL=http://calc:8000 DEFAULT_MODE=dynamic DYNAMIC_DATA_URL=assets/dataRect.json

echo "--- refusing ---"
# A typo'd mode is worse than a rejected one: the app falls back to the grid game for anything it
# does not recognise, so "dynmaic" would serve the wrong game with no error anywhere.
check "DEFAULT_MODE=dynmaic is rejected"  1 '"defaultMode": "static"'  DEFAULT_MODE=dynmaic
check "DEFAULT_MODE='' is rejected"       1 '"defaultMode": "static"'  DEFAULT_MODE=
check "DEFAULT_MODE=Dynamic is rejected"  1 '"defaultMode": "static"'  DEFAULT_MODE=Dynamic

# '#' is the sed delimiter. Without the guard this is a sed error or a partial replacement.
check "a '#' in a value is rejected" 1 - CALC_URL='http://calc:8000/#/x'

# A config that does not carry the key: the case that used to pass silently.
check "a config without the key is rejected" 1 - \
      --config '{"staticDataUrl": "a.json"}' CALC_URL=http://calc:8000

echo "--- a missing config ---"
out="$(env ESGAME_CONFIG="${WORK}/nope.json" CALC_URL=http://calc:8000 sh "${SCRIPT}" 2>&1)"; rc=$?
if [ "${rc}" = 1 ]; then echo "ok    a missing config.json is rejected"; pass=$((pass + 1))
else echo "FAIL  a missing config.json exited ${rc}, expected 1"; echo "      ${out}"; fail=$((fail + 1)); fi

echo
echo "${pass} passed, ${fail} failed"
[ "${fail}" -eq 0 ] || exit 1
