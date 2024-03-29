install.packages('geosapi')
library(geosapi)
#see https://cran.r-project.org/web/packages/geosapi/vignettes/geosapi.html
#cite https://doi.org/10.5281/zenodo.1184895

#remove.packages("geosapi")
#install.packages("C:/Users/Martin/Workspace/geosapi", 
#                 repos = NULL, 
#                 type = "source")

gsman <-GSManager$new(
  url = "http://localhost:80/geoserver", #baseUrl of the Geoserver
  user = "admin", pwd = "geoserver", #credentials
  logger = NULL #logger, for info or debugging purpose
)

#create new workspace
#deleted <- gsman$deleteWorkspace("esgame", recurse = TRUE)
created <- gsman$createWorkspace("esgame", "https://esgame.unige.ch")

#create new datastore
ds = GSShapefileDirectoryDataStore$new(dataStore="esgame_datastore",
                                      description = "esgame_datastore description",
                                      enabled = TRUE,
                                      url = "file:data/sf")
created <- gsman$createDataStore("risk", ds)

#options(error = function() {
#  sink(stderr())
#  on.exit(sink(NULL))
#  traceback(3, max.lines = 1L)
#  if (!interactive()) {
#    q(status = 1)
#  }
#})

uploaded <- gsman$uploadShapefile(
  ws = "esgame", ds = "poi",
  endpoint = "file", configure = "first", update = "overwrite",
  charset = "UTF-8", filename = "C:/Users/Martin/workspace/esgame/tools/R/poi.zip"
)

#packageVersion("geosapi")
#packageVersion("httr")

#library(packrat)
#packrat:::recursivePackageDependencies("geosapi",lib.loc = .libPaths()[1])
