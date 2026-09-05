# ---- Build stage ----
# Angular 22 requires Node ^22.22.3 || ^24.15.0 || >=26.0.0. Track the newest
# accepted major, matching the 26.5.0 pin in ci.yml / deploy.yml.
FROM node:26-alpine AS build
WORKDIR /app

# Install deps first for better layer caching (only re-runs when lockfile changes)
COPY v2/package.json v2/package-lock.json ./
RUN npm ci

COPY v2/ ./

# THE BUILD CONTEXT IS THE REPOSITORY ROOT, not v2/. The two shipped example games are authored
# in examples/ at the top of the repository, and an image built from a v2/ context could not see
# them -- it would build cleanly and serve a game whose board 404s. scripts/sync-examples.mjs
# (npm prebuild) copies them into src/assets; WORKDIR is /app, so ../examples is /examples, which
# is where that script looks. Same mechanism as a local build, not a second one.
COPY examples/*.json /examples/
# Image serves from the domain root; a reverse proxy maps host/path -> this container.
RUN npm run build -- --base-href / --configuration production

# ---- Runtime stage ----
# The same nginx build as nginx:alpine (1.31.3 at time of writing), packaged to run as uid 101
# with its pid file and temp paths under /tmp. It listens on 8080 rather than 80: a non-root
# process cannot bind a privileged port without CAP_NET_BIND_SERVICE, and the point of running
# unprivileged is not to hand the capability back. Callers keep their published port: the k8s
# Service still listens on 80 (only its targetPort moved) and compose still maps host 81.
FROM nginxinc/nginx-unprivileged:alpine

# Tuned config: gzip, long-cache hashed assets, no-cache runtime config, SPA fallback
COPY v2/nginx.conf /etc/nginx/conf.d/default.conf

# --chown because the entrypoint below rewrites assets/config.json in place, as uid 101.
# Without it the tree lands root-owned and the rewrite fails on a directory it cannot write —
# and it fails *late*, at container start, not at build time.
COPY --from=build --chown=101:101 /app/dist/tradeoff-v2/ /usr/share/nginx/html

# Injects runtime configuration (e.g. CALC_URL) into assets/config.json before nginx starts,
# so one image serves any backend/dataset without a rebuild. Runs via nginx's /docker-entrypoint.d hook.
COPY --chown=101:101 v2/docker-entrypoint.sh /docker-entrypoint.d/40-esgame-config.sh
RUN chmod +x /docker-entrypoint.d/40-esgame-config.sh

EXPOSE 8080

# Use 127.0.0.1 (not localhost) so the probe doesn't resolve to IPv6 [::1] before nginx is reachable.
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
