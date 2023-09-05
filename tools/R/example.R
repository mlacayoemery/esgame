library(jsonlite)
#see https://cran.r-project.org/web/packages/jsonlite/vignettes/json-aaquickstart.html

source("Tradeoff_Game.R")

#* @post /hellojson
esgame <- function(req, json_in) {
  #jsontext = fromJSON(jsontext, simplifyVector= TRUE)
  
  game_id <-
  round_id <-
  score <-
  map_df <-
  
  json_out <- calculate(game_id, round_id, score, map_df)

  print(json_out)
}