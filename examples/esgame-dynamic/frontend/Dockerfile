# Example esgame-dynamic frontend: the upstream esgame image with this example's own config.json,
# which points it at the shipped dynamic example (examples/dataDynamicGridRect.json) and at this
# stack's calculator. The board, its zone and background maps and its suitability and consequence
# rasters all ship in the base image; this deployment supplies only the configuration.
ARG ESGAME_IMAGE=ghcr.io/mlacayoemery/esgame:master
FROM ${ESGAME_IMAGE}
# Only the deployment's own config.json. The board it names -- examples/dataDynamicGridRect.json --
# and every raster and icon that board draws already ship in ${ESGAME_IMAGE}, so this example no
# longer carries a fork of the dataset or copies of its images.
COPY config.json /usr/share/nginx/html/assets/
