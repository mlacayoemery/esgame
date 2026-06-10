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
#
# (Both stacks publish the frontend on :81, so run one at a time on a given host.)

COMPOSE_STATIC  := docker compose -p esgame -f v2/docker-compose.yml
COMPOSE_DYNAMIC := docker compose -p esgame-dynamic -f v2/docker-compose.yml -f v2/docker-compose.dynamic.yml

.PHONY: esgame-build esgame-up esgame-down \
        esgame-dynamic-build esgame-dynamic-up esgame-dynamic-down

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
