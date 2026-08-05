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

if [ -f "$CONFIG" ] && [ -n "${CALC_URL+x}" ]; then
  tmp="$(mktemp)"
  # '#' delimiter avoids clashing with the '/' in URLs.
  sed "s#\"calcUrl\"[[:space:]]*:[[:space:]]*\"[^\"]*\"#\"calcUrl\": \"${CALC_URL}\"#" "$CONFIG" > "$tmp"
  mv "$tmp" "$CONFIG"
  # mktemp creates a 0600 file; restore world-read so the nginx worker can serve it.
  chmod 644 "$CONFIG"
  echo "[esgame] runtime config: calcUrl=\"${CALC_URL}\""
fi
