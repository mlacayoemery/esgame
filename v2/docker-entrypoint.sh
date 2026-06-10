#!/bin/sh
# Inject runtime configuration into the served assets/config.json before nginx starts.
# This lets a single image target any backend/deployment via environment variables — no rebuild.
#
#   CALC_URL  -> overrides "calcUrl" (the calculation backend; empty string = fully client-side)
#
# Runs automatically via nginx's /docker-entrypoint.d/ hook (as root, during container init).
set -e

CONFIG=/usr/share/nginx/html/assets/config.json

if [ -f "$CONFIG" ] && [ -n "${CALC_URL+x}" ]; then
  tmp="$(mktemp)"
  # '#' delimiter avoids clashing with the '/' in URLs.
  sed "s#\"calcUrl\"[[:space:]]*:[[:space:]]*\"[^\"]*\"#\"calcUrl\": \"${CALC_URL}\"#" "$CONFIG" > "$tmp"
  mv "$tmp" "$CONFIG"
  # mktemp creates a 0600 root-owned file; restore world-read so the nginx worker can serve it.
  chmod 644 "$CONFIG"
  echo "[esgame] runtime config: calcUrl=\"${CALC_URL}\""
fi
