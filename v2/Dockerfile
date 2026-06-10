# ---- Build stage ----
FROM node:20-alpine AS build
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

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://localhost/ || exit 1
