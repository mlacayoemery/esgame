library(geosapi)
#see https://cran.r-project.org/web/packages/geosapi/vignettes/geosapi.html

gsman <- GSManager$new(
  url = "http://localhost:80/geoserver", #baseUrl of the Geoserver
  user = "admin", pwd = "geoserver", #credentials
  logger = NULL #logger, for info or debugging purpose
)

#create new workspace
#deleted <- gsman$deleteWorkspace("esgame", recurse = TRUE)
created <- gsman$createWorkspace("esgame", "https://esgame.unige.ch")

#create new datastore
# ds = GSShapefileDirectoryDataStore$new(dataStore="esgame_datastore",
#                                        description = "esgame_datastore description",
#                                        enabled = TRUE,
#                                        url = "file:data/sf")
# created <- gsman$createDataStore("risk", ds)

uploaded <- gsman$uploadShapefile(
  ws = "esgame", ds = "poi",
  endpoint = "file", configure = "first", update = "overwrite",
  charset = "UTF-8", filename = "C:/Users/Martin/workspace/esgame/tools/R/poi.shp"
)
