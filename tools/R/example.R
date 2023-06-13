library(jsonlite)
#see https://cran.r-project.org/web/packages/jsonlite/vignettes/json-aaquickstart.html

#* @get /hello
hello <- function() {
  print("Hello")
}

#* @post /hellothere
hellothere <- function(req, text ="World!") {
  print(paste("Hello ", text, sep = ""))
}

#* @post /hellojson
hellojson <- function(req, jsontext ="[{\"who\" : \"World!\"},{\"who\" : \"me!\"}]") {
  jsontext = fromJSON(jsontext, simplifyVector= TRUE)
  print(paste("Hello ", jsontext$who, sep = ""))
}