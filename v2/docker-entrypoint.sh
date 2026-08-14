#!/bin/sh
# Inject runtime configuration into the served assets/config.json before nginx starts.
# This lets a single image target any backend/deployment via environment variables — no rebuild.
#
#   CALC_URL  -> overrides "calcUrl" (the calculation backend; empty string = fully client-side)
#
# Runs automatically via nginx's /docker-entrypoint.d/ hook during container init, as uid 101 —
# the image is unprivileged, so this replaces a file it must already own. The Dockerfile's
# `COPY --chown=101:101` of the dist tree is what makes that true; without it this fails here,
# at start, rather than at build.
set -e

CONFIG=/usr/share/nginx/html/assets/config.json

# CALC_URL unset means "leave the built-in config alone" — the client-side grid game, and the
# shipped default. Nothing to do, and nothing to say.
if [ -z "${CALC_URL+x}" ]; then
  exit 0
fi

# From here the operator has ASKED for a backend, so every way of not delivering one is an error.
# A non-zero exit from a /docker-entrypoint.d/ script aborts container start — measured — so these
# refuse to serve rather than serve something that ignores the configuration it was given.
if [ ! -f "$CONFIG" ]; then
  echo "[esgame] ERROR: CALC_URL is set but $CONFIG does not exist; nothing to inject into." >&2
  exit 1
fi

# The key must be THERE to be replaced. sed exits 0 whether or not it matched, so without this a
# config.json that does not contain "calcUrl" — a deployment mounting its own, for instance — got
# copied through untouched while this script printed that it had set it. Measured against a
# config lacking the key: the log said calcUrl="http://example.invalid:9999" and the served file
# said {"staticDataUrl":...,"defaultMode":"static"}.
if ! grep -q '"calcUrl"' "$CONFIG"; then
  echo "[esgame] ERROR: $CONFIG has no \"calcUrl\" key, so CALC_URL cannot be injected." >&2
  echo "[esgame]        A mounted config.json must carry the key, even if its value is empty." >&2
  exit 1
fi

tmp="$(mktemp)"
# '#' delimiter avoids clashing with the '/' in URLs.
sed "s#\"calcUrl\"[[:space:]]*:[[:space:]]*\"[^\"]*\"#\"calcUrl\": \"${CALC_URL}\"#" "$CONFIG" > "$tmp"
mv "$tmp" "$CONFIG"
# mktemp creates a 0600 file; restore world-read so the nginx worker can serve it.
chmod 644 "$CONFIG"

# Read back what is on disk rather than announcing what was intended. The substitution can fail on
# a shape sed did not anticipate — minified JSON, single quotes, a value spanning lines — and every
# one of those leaves a container serving the wrong backend while claiming the right one.
got="$(sed -n 's/.*"calcUrl"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$CONFIG" | head -1)"
if [ "$got" != "$CALC_URL" ]; then
  echo "[esgame] ERROR: calcUrl is \"$got\" after substitution, expected \"$CALC_URL\"." >&2
  echo "[esgame]        $CONFIG is not in a shape this can edit." >&2
  exit 1
fi
echo "[esgame] runtime config: calcUrl=\"${CALC_URL}\" (verified on disk)"
