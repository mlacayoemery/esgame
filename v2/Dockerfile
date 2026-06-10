# ---- Build stage ----
# Node 22.22.3+ required by Angular 22 (engines: ^22.22.3 || ^24.15.0 || >=26).
FROM node:22-alpine AS build
WORKDIR /app

# Install deps first for better layer caching (only re-runs when lockfile changes)
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Image serves from the domain root; a reverse proxy maps host/path -> this container.
RUN npm run build -- --base-href / --configuration production

# ---- Runtime stage ----
FROM nginx:alpine

# Tuned config: gzip, long-cache hashed assets, no-cache runtime config, SPA fallback
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist/tradeoff-v2/ /usr/share/nginx/html

# Injects runtime configuration (e.g. CALC_URL) into assets/config.json before nginx starts,
# so one image serves any backend/dataset without a rebuild. Runs via nginx's /docker-entrypoint.d hook.
COPY docker-entrypoint.sh /docker-entrypoint.d/40-esgame-config.sh
RUN chmod +x /docker-entrypoint.d/40-esgame-config.sh

EXPOSE 80

# Use 127.0.0.1 (not localhost) so the probe doesn't resolve to IPv6 [::1] before nginx is reachable.
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
