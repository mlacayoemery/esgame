# Derives v2/src/assets/images/New_rectangles.tif — a RECTANGULAR board over the same landscape
# the hexagonal board covers.
#
#   docker run --rm --entrypoint Rscript \
#     -v "$PWD/v2/src/assets/images:/d" \
#     -v "$PWD/tools/R/make-rect-board.R:/make.R:ro" \
#     ghcr.io/mlacayoemery/esgame-calculation:master /make.R
#
# WHAT A BOARD ACTUALLY IS HERE
#
# The dynamic game derives every playable shape from this raster: tiffToSvgPaths() emits one SVG
# path per distinct value, so the board's geometry is DATA, not code. That is why a rectangular
# board needs no frontend change at all — only a raster whose regions are rectangles.
#
# The thing that is easy to get wrong, and was: the hexagonal board is not a hexagonal tiling OF A
# REGION. It is a hexagonal lattice CLIPPED BY THE TERRAIN. New_hexagons.tif covers the farmland —
# 65,826 cells — and New_Land_use_only.tif covers what is woven through it: villages, woodland,
# watercourses, 56,389 cells, interleaved rather than surrounding. Rendered, the two masks look
# like a landscape mosaic, not like a blob with a border.
#
# That matters because the terrain is not scenery. ESGAME_RECEPTORS reads it — HH:2, NP:5, WA:4,
# HC:7, RV:6,8 — so every terrain cell a board unit swallowed would be a receptor deleted from the
# model. Measured over a 28x29 lattice of ALL-OR-NOTHING squares, which is what "make the pieces
# real rectangles" would require:
#
#   coverage threshold   squares   terrain absorbed   board dropped
#   25%                      490             48.6%            3.7%
#   50%                      361             23.0%           17.5%
#   75%                      229              7.5%           41.1%
#
# There is no threshold that is not ruinous, and going finer barely helps because the loss is not a
# boundary effect — the terrain runs THROUGH the board.
#
# So this script does what the hexagonal board already does: it lays down a regular lattice and
# clips it to exactly the same farmland mask. Interior units are true rectangles; units meeting a
# village or a stream are bitten into the same ragged shapes the hexagons already have today. The
# mask is preserved cell for cell, so no terrain is absorbed and no farmland is dropped.
#
# WHY bounds.json DOES NOT CHANGE
#
# derive-bounds.R's two extremes are "every unit left as nature" and "every unit set to agropark".
# Both depend only on WHICH CELLS the board covers, not on how those cells are grouped, and this
# board covers exactly the cells the hexagonal one does. The bounds are therefore identical by
# construction — asserted in tools/R/rect-board.test.R rather than assumed.
#
# THE LATTICE
#
# 28 columns x 29 rows, matching the static grid game's own board (dataGridExample.json is 28x29,
# of which 387 cells are empty — it too is an irregular shape inside a rectangle). The lattice
# spans the farmland's bounding box, which is 459 x 331 cells, so a unit is 16.4 x 11.4 cells =
# 1640 x 1140 m. Units are therefore wider than they are tall, and the SVG carries real
# coordinates, so they render as true rectangles rather than as a stretched square grid.

suppressMessages(library(raster))

dir <- Sys.getenv("ESGAME_ASSETS", "/d")
hex_path <- file.path(dir, "New_hexagons.tif")
out_path <- file.path(dir, "New_rectangles.tif")

stopifnot("New_hexagons.tif is missing" = file.exists(hex_path))

# 28 x 29 to match the static game's board. MIN_CELLS is the smallest unit worth playing: the
# lattice alone produces 611 units of which 38 hold fewer than ten cells and one holds a SINGLE
# cell — a game piece too small to see, let alone click. Merging everything under 30 cells (a unit
# of roughly 300 x 300 m) into a neighbour costs 82 units holding 1.6% of the board, and no cells
# at all, because the cells move rather than disappear. The hexagonal board's smallest unit is 55
# cells, so 30 is not an unfamiliar size.
NC <- 28L
NR <- 29L
MIN_CELLS <- 30L

hex <- raster(hex_path)
hv <- values(hex)
mask <- !is.na(hv)
nr <- nrow(hex); nc <- ncol(hex)

