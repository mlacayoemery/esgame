# The concentration field and the scoring, split out of calculator.r so that something other
# than a running plumber can compute them.
#
# The reason is tools/R/derive-bounds.R. Scores are normalised against fixed per-indicator
# bounds now, and those bounds are derived by running THIS model over two extreme allocations
# (all-nature and all-agropark). Deriving them by copying the field code into a second script
# would mean two implementations that can silently disagree — the thing coverage.R was split out
# to avoid. calculator.r and derive-bounds.R call the same functions here.
#
# Needs `raster`, so it cannot be unit-tested the way coverage.R is. The arithmetic that CAN be
# tested without GDAL — esgame_score() — is deliberately separated from the raster work, and
# tools/R/test-model.R covers it in base R.

# Source amplitudes, in the order calculator.r declared them. The land-use code is the key; the
# value is the amplitude of that type's contribution at distance zero.
#
# These five numbers are the whole basis of the normalisation ceiling: because the field is a
# sum of amp * exp(-decay * distance), no cell can exceed sum(ESGAME_SOURCES) = 350, and no
# RECEPTOR cell can exceed 350 * exp(-decay * cellsize), since a receptor is never itself a
# source. Neither turned out to be a usable score bound — see derive-bounds.R — but they are
# what makes the derived bounds checkable rather than arbitrary.
ESGAME_SOURCES <- c("10" = 10, "20" = 40, "30" = 70, "40" = 100, "50" = 130)
ESGAME_DECAY <- 0.005

# Receptor classes. Each indicator scores the concentration over the cells of its own land-use
# class; RV takes two.
ESGAME_RECEPTORS <- list(HH = 2, NP = 5, WA = 4, HC = 7, RV = c(6, 8))

# The model discards concentrations below this as NA. It is not a rounding threshold: it is why
# a landscape with no agriculture at all produces an EMPTY raster rather than a zero one, which
# is where the NaN came from. See esgame_score().
ESGAME_FLOOR <- 1


#' The total agricultural concentration field.
#'
#' One distance transform per source type, decayed and summed. A type with no cells present
#' contributes nothing, which is the `else airconc <- zero_raster` branch in the original.
esgame_airconctot <- function(LU_complete) {
  zero_raster <- LU_complete
  zero_raster[!is.na(zero_raster)] <- 0

  tot <- zero_raster
  for (code in names(ESGAME_SOURCES)) {
    lu <- as.numeric(code)
    if (!any(lu %in% raster::values(LU_complete))) next
    ag <- raster::reclassify(LU_complete, cbind(lu, 1), right = FALSE)
    ag <- raster::reclassify(ag, cbind(2, 70, NA), right = FALSE)
    dist <- raster::distance(ag)
    tot <- tot + (ESGAME_SOURCES[[code]] * exp(-ESGAME_DECAY * dist))
  }
  tot
}


#' One indicator's raster: the field masked to its receptor class, with sub-floor cells dropped.
esgame_indicator <- function(airconctot, LU_complete, codes) {
  x <- airconctot
  x[which(!(raster::values(LU_complete) %in% codes))] <- NA
  x[which(raster::values(x) < ESGAME_FLOOR)] <- NA
  x
}


#' The score for one indicator: its mean exposure, on a fixed 0-100 scale.
#'
#' `lo`/`hi` come from tools/R/bounds.json and bound the MEAN, not the cell. Bounding the cell
#' was tried first and measured: because the mean runs over a receptor mask that is mostly far
#' from any source, no cell-level ceiling put a score above about 28, and the analytic ceiling
#' of 350 put every allocation between 1 and 14. Bounding the aggregate uses the whole scale.
#'
#' AN EMPTY VECTOR SCORES 0, AND THAT IS THE NaN FIX. With no agriculture allocated the field is
#' zero everywhere, every cell falls below ESGAME_FLOOR and is dropped, and the mask empties —
#' so `mean()` of nothing is NaN. That is not missing data: it is a landscape with no emission
#' sources, whose exposure is zero and is known to be zero. The old round-relative formula also
#' divided by (max - min) = 0 here, so this used to fail twice for the same allocation; fixed
#' bounds remove the division, and this line removes the empty mean.
#'
#' No raster call, so tools/R/test-model.R can exercise it in base R.
esgame_score <- function(values, lo, hi) {
  stopifnot(is.numeric(lo), is.numeric(hi), length(lo) == 1, length(hi) == 1)
  if (!is.finite(lo) || !is.finite(hi) || hi <= lo) {
    stop(sprintf("bad bounds: lo=%s hi=%s; hi must exceed lo and both must be finite", lo, hi))
  }
  values <- values[is.finite(values)]
  m <- if (length(values) == 0) 0 else mean(values)
  # Clamped because the bounds are derived from one base raster. all-agropark maximises the
  # field on the raster they were derived from (agropark has the largest amplitude), but a
  # deployment that has not re-run derive-bounds.R could exceed them, and a score of 143 is
  # worse than a clamped 100 in a game whose axes are drawn 0-100.
  round(max(0, min(100, (m - lo) / (hi - lo) * 100)))
}


#' Read the derived bounds, refusing anything that would silently score wrong.
esgame_load_bounds <- function(path) {
  if (!file.exists(path)) {
    stop(sprintf("%s is missing; run tools/R/derive-bounds.R against this deployment's base raster", path))
  }
  b <- jsonlite::fromJSON(path)
  # Presence first, per indicator: a truncated or half-written file would otherwise scale
  # whichever indicators it did contain and drop the rest, which reads as a model change.
  for (ind in names(ESGAME_RECEPTORS)) {
    if (is.null(b[[ind]]) || is.null(b[[ind]]$lo) || is.null(b[[ind]]$hi)) {
      stop(sprintf("%s has no lo/hi for %s", path, ind))
    }
  }
  b
}
