# Renders a consequence map under the three candidate colour ramps, so the choice between them can
# be looked at rather than argued about.
#
#   docker run --rm --entrypoint Rscript \
#     -e ESGAME_BASE_RASTER=LU_and_NEW_hexa.tif \
#     -v "$PWD/v2/src/assets/images:/app/data" \
#     -v "$PWD/tools/R:/work" -w /tmp \
#     ghcr.io/mlacayoemery/esgame-calculation:master /work/render-ramps.R
#
# (or `kubectl cp` it into a running calculation pod, which is how it was first run — the pod
# already has /app/data and a read-only root, so it writes into /tmp.)
#
# WHY THIS EXISTS
#
# docs/verification-status.rst measured, under "How many calculation replicas" and the scale
# discussion, that a FIXED LINEAR ramp puts a cautious player's whole map in the bottom 4-8% of the
# scale, and that a LOGARITHMIC one puts the same allocation at 27-41%. Those are numbers about
# where surviving cells land on a ramp. They say nothing about what the map LOOKS like, and the
# page says as much: the log option "wants a look at rendered output before anyone commits to it".
#
# This is that look. It reproduces the app's own colouring exactly rather than approximating it:
#
#   ratio  = 1 - (value - min) / (max - min)        TiffService.arrayToImage
#   colour = start * ratio + end * (1 - ratio)      Gradient.mix, gradients.ts
#   blue   = eff3ff -> 08519c                       the default consequence gradient
#
# so the only thing that differs between the three outputs is how `ratio` is derived.
#
# WHAT IT SHOWED, which the numbers did not
#
# The dominant reason a gentle allocation's map was unreadable was NOT the ramp. esgame_indicator()
# used to drop every cell below a floor of 1, and for a mostly-nature allocation that was most of
# the receptor mask — 1,377 of 21,105 HH cells, 7%. A colour ramp cannot render a cell that is not
# there, so no choice of ramp fixed that map. THE FLOOR WAS REMOVED on 2026-08-15 as a result;
# ESGAME_RENDER_FLOOR=1 reproduces the old picture for comparison. The ramp choice is separate, and
# visible here for mid and high allocations.

suppressMessages(library(raster))
source(if (file.exists("/app/model.R")) "/app/model.R" else "model.R")

# THE MODEL HAS NO FLOOR since 2026-08-15 — esgame_indicator() keeps every receptor cell. Set
# ESGAME_RENDER_FLOOR=1 to drop sub-1 cells for these renders only, which is what the maps looked
# like before, and is the comparison that decided it. Nothing here writes to the model.
RENDER_FLOOR <- local({
  o <- Sys.getenv("ESGAME_RENDER_FLOOR", "")
  if (!nzchar(o)) return(NA_real_)
  v <- suppressWarnings(as.numeric(o))
  if (is.na(v)) stop(sprintf("ESGAME_RENDER_FLOOR is '%s'; it must be a number.", o))
  cat(sprintf("dropping cells under %g for these renders\n", v))
  v
})

base <- Sys.getenv("ESGAME_BASE_RASTER")
if (!nzchar(base)) stop("set ESGAME_BASE_RASTER, e.g. LU_and_NEW_hexa.tif")
LU <- raster(file.path("/app/data", base))
v <- raster::values(LU)
ids <- sort(unique(v[!is.na(v) & v >= 100]))
cat(sprintf("board: %d units from %s\n", length(ids), base))

# Three allocations spanning the range the docs measured: gentle, mixed, and the envelope.
allocs <- list(
  "mostly-nature" = { a <- rep(60, length(ids)); a[seq(1, length(ids), by = 10)] <- 10; a },
  "half-and-half" = { a <- rep(60, length(ids)); a[seq(1, length(ids), by = 2)]  <- 40; a },
  "all-agropark"  = rep(50, length(ids))
)

# The app's blue gradient and its mix, so these renders are the app's colours and not a lookalike.
START <- c(0xef, 0xf3, 0xff); END <- c(0x08, 0x51, 0x9c)
mixcol <- function(ratio) ceiling(START * ratio + END * (1 - ratio))

# The all-agropark cell maximum, from the same measurement. Every fixed ramp is bounded by it.
ENVELOPE <- 78.85

# THE RAMP'S BOTTOM IS NOT THE MODEL'S FLOOR, and conflating them produced a wrong picture once.
# A logarithmic ramp needs a positive lower bound — log(x / L) is undefined for L <= 0 — and while
# ESGAME_FLOOR happened to be 1 it silently served as that bound. Removing the floor made it -Inf,
# every ratio came out NaN, as.raw() coerced NaN to 0, and the renders looked plausible and were
# not. So the ramp keeps its own bottom, whatever the model does with sub-floor cells.
RAMP_FLOOR <- 1

write_ppm <- function(vals, path, ratio_fn) {
  nr <- nrow(LU); nc <- ncol(LU)
  px <- matrix(255L, 3, nr * nc)          # white where the indicator has no value
  ok <- !is.na(vals)
  r <- pmax(0, pmin(1, ratio_fn(vals[ok])))
  # A colour that is not a number is the failure this exists to catch: as.raw() turns NaN into 0
  # without a word, so the image comes out looking like data.
  if (any(!is.finite(r))) {
    stop(sprintf("%d of %d ratios are not finite; the ramp cannot colour them", sum(!is.finite(r)), length(r)))
  }
  px[, ok] <- vapply(r, mixcol, numeric(3))
  con <- file(path, "wb")
  writeBin(charToRaw(sprintf("P6\n%d %d\n255\n", nc, nr)), con)
  writeBin(as.raw(as.vector(px)), con)
  close(con)
}

mask <- sum(v %in% ESGAME_RECEPTORS$HH, na.rm = TRUE)
cat(sprintf("HH receptor cells on this map: %d\n", mask))

for (name in names(allocs)) {
  LUc <- reclassify(LU, cbind(ids, allocs[[name]]), right = FALSE)
  hh <- esgame_indicator(esgame_airconctot(LUc), LUc, ESGAME_RECEPTORS$HH)
  if (!is.na(RENDER_FLOOR)) hh[which(raster::values(hh) < RENDER_FLOOR)] <- NA
  vals <- raster::values(hh)
  kept <- sum(!is.na(vals))
  lo <- min(vals, na.rm = TRUE); hi <- max(vals, na.rm = TRUE)
  cat(sprintf("%-14s %6d of %d cells drawn (%2.0f%%)   min %5.2f  max %5.2f\n",
              name, kept, mask, 100 * kept / mask, lo, hi))

  # a) what ships: stretched to the round's own range, so no two rounds are comparable
  write_ppm(vals, sprintf("ramp-%s-a-round-relative.ppm", name),
            function(x) 1 - (x - lo) / (hi - lo))
  # b) option C as posed: one fixed linear scale for every round
  write_ppm(vals, sprintf("ramp-%s-b-fixed-linear.ppm", name),
            function(x) 1 - (x - RAMP_FLOOR) / (ENVELOPE - RAMP_FLOOR))
  # c) option E: the same fixed bound, read logarithmically from the model's own floor
  write_ppm(vals, sprintf("ramp-%s-c-fixed-log.ppm", name),
            function(x) 1 - log(x / RAMP_FLOOR) / log(ENVELOPE / RAMP_FLOOR))
}
cat("wrote 9 PPMs in", getwd(), "\n")
