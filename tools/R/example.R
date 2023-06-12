#* @get /hello
hello <- function() {
  print("Hello")
}

#* @post /hello
hellothere <- function(req, text ="World!") {
  print(paste("Hello ", text, sep = ""))
}