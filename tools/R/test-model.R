# esgame_score() must be right, not merely present.
#
# Base R and stopifnot, no testthat and no raster, so this runs in the CI job that already has
# R — the same trade coverage.R made. That is why model.R keeps the scoring arithmetic separate
# from the raster work: everything below is exercised here, and only the distance transforms
# need GDAL.
#
# What is being defended is specific. The scheme this replaced failed three ways, all measured
# on 2026-08-07 (tools/R/derive-bounds.R records the numbers), and each has a case here:
#   * NaN on a landscape with no agriculture              -> "no agriculture scores 0"
#   * scores not comparable between rounds                -> "the scale does not move with the data"
#   * ranking inverted by the < 1 floor                   -> "more intensive scores higher"
#
#   Rscript tools/R/test-model.R

for (.p in c("model.R", "tools/R/model.R")) if (file.exists(.p)) { source(.p); break }
stopifnot("model.R not found" = exists("esgame_score"))

pass <- 0L
ok <- function(what, cond) {
  if (!isTRUE(cond)) { cat("  FAIL ", what, "\n"); quit(status = 1) }
  pass <<- pass + 1L
  cat("  ok   ", what, "\n")
}
fails <- function(what, expr) {
  ok(what, inherits(try(expr, silent = TRUE), "try-error"))
}

cat("==> esgame_score: the fixed-bound arithmetic\n")
ok("the floor scores 0",                 esgame_score(c(0), 0, 100) == 0)
ok("the ceiling scores 100",             esgame_score(c(100), 0, 100) == 100)
ok("the midpoint scores 50",             esgame_score(c(50), 0, 100) == 50)
ok("it scores the MEAN, not the max",    esgame_score(c(0, 100), 0, 100) == 50)
ok("a non-zero floor shifts the scale",  esgame_score(c(20), 10, 110) == 10)

cat("==> the NaN this replaced\n")
# This used to be reachable by an ordinary allocation: with no agriculture the field was zero
# everywhere, every cell fell under the floor and was dropped, and the mask emptied.
# mean(numeric(0)) is NaN, and the old formula ALSO divided by (max - min) = 0. The floor is gone
# so that allocation now yields zeros, but an empty vector is still reachable — a receptor class
# with no cells on the map — and the answer is the one the model implies: no exposure.
ok("no agriculture scores 0, not NaN",   esgame_score(numeric(0), 0, 32.472) == 0)
ok("...and it is not NA either",         !is.na(esgame_score(numeric(0), 0, 32.472)))
ok("an all-NA mask scores 0",            esgame_score(c(NA_real_, NA_real_), 0, 10) == 0)
ok("NaN cells are dropped, not spread",  esgame_score(c(5, NaN, 5), 0, 10) == 50)
ok("Inf is dropped rather than winning", esgame_score(c(5, Inf), 0, 10) == 50)

cat("==> the scale must not move with the data\n")
# The defect that made rounds incomparable: the same exposure has to score the same whatever
# else is in the round.
a <- esgame_score(c(10), 0, 100)
ok("same value, sparse round",           esgame_score(c(10), 0, 100) == a)
ok("same value, wide round",             esgame_score(c(10, 10, 10), 0, 100) == a)
ok("a second round cannot rescale it",   esgame_score(c(10), 0, 100) == esgame_score(c(10), 0, 100))

cat("==> the ranking must follow exposure\n")
# The inversion: under the old scheme all-ext_arable (amplitude 10) scored HH 49 and
# all-agropark (amplitude 130) scored HH 40. Higher exposure must score higher.
b <- vapply(c(5, 10, 20, 40), function(x) esgame_score(c(x), 0, 100), numeric(1))
ok("monotonic in exposure",              !is.unsorted(b) && b[1] < b[4])

cat("==> clamping, because bounds belong to a base raster\n")
ok("above the ceiling clamps to 100",    esgame_score(c(500), 0, 100) == 100)
ok("below the floor clamps to 0",        esgame_score(c(-5), 0, 100) == 0)

cat("==> bounds that would score silently wrong are refused\n")
fails("hi == lo divides by zero",        esgame_score(c(1), 5, 5))
fails("hi < lo inverts the scale",       esgame_score(c(1), 10, 5))
fails("a non-finite bound",              esgame_score(c(1), 0, Inf))
fails("a missing bound",                 esgame_score(c(1), 0, NA_real_))

cat("==> the receptor and source tables model.R declares\n")
ok("five indicators",                    length(ESGAME_RECEPTORS) == 5)
ok("RV takes two land-use classes",      identical(ESGAME_RECEPTORS$RV, c(6, 8)))
ok("five source types",                  length(ESGAME_SOURCES) == 5)
ok("amplitudes sum to 350",              sum(ESGAME_SOURCES) == 350)
ok("agropark is the largest amplitude",  ESGAME_SOURCES[["50"]] == max(ESGAME_SOURCES))
# The floor is GONE, and this is the assertion that keeps it gone. It dropped every receptor cell
# under 1, which emptied 93% of a cautious allocation's map and lifted the bottom of the score
# range; reintroducing the constant would restore both silently, since nothing else here reads it.
ok("there is no exposure floor",         !exists("ESGAME_FLOOR"))

cat("==> bounds.json must be loadable and complete\n")
bp <- Filter(file.exists, c("bounds.json", "tools/R/bounds.json"))[1]
ok("bounds.json is present",             !is.na(bp))
b <- esgame_load_bounds(bp)
for (ind in names(ESGAME_RECEPTORS)) {
  ok(sprintf("%s has usable bounds", ind), is.numeric(b[[ind]]$hi) && b[[ind]]$hi > b[[ind]]$lo)
}
fails("a missing file is refused",       esgame_load_bounds("no-such-bounds.json"))

cat(sprintf("\nmodel.R tests: PASS   %d/%d assertions\n", pass, pass))
