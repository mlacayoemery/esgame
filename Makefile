# Local deployment of esgame as two Docker Compose stacks:
#
#   esgame          the static frontend only (client-side grid / Configuration 2) -
#                   exactly what https://<owner>.github.io/esgame/ hosts.
#   esgame-dynamic  that frontend plus the R calculator + GeoServer (dynamic mode;
#                   the additional containers places needs).
#
#   make esgame-up             build + start the static 'esgame' stack   (frontend :81)
#   make esgame-down           stop + remove the 'esgame' stack
#   make esgame-dynamic-up     build + start 'esgame-dynamic'            (:81, :8000, :8080)
#   make esgame-dynamic-down   stop + remove the 'esgame-dynamic' stack
#   make esgame-dynamic-example-up    self-contained dynamic EXAMPLE (esgame's own data + simple
#                                     FastAPI calculator + seeded GeoServer) - playable end to end
#   make esgame-dynamic-example-down  stop + remove the example
#
# (All stacks publish the frontend on :81, so run one at a time on a given host.)

COMPOSE_STATIC  := docker compose -p esgame -f v2/docker-compose.yml
COMPOSE_DYNAMIC := docker compose -p esgame-dynamic -f v2/docker-compose.yml -f v2/docker-compose.dynamic.yml
COMPOSE_EXAMPLE := docker compose -p esgame-dynamic-example -f examples/esgame-dynamic/docker-compose.yml
COMPOSE_PYGEOAPI := docker compose -p esgame-dynamic-pygeoapi -f examples/esgame-dynamic/docker-compose.pygeoapi.yml

.PHONY: esgame-build esgame-up esgame-down \
        esgame-dynamic-build esgame-dynamic-up esgame-dynamic-down \
        esgame-dynamic-example-build esgame-dynamic-example-up esgame-dynamic-example-down \
        esgame-dynamic-pygeoapi-build esgame-dynamic-pygeoapi-up esgame-dynamic-pygeoapi-down

# ---- static 'esgame' stack (frontend only) ----

## Build the esgame frontend image locally.
esgame-build:
	$(COMPOSE_STATIC) build

## Build the image, then start the 'esgame' stack in the background.
esgame-up: esgame-build
	$(COMPOSE_STATIC) up -d
	@echo ""
	@echo "esgame stack up:  http://localhost:81/   (static grid / Configuration 2)"

## Stop and remove the 'esgame' stack.
esgame-down:
	$(COMPOSE_STATIC) down

# ---- full 'esgame-dynamic' stack (frontend + calculator + geoserver) ----

## Build the esgame-dynamic images locally (frontend + calculator).
esgame-dynamic-build:
	$(COMPOSE_DYNAMIC) build

## Build the images, then start the 'esgame-dynamic' stack in the background.
esgame-dynamic-up: esgame-dynamic-build
	$(COMPOSE_DYNAMIC) up -d
	@echo ""
	@echo "esgame-dynamic stack up:"
	@echo "  frontend    http://localhost:81/"
	@echo "  calculator  http://localhost:8000/"
	@echo "  geoserver   http://localhost:8080/geoserver"

## Stop and remove the 'esgame-dynamic' stack.
esgame-dynamic-down:
	$(COMPOSE_DYNAMIC) down

# ---- self-contained dynamic EXAMPLE (esgame's own data, simple calculator, seeded geoserver) ----
# Builds the esgame base locally so it runs without pulling the (private) ghcr image.

ESGAME_BASE := local/esgame-core:latest

## Build the esgame base + the example images (frontend overlay, calculator, seeder).
esgame-dynamic-example-build:
	docker build -t $(ESGAME_BASE) v2
	ESGAME_IMAGE=$(ESGAME_BASE) $(COMPOSE_EXAMPLE) build

## Build + start the playable dynamic example in the background.
esgame-dynamic-example-up: esgame-dynamic-example-build
	$(COMPOSE_EXAMPLE) up -d
	@echo ""
	@echo "esgame-dynamic example up:  http://localhost:81/  (place fields, press Next Level)"
	@echo "  calculator http://localhost:8000/   geoserver http://localhost:8080/geoserver"
	@echo "  (GeoServer needs ~30-60s to start + be seeded before round 2 works)"

## Stop and remove the example (keeps the geoserver-data volume; add 'down -v' to wipe it).
esgame-dynamic-example-down:
	$(COMPOSE_EXAMPLE) down

# ---- the same example, but with pygeoapi (READ-ONLY) instead of GeoServer ----
# A lighter-weight drop-in: pygeoapi serves the consequence rasters as OGC API - Coverages from a
# static config — no catalog, no persistent volume, no seeder. READ-ONLY: there is no runtime
# publish/REST API. Shares the 81/8000 ports with the GeoServer example, so run only one at a time.

## Build the esgame base + the pygeoapi-variant images.
esgame-dynamic-pygeoapi-build:
	docker build -t $(ESGAME_BASE) v2
	ESGAME_IMAGE=$(ESGAME_BASE) $(COMPOSE_PYGEOAPI) build

## Build + start the pygeoapi variant of the example in the background.
esgame-dynamic-pygeoapi-up: esgame-dynamic-pygeoapi-build
	$(COMPOSE_PYGEOAPI) up -d
	@echo ""
	@echo "esgame-dynamic (pygeoapi) up:  http://localhost:81/  (place fields, press Next Level)"
	@echo "  calculator http://localhost:8000/   pygeoapi http://localhost:5005/"
	@echo "  (pygeoapi starts in a few seconds; rasters are read-only, from its static config)"

## Stop and remove the pygeoapi variant.
esgame-dynamic-pygeoapi-down:
	$(COMPOSE_PYGEOAPI) down
