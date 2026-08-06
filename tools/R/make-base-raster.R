# Derives v2/src/assets/images/LU_and_NEW_hexa.tif from the two rasters it is named after.
#
# WHY THIS EXISTS
#
# calculator.r does reclassify(LU_hexa, map_AG): the allocation's `id`s are looked up as VALUES in
# this raster and replaced with the chosen land use. So the ids in here have to be the ids the
# board uses, and the file that had been committed did not have them.
#
# Measured on the file this replaces, against New_hexagons.tif (the board the browser renders):
#
#   board ids          100 .. 46500 in hundreds, 465 of them
#   committed raster     1 .. 474,               462 distinct
#   ids in common        4 of 465
#
# So reclassify() was very nearly a no-op and the round returned the same five scores whatever the
# player did. That is recorded under "the committed base raster" in docs/verification-status.rst.
#
# And a second defect, which is worse because it is not merely inert. The committed raster reuses
# 1,2,4,5,6,7,8 as BOTH hexagon ids and land-use codes. reclassify() matches on value, not on
# location, so allocating to hexagon 4 also rewrote every land-use-class-3 cell on the map —
# silently changing terrain the player never touched. Board ids start at 100, so the raster this
# script produces cannot collide with the 2..8 land-use codes at all.
#
# PROVENANCE
#
# Both inputs are already in this repository and are not modified. Their non-NA masks are disjoint
# (65,826 hexagon cells + 56,389 land-use cells = 122,215, exactly the combined count), so this is
# a mosaic and nothing has to be invented:
#
#   hexagon cells    <- New_hexagons.tif       (ids 100..46500, the board's own numbering)
#   remaining cells  <- New_Land_use_only.tif  (land-use classes 2..8)
#
# The script asserts every one of those properties rather than assuming them, and refuses to write
# a file that fails any of them.
#
#   docker run --rm --entrypoint Rscript \
#     -v "$PWD/v2/src/assets/images:/d" \
#     -v "$PWD/tools/R/make-base-raster.R:/make.R:ro" \
#     ghcr.io/mlacayoemery/esgame-calculation:master /make.R
#
# Needs the `raster` package, which is why it is run in the calculation image rather than locally.

suppressMessages(library(raster))

dir <- Sys.getenv("ESGAME_ASSETS", "/d")
hex_path <- file.path(dir, "New_hexagons.tif")
lu_path  <- file.path(dir, "New_Land_use_only.tif")
out_path <- file.path(dir, "LU_and_NEW_hexa.tif")

stopifnot("New_hexagons.tif is missing"      = file.exists(hex_path))
stopifnot("New_Land_use_only.tif is missing" = file.exists(lu_path))

hex <- raster(hex_path)
lu  <- raster(lu_path)

# Same grid, or a mosaic would silently misalign the two.
stopifnot("the two inputs are not on the same grid" =
            identical(dim(hex), dim(lu)) && identical(res(hex), res(lu)) &&
            identical(as.vector(extent(hex)), as.vector(extent(lu))))

hv <- values(hex); lv <- values(lu)
mhex <- !is.na(hv); mlu <- !is.na(lv)

# Disjoint, or "which wins" would be a decision this script is not entitled to make.
stopifnot("hexagon and land-use cells overlap; this is not a clean mosaic" = !any(mhex & mlu))

board_ids <- sort(unique(hv[mhex]))
lu_codes  <- sort(unique(lv[mlu]))
cat(sprintf("board:     %d hexagons, ids %d..%d\n", length(board_ids), min(board_ids), max(board_ids)))
cat(sprintf("land use:  %d cells, codes %s\n", sum(mlu), paste(lu_codes, collapse = ",")))

# The defect this file exists to prevent, asserted rather than trusted.
collide <- intersect(board_ids, lu_codes)
stopifnot("board ids collide with land-use codes; reclassify would rewrite terrain" =
            length(collide) == 0)

out <- hex
ov <- hv
ov[mlu] <- lv[mlu]
values(out) <- ov

# What we just built has to be right, or writing it makes things worse than they were.
nv <- values(out)
stopifnot("output lost cells"        = sum(!is.na(nv)) == sum(mhex) + sum(mlu))
stopifnot("hexagon ids did not survive" = all(nv[mhex] == hv[mhex]))
stopifnot("land-use codes did not survive" = all(nv[mlu] == lv[mlu]))
stopifnot("output does not carry every board id" =
            length(setdiff(board_ids, unique(nv[!is.na(nv)]))) == 0)

# raster's overwrite= is not enough here (writeStart still refuses an existing file), and the
# output has to replace the input's sibling in place, so remove it explicitly first.
if (file.exists(out_path)) unlink(out_path)
writeRaster(out, out_path, NAflag = -9999)
cat(sprintf("wrote %s  (%d cells, %d board ids, %d land-use codes)\n",
            out_path, sum(!is.na(nv)), length(board_ids), length(lu_codes)))
