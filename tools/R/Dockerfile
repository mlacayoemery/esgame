FROM rstudio/plumber

RUN apt-get update -qq && apt-get install -y libssl-dev libcurl4-gnutls-dev unixodbc-dev libmysqlclient-dev

RUN R -e "install.packages('Rcpp')"
RUN R -e "install.packages('sf')"
RUN R -e "install.packages('sp')"
RUN R -e "install.packages('raster')"
# NOTE: rgdal is intentionally absent. It was retired from CRAN in Oct 2023, so
# install.packages('rgdal') resolves to nothing while still exiting 0 — the image
# built "successfully" without it for years. calculator.r does not use it.
# 'grid' is likewise absent: it ships with R as a base package.
RUN R -e "install.packages('ggplot2')"
RUN R -e "install.packages('ggpubr')"
RUN R -e "install.packages('tidyverse')"
RUN R -e "install.packages('tidyr')"
RUN R -e "install.packages('jsonlite')"
# geosapi is on CRAN (0.8-1). It used to be installed at container START via
# remotes::install_github in calculator.r, which cost ~31s per boot, needed GitHub
# reachable at run time, and pulled whatever @HEAD happened to be.
RUN R -e "install.packages('geosapi')"
RUN R -e "install.packages('logger')"
RUN R -e "install.packages('devtools')"

RUN R -e "install.packages('remotes')"

RUN apt-get install -y libcurl4-openssl-dev libssl-dev libjq-dev libprotobuf-dev protobuf-compiler make libgeos-dev libudunits2-dev libgdal-dev gdal-bin libproj-dev libv8-dev

RUN apt-get install -y libsecret-1-dev libsodium-dev

WORKDIR /app

COPY . .

EXPOSE 8000

CMD ["/app/calculator.r"]