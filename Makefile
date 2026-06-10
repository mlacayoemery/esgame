# Local deployment of the esgame stack (frontend + R calculator + geoserver).
#
#   make esgame-up     build the images and start the 'esgame' stack (detached)
#   make esgame-down   stop and remove the 'esgame' stack
#   make esgame-build  build the local images only
#
# The stack is the Docker Compose project named 'esgame'; its containers are
# esgame-core (frontend, :81), esgame-calculator (:8000), and esgame-geoserver (:8080).

STACK   := esgame
COMPOSE := docker compose -p $(STACK) -f v2/docker-compose.yml

.PHONY: esgame-build esgame-up esgame-down

## Build the esgame images locally (frontend + calculator).
esgame-build:
	$(COMPOSE) build

## Build the images, then bring up the 'esgame' stack in the background.
esgame-up: esgame-build
	$(COMPOSE) up -d
	@echo ""
	@echo "esgame stack '$(STACK)' is up:"
	@echo "  frontend    http://localhost:81/"
	@echo "  calculator  http://localhost:8000/"
	@echo "  geoserver   http://localhost:8080/geoserver"

## Stop and remove the 'esgame' stack (containers + network).
esgame-down:
	$(COMPOSE) down
