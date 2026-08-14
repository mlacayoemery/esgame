# The static game's calculator, as a service.
#
#   docker build -t esgame-static-calculator tools/calculator
#   docker run --rm -p 8000:8000 esgame-static-calculator
#
# WHY THIS IS SO SMALL. The model is a signed sum over a 29 x 28 grid of integers — it needs no
# geospatial stack, no dataframe library and no numerical anything. Measured 2026-08-15:
#
#   python:3.14-alpine + this source        ~72 MB
#   oven/bun:1-alpine                        146 MB
#   node:26-alpine                           251 MB
#   ghcr.io/mlacayoemery/esgame-calculation  2590 MB   (sf, sp, raster, tidyverse, ggpubr, geosapi)
#
# The two calculators do different things and the sizes are not a criticism of the R one: it solves
# a distance-decay concentration field over a 468 x 335 raster and publishes coverages to GeoServer.
# This one adds up integers, and paying 2.5 GB to do that would be the mistake.
#
# NO PIP INSTALL, ANYWHERE IN THIS FILE. The standard library is the whole runtime, so there is no
# lockfile to drift, no wheel to audit and nothing for Dependabot to raise. The base image is still
# watched — see .github/dependabot.yml, which tools/dependabot-coverage.sh requires to name every
# directory holding a Dockerfile.
FROM python:3.14-alpine

# Unbuffered, or the startup lines and every request log sit in a pipe buffer and a container that
# is running looks like a container that hung. Measured on the R calculator, which needed the same.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app
COPY src/ ./src/
COPY data/ ./data/

# uid 10001 with gid 0, matching tools/R/Dockerfile, so the same runAsNonRoot / runAsUser assertions
# work against either calculator. Numeric rather than named: runAsNonRoot cannot tell what a named
# user resolves to in every runtime, which is the whole reason the R image was renumbered.
RUN adduser --system --uid 10001 --ingroup root --no-create-home --shell /sbin/nologin esgame \
 && chown -R 10001:0 /app \
 && chmod -R g=u /app
USER 10001

# Nothing here writes: the pack is read once at startup and the model allocates only per request.
# So this image runs unchanged under readOnlyRootFilesystem with no writable mount at all — unlike
# the R calculator, which needs /app/data and /tmp.
EXPOSE 8000

# The service refuses to start on a bad pack, so a container that is up has a usable board. This
# checks it is still answering, which is a different claim.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python3 -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health',timeout=2).status==200 else 1)"

CMD ["python3", "src/server.py"]
