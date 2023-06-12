library(plumber)
r <- plumb("example.R")
r$run(port=8080)