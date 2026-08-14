#!/bin/sh
# Inject runtime configuration into the served assets/config.json before nginx starts.
# This lets a single image target any backend/deployment via environment variables — no rebuild.
#
#   CALC_URL          -> "calcUrl"          the calculation backend; empty string = fully client-side
#   DEFAULT_MODE      -> "defaultMode"      what "/" serves: `static` (grid game) or `dynamic`
#   DYNAMIC_DATA_URL  -> "dynamicDataUrl"   which dataset the dynamic game loads
#   STATIC_DATA_URL   -> "staticDataUrl"    which dataset the grid game loads
#
# The last two are how a deployment chooses a BOARD. assets/dataRect.json is the same landscape as
# assets/data.json partitioned into rectangles instead of hexagons (tools/R/make-rect-board.R), so
# a rectangular dynamic game is DEFAULT_MODE=dynamic plus DYNAMIC_DATA_URL=assets/dataRect.json —
# and the calculation container's ESGAME_BASE_RASTER must name the matching mosaic, or the browser
# sends ids the calculator does not have and every round scores identically.
#
# Runs automatically via nginx's /docker-entrypoint.d/ hook during container init, as uid 101 —
# the image is unprivileged, so this replaces a file it must already own. The Dockerfile's
# `COPY --chown=101:101` of the dist tree is what makes that true; without it this fails here,
# at start, rather than at build.
set -e

# The served config. Overridable ONLY so v2/entrypoint-test.sh can exercise the failure paths —
# a wrong DEFAULT_MODE, a config missing the key — without building an image for each one. The
# default is what the container actually uses, and nothing sets ESGAME_CONFIG in any deployment.
CONFIG="${ESGAME_CONFIG:-/usr/share/nginx/html/assets/config.json}"

# Nothing set means "leave the built-in config alone" — the client-side grid game, and the shipped
# default. Nothing to do, and nothing to say.
if [ -z "${CALC_URL+x}" ] && [ -z "${DEFAULT_MODE+x}" ] && \
   [ -z "${DYNAMIC_DATA_URL+x}" ] && [ -z "${STATIC_DATA_URL+x}" ]; then
  exit 0
fi

# From here the operator has ASKED for something, so every way of not delivering it is an error.
# A non-zero exit from a /docker-entrypoint.d/ script aborts container start — measured — so these
# refuse to serve rather than serve something that ignores the configuration it was given.
if [ ! -f "$CONFIG" ]; then
  echo "[esgame] ERROR: configuration was supplied but $CONFIG does not exist; nothing to inject into." >&2
  exit 1
fi

# Replace one string-valued key, then read back what is on disk rather than announcing what was
# intended. The substitution can fail on a shape sed did not anticipate — minified JSON, single
# quotes, a value spanning lines — and every one of those leaves a container serving the wrong
# configuration while claiming the right one.
inject() {
  key="$1"
  val="$2"

  # The key must be THERE to be replaced. sed exits 0 whether or not it matched, so without this a
  # config.json that does not contain the key — a deployment mounting its own, for instance — got
  # copied through untouched while this script printed that it had set it. Measured against a
  # config lacking "calcUrl": the log said calcUrl="http://example.invalid:9999" and the served
  # file said {"staticDataUrl":...,"defaultMode":"static"}.
  if ! grep -q "\"${key}\"" "$CONFIG"; then
    echo "[esgame] ERROR: $CONFIG has no \"${key}\" key, so it cannot be injected." >&2
    echo "[esgame]        A mounted config.json must carry the key, even if its value is empty." >&2
    exit 1
  fi

  # '#' delimits the sed expression below, so a '#' in the value would end it early and produce a
  # sed error or, worse, a partial replacement.
  case "$val" in
    *'#'*) echo "[esgame] ERROR: ${key} value contains '#', which this cannot inject safely." >&2; exit 1 ;;
  esac

  tmp="$(mktemp)"
  sed "s#\"${key}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"#\"${key}\": \"${val}\"#" "$CONFIG" > "$tmp"
  mv "$tmp" "$CONFIG"
  # mktemp creates a 0600 file; restore world-read so the nginx worker can serve it.
  chmod 644 "$CONFIG"

  got="$(sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$CONFIG" | head -1)"
  if [ "$got" != "$val" ]; then
    echo "[esgame] ERROR: ${key} is \"$got\" after substitution, expected \"$val\"." >&2
    echo "[esgame]        $CONFIG is not in a shape this can edit." >&2
    exit 1
  fi
  echo "[esgame] runtime config: ${key}=\"${val}\" (verified on disk)"
}

# Checked before anything is written. The app falls back to the grid game for any unrecognised
# value, so a typo here would silently serve the wrong game rather than fail.
if [ -n "${DEFAULT_MODE+x}" ] && [ "$DEFAULT_MODE" != "static" ] && [ "$DEFAULT_MODE" != "dynamic" ]; then
  echo "[esgame] ERROR: DEFAULT_MODE is \"$DEFAULT_MODE\"; it must be \"static\" or \"dynamic\"." >&2
  exit 1
fi

[ -z "${CALC_URL+x}" ]         || inject calcUrl        "$CALC_URL"
[ -z "${DEFAULT_MODE+x}" ]     || inject defaultMode    "$DEFAULT_MODE"
[ -z "${DYNAMIC_DATA_URL+x}" ] || inject dynamicDataUrl "$DYNAMIC_DATA_URL"
[ -z "${STATIC_DATA_URL+x}" ]  || inject staticDataUrl  "$STATIC_DATA_URL"
