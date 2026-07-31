FROM rstudio/plumber

# System libraries FIRST, then R packages. The previous order installed R packages and only
# then the apt layers, which meant a package could install cleanly and still fail to LOAD:
# geosapi pulls in keyring, whose shared object needs libsecret, so `requireNamespace('geosapi')`
# was FALSE at that point in the build even though install.packages had just succeeded.
#
# --no-install-recommends matters here: without it this layer was 632 MB and pulled in
# python3-numpy, libpoppler-dev and libhdf5-dev, none of which anything here uses. gdal-bin
# (the command-line tools), protobuf-compiler, libjq-dev, unixodbc-dev and libmysqlclient-dev
# went with it — calculator.r shells out to nothing and talks to no database.
#
# These are RUNTIME libraries, not -dev packages. Every R package here installs as a p3m binary
# for noble, so it links against the shared objects and never needs headers — swapping the six
# -dev packages for their runtime equivalents took the image from 3.10 GB to 2.58 GB.
#
# The trade-off: these names are tied to the Ubuntu release and the library soname
# (libgdal34t64 is noble/GDAL 3.8). If the base image moves to a newer Ubuntu they will not
# resolve. That fails the build immediately with "Unable to locate package", which is the good
# kind of failure — and the load check at the end covers the subtler one. If you ever add an R
# package that has no binary and compiles from source, add its -dev package back.
#
# libssl-dev and libcurl4-openssl-dev are gone too; the base already ships the runtime libssl3
# and libcurl4 that plumber itself needs. Verified below rather than assumed.
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends \
      libgdal34t64 \
      libgeos-c1t64 \
      libproj25 \
      libudunits2-0 \
      libsecret-1-0 \
      libsodium23 \
 && rm -rf /var/lib/apt/lists/*

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
# devtools and remotes were here. Nothing in calculator.r calls anything from either —
# they were left over from the run-time install_github, which is long gone. devtools alone
# was 39 MB of package-development toolchain (usethis, roxygen2, pkgdown) in a runtime image.

# Fail the build if anything calculator.r library()-s is not loadable. install.packages only
# WARNS on an unavailable package — that is how install.packages('rgdal') exited 0 and installed
# nothing for years — and a package can install fine yet fail to load when a system library is
# missing. Loading is the real test; presence in installed.packages() is not.
RUN R -q -e "\
  pkgs <- c('sf','sp','raster','ggplot2','ggpubr','tidyverse','tidyr','grid','jsonlite','geosapi','logger'); \
  bad <- pkgs[!vapply(pkgs, requireNamespace, logical(1), quietly = TRUE)]; \
  if (length(bad)) stop('not loadable: ', paste(bad, collapse = ', ')); \
  cat('all', length(pkgs), 'R packages load\n')"

# And the two things dropping the -dev packages could plausibly have broken, checked rather than
# assumed. sf loading proves it found libgdal/libproj; asking for the versions proves they work.
# TLS is the other one: geosapi talks to GeoServer over https in any real deployment, and losing
# libssl would not show up until a request failed at run time.
RUN R -q -e "\
  v <- sf::sf_extSoftVersion(); \
  cat('GDAL', v[['GDAL']], '/ PROJ', v[['PROJ']], '/ GEOS', v[['GEOS']], '\n'); \
  s <- curl::curl_fetch_memory('https://cran.r-project.org/')\$status_code; \
  if (s != 200) stop('TLS request failed with status ', s); \
  cat('https ok\n')"

WORKDIR /app

COPY . .

# Run as a normal user, so the Deployment can set runAsNonRoot and the kubelet can enforce it.
#
# Two things make this container the tractable one of the three. It listens on 8000, above the
# privileged range, so nothing needs CAP_NET_BIND_SERVICE to bind. And the only path it writes
# is /app/data — calculator.r does setwd() there and writes seven rasters plus the spider plot —
# which is an emptyDir in the base and a PVC in the places overlay, so it is a mount, not image
# content: the directory has to exist and be owned here, and the volume inherits that ownership
# via fsGroup.
#
# 10001 rather than a name so the manifests can assert runAsUser numerically. A named user alone
# would leave runAsNonRoot unable to tell what the image resolves to in some runtimes.
RUN useradd --system --uid 10001 --gid 0 --no-create-home --shell /usr/sbin/nologin esgame \
 && mkdir -p /app/data \
 && chown -R 10001:0 /app \
 && chmod -R g=u /app
USER 10001

EXPOSE 8000

CMD ["/app/calculator.r"]