cat(sprintf("hexagonal board: %d units over %d cells (grid %d x %d)\n",
            length(unique(hv[mask])), sum(mask), nc, nr))

cells <- which(mask)
rows <- rowFromCell(hex, cells)
cols <- colFromCell(hex, cells)
r0 <- min(rows); r1 <- max(rows); c0 <- min(cols); c1 <- max(cols)
rh <- (r1 - r0 + 1) / NR
cw <- (c1 - c0 + 1) / NC
cat(sprintf("farmland bounding box: rows %d..%d, cols %d..%d  -> unit %.1f x %.1f cells\n",
            r0, r1, c0, c1, cw, rh))

# Lattice index per board cell. pmin() guards the last row/column, where floor() of an exact
# boundary would otherwise land one block past the end.
blk <- pmin(NR - 1L, as.integer(floor((rows - r0) / rh))) * NC +
       pmin(NC - 1L, as.integer(floor((cols - c0) / cw)))

# Merge undersized units into a neighbour, smallest first, by growing the large units into them one
# ring at a time. A cell takes the most common large-unit id among its eight neighbours, so a
# sliver is absorbed by whichever unit actually borders it rather than by whichever is numerically
# adjacent — the lattice index is not a spatial neighbour when a unit sits at a row end.
assign <- rep(NA_integer_, nr * nc)
assign[cells] <- blk
sizes <- table(blk)
small <- as.integer(names(sizes)[sizes < MIN_CELLS])
cat(sprintf("lattice units: %d, of which %d hold fewer than %d cells\n",
            length(sizes), length(small), MIN_CELLS))

if (length(small) > 0) {
  loose <- cells[blk %in% small]
  assign[loose] <- NA_integer_
  offsets <- c(-nc - 1L, -nc, -nc + 1L, -1L, 1L, nc - 1L, nc, nc + 1L)
  guard <- 0L
  while (length(loose) > 0) {
    guard <- guard + 1L
    stopifnot("merging did not converge; no large unit borders these cells" = guard <= 500L)
    taken <- integer(0)
    for (i in seq_along(loose)) {
      cand <- assign[loose[i] + offsets]
      cand <- cand[!is.na(cand)]
      if (length(cand) == 0) next
      tab <- table(cand)
      assign[loose[i]] <- as.integer(names(tab)[which.max(tab)])
      taken <- c(taken, i)
    }
    stopifnot("a ring of merging absorbed nothing; the remaining cells are isolated" =
                length(taken) > 0)
    loose <- loose[-taken]
  }
}

# Renumber in hundreds, exactly as New_hexagons.tif does. Land use uses codes 2..8 and
# calculator.r's reclassify() matches on VALUE, so a board id inside that range would rewrite
# terrain the player never touched — the defect make-base-raster.R was written to prevent.
final <- assign[cells]
ids <- sort(unique(final))
renum <- setNames(seq_along(ids) * 100L, as.character(ids))
out_values <- rep(NA_integer_, nr * nc)
out_values[cells] <- renum[as.character(final)]

board_ids <- sort(unique(out_values[cells]))
counts <- table(out_values[cells])

# Everything below is the point of the script: a board that quietly lost farmland, swallowed
# terrain, or collided with a land-use code would look completely normal in the browser.
stopifnot("the board mask changed; cells were gained or lost" =
            identical(which(!is.na(out_values)), cells))
stopifnot("board ids are not the expected hundreds" =
            identical(board_ids, seq_along(ids) * 100L))
stopifnot("board ids collide with land-use codes 2..8" =
            length(intersect(board_ids, 2:8)) == 0)
stopifnot("a unit is still under the minimum size" = min(counts) >= MIN_CELLS)

out <- hex
values(out) <- out_values
if (file.exists(out_path)) unlink(out_path)
writeRaster(out, out_path, NAflag = -9999, datatype = "INT4S")

cat(sprintf("wrote %s\n", out_path))
cat(sprintf("  %d rectangular units over %d cells (unchanged from the hexagonal board)\n",
            length(board_ids), sum(mask)))
cat(sprintf("  cells per unit: min %d  median %d  max %d\n",
            min(counts), as.integer(median(counts)), max(counts)))
