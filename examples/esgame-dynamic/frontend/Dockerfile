# Example esgame-dynamic frontend: the upstream esgame image with this example's SVG config
# (built from the static grid data) + the generated zone/background maps overlaid. The suitability
# and consequence source rasters (esgame_img_*) already ship in the base image.
ARG ESGAME_IMAGE=ghcr.io/mlacayoemery/esgame:master
FROM ${ESGAME_IMAGE}
COPY data.json config.json /usr/share/nginx/html/assets/
COPY assets/images/ /usr/share/nginx/html/assets/images/
