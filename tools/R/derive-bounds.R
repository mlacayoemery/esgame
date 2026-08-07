# Derive the per-indicator normalisation bounds in tools/R/bounds.json.
#
#   Rscript tools/R/derive-bounds.R [base-raster] [out.json]
#
# Run it inside the calculation image, where `raster` and the geodata exist:
#   docker run --rm -v "$PWD/tools/R:/work" ghcr.io/mlacayoemery/esgame-calculation:master \
#       Rscript /work/derive-bounds.R
#
# WHY THESE BOUNDS EXIST
#
# Scores used to be normalised against the round's own min and max
# (`(HH - cellStats(HH,min)) / (cellStats(HH,max) - cellStats(HH,min))`). Three things were
# wrong with that, all measured against the golden allocation on 2026-08-07:
#
#   1. A landscape with no agriculture divides by zero. Every indicator returned NaN.
#   2. Scores were not comparable between rounds, because the scale moved with the data.
#   3. The RANKING WAS AN ARTEFACT AND WAS INVERTED. With one uniform source type the field's
#      shape is identical whatever the amplitude, so rescaling to the round's own range should
#      return the same score. It did not: all-ext_arable (amplitude 10) scored HH 49 and
#      all-agropark (amplitude 130) scored HH 40. The only thing that differed was how many
#      cells fell under the < 1 floor and were dropped. The game ranked the most intensive
#      agriculture as better for human health than the least.
#
# WHY THE BOUNDS ARE ON THE MEAN AND NOT ON THE CELL
#
# Bounding the cell was tried first, and is analytically tidy: no cell can exceed
# sum(ESGAME_SOURCES) = 350, and no receptor cell can exceed 350 * exp(-0.005 * 100) = 212.3,
# since a receptor is never itself a source. Both were measured and both are unusable, because
# the score is a MEAN over a receptor mask that is mostly far from any source:
#
#     ceiling                      golden        all-arable     all-agropark
#     350   sum of amplitudes      6/6/10/6/6    1/1/1/1/1      9/11/14/10/9
#     212.3 receptor-reachable     10/10/17/10/10 1/1/2/1/1     15/18/24/16/15
#     182   observed envelope      11/12/20/12/12 1/1/2/1/1     17/21/28/19/17
#
# Every allocation lands in the bottom third and the top of the scale is never used. Bounding
# the aggregate instead spans 0-100 by construction, and is the same shape as the constants in
# places' calculation.r (4.2, 180, 70) — which is what suggested it.
#
# WHAT THE TWO EXTREMES ARE
#
#   lo   every hexagon left as nature: no source cells, so the field is zero, every cell falls
#        under the floor, and exposure is zero. This is exactly the allocation that used to NaN.
#   hi   every hexagon set to agropark: the largest amplitude (130) everywhere it can be placed.
#        Measured to dominate mixed allocations on this raster — a 5-type striped allocation
#        reaches about 70% of it.
#
# THESE BOUNDS BELONG TO A BASE RASTER. They are derived from the geodata in /app/data, so a
# deployment that supplies its own must re-run this. That is the cost of scores that mean
# something; the previous scheme needed no derivation and produced the three defects above.
suppressMessages(library(raster))
suppressMessages(library(jsonlite))

args <- commandArgs(trailingOnly = TRUE)

# This script's own directory, so model.R is found wherever the file is mounted.
file_arg <- grep("^--file=", commandArgs(FALSE), value = TRUE)
script_dir <- if (length(file_arg)) dirname(sub("^--file=", "", file_arg[1])) else "."
source(file.path(script_dir, "model.R"))

base_path <- if (length(args) >= 1) args[1] else "/app/data/LU_and_NEW_hexa.tif"
out_path  <- if (length(args) >= 2) args[2] else file.path(script_dir, "bounds.json")

stopifnot("base raster is missing" = file.exists(base_path))
LU_hexa <- raster(base_path)

vals <- unique(raster::values(LU_hexa))
vals <- vals[!is.na(vals)]
# Board ids start at 100 precisely so they cannot collide with land-use codes 1-8; see
# make-base-raster.R, which had to fix a raster where they did.
hex_ids <- sort(vals[vals >= 100])
stopifnot("no hexagon ids (>=100) in the base raster; wrong file?" = length(hex_ids) > 0)
cat(sprintf("%s: %d hexagons, %d land-use cells\n", base_path, length(hex_ids),
            sum(!is.na(raster::values(LU_hexa)) & raster::values(LU_hexa) < 100)))

means_for <- function(code) {
  map <- cbind(hex_ids, rep(code, length(hex_ids)))
  LU_complete <- reclassify(LU_hexa, map, right = FALSE)
  tot <- esgame_airconctot(LU_complete)
  sapply(names(ESGAME_RECEPTORS), function(ind) {
    x <- esgame_indicator(tot, LU_complete, ESGAME_RECEPTORS[[ind]])
    v <- raster::values(x)
    v <- v[is.finite(v)]
    if (length(v) == 0) 0 else mean(v)
  })
}

cat("sweeping all-nature (60) ...\n");   lo <- means_for(60)
cat("sweeping all-agropark (50) ...\n"); hi <- means_for(50)

out <- list()
for (ind in names(ESGAME_RECEPTORS)) {
  if (!(hi[[ind]] > lo[[ind]])) {
    stop(sprintf("%s: derived hi (%.4f) does not exceed lo (%.4f); these bounds would divide by <=0",
                 ind, hi[[ind]], lo[[ind]]))
  }
  out[[ind]] <- list(lo = round(lo[[ind]], 4), hi = round(hi[[ind]], 4))
  cat(sprintf("  %-3s lo=%9.4f  hi=%9.4f\n", ind, lo[[ind]], hi[[ind]]))
}

out[["_derivation"]] <- list(
  base_raster = basename(base_path),
  cells = as.integer(sum(!is.na(raster::values(LU_hexa)))),
  hexagons = length(hex_ids),
  lo_allocation = "every hexagon = 60 (nature): no sources, zero exposure",
  hi_allocation = "every hexagon = 50 (agropark): amplitude 130, the largest",
  script = "tools/R/derive-bounds.R"
)
write(toJSON(out, auto_unbox = TRUE, pretty = TRUE), out_path)
cat(sprintf("wrote %s\n", out_path))
