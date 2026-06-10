# One-shot GeoServer seeder image (curl + the seed script).
FROM alpine:3.20
RUN apk add --no-cache curl
COPY seed.sh /seed.sh
RUN chmod +x /seed.sh
ENTRYPOINT ["/seed.sh"]
