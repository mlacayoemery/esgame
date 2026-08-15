# Tests for publish.R — which of three places a round's rasters go, and what URL comes back.
#
#   Rscript tools/R/test-publish.R
#
# Base R and `stopifnot`, deliberately, like test-coverage.R: no testthat, no raster, no GDAL. The
# whole point of splitting the publisher out of calculate() is that it can be exercised without a
# GeoServer, a cluster, or a 2.6 GB image.
#
# What is being guarded: a misconfigured publisher does not fail a round. The score is computed
# before anything is published, so a wrong directory or a missing base URL produces a 200 with
# five URLs that fetch nothing — the same shape as the compose stack publishing to a stranger's
# GeoServer for months. Every refusal here is one that would otherwise have been a silent success.

here <- dirname(sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value = TRUE)[1]))
if (is.na(here) || !nzchar(here)) here <- "tools/R"
source(file.path(here, "publish.R"))

failed <- 0
ran <- 0
ok <- function(label, expr) {
  ran <<- ran + 1
  result <- tryCatch(isTRUE(expr), error = function(e) structure(FALSE, msg = conditionMessage(e)))
  if (isTRUE(result)) {
    cat("  ok   ", label, "\n", sep = "")
  } else {
    cat("  FAIL ", label, if (!is.null(attr(result, "msg"))) paste0("  (", attr(result, "msg"), ")") else "", "\n", sep = "")
    failed <<- failed + 1
  }
}
# A fake Sys.getenv, so these never depend on the environment the test happens to run in.
envfrom <- function(...) {
  vals <- list(...)
  function(name, unset = "") if (!is.null(vals[[name]])) vals[[name]] else unset
}
refuses <- function(expr, pattern) {
  msg <- tryCatch({ force(expr); NA_character_ }, error = function(e) conditionMessage(e))
  !is.na(msg) && grepl(pattern, msg, fixed = TRUE)
}

cat("==> the mode is explicit\n")
ok("geoserver is the default", esgame_publish_config(envfrom())$mode == "geoserver")
ok("an empty ESGAME_PUBLISH means the default",
   esgame_publish_config(envfrom(ESGAME_PUBLISH = ""))$mode == "geoserver")
ok("an unknown mode is refused, and lists the real ones",
   refuses(esgame_publish_config(envfrom(ESGAME_PUBLISH = "s3")), "geoserver, fileserver, files"))
# Inferring the mode from whichever variables are set is how a deployment ends up in one nobody
# chose: setting the file variables does NOT silently switch a geoserver deployment over.
ok("file variables do not switch the mode by themselves",
   esgame_publish_config(envfrom(ESGAME_FILES_DIR = "/tmp/x", ESGAME_FILES_URL = "http://h/f"))$mode
     == "geoserver")

cat("==> a file mode needs somewhere to write\n")
ok("fileserver without a directory is refused",
   refuses(esgame_publish_config(envfrom(ESGAME_PUBLISH = "fileserver", ESGAME_FILES_URL = "http://h/f")),
           "ESGAME_FILES_DIR is not set"))
ok("files without a directory is refused",
   refuses(esgame_publish_config(envfrom(ESGAME_PUBLISH = "files")), "ESGAME_FILES_DIR is not set"))

cat("==> a fileserver needs the address the BROWSER uses\n")
# The directory and the URL are different things, and conflating them is the same mistake as
# GEOSERVER vs GEOSERVER_PUBLIC_URL: one is where bytes land, the other is where a client asks.
ok("fileserver without a URL is refused",
   refuses(esgame_publish_config(envfrom(ESGAME_PUBLISH = "fileserver", ESGAME_FILES_DIR = "/tmp/x")),
           "ESGAME_FILES_URL is not set"))
ok("a file:// URL is refused for fileserver, and says which mode wants it",
   refuses(esgame_publish_config(envfrom(ESGAME_PUBLISH = "fileserver", ESGAME_FILES_DIR = "/tmp/x",
                                         ESGAME_FILES_URL = "file:///srv/out")),
           "ESGAME_PUBLISH=files"))
ok("https is accepted",
   esgame_publish_config(envfrom(ESGAME_PUBLISH = "fileserver", ESGAME_FILES_DIR = "/tmp/x",
                                 ESGAME_FILES_URL = "https://h/f"))$url == "https://h/f")
ok("trailing slashes are trimmed, so URLs do not come back doubled",
   esgame_publish_config(envfrom(ESGAME_PUBLISH = "fileserver", ESGAME_FILES_DIR = "/tmp/x/",
                                 ESGAME_FILES_URL = "http://h/f/"))$url == "http://h/f")

cat("==> writing, and the URL that comes back\n")
tmp <- file.path(tempdir(), paste0("esgame-publish-", Sys.getpid()))
src <- file.path(tmp, "work"); out <- file.path(tmp, "out")
dir.create(src, recursive = TRUE, showWarnings = FALSE)
writeLines("not really a geotiff", file.path(src, "HH_Game_x_Round_1.tif"))

cfg_fs <- esgame_publish_config(envfrom(ESGAME_PUBLISH = "fileserver", ESGAME_FILES_DIR = out,
                                        ESGAME_FILES_URL = "http://localhost:8081/rounds"))
esgame_publish_prepare(cfg_fs)
ok("the output directory is created if absent", dir.exists(out))
url_fs <- esgame_publish_file(cfg_fs, "HH_Game_x_Round_1.tif", src)
ok("fileserver returns an http URL under the configured base",
   url_fs == "http://localhost:8081/rounds/HH_Game_x_Round_1.tif")
ok("and the file is actually there", file.exists(file.path(out, "HH_Game_x_Round_1.tif")))

cfg_f <- esgame_publish_config(envfrom(ESGAME_PUBLISH = "files", ESGAME_FILES_DIR = out))
url_f <- esgame_publish_file(cfg_f, "HH_Game_x_Round_1.tif", src)
ok("files returns a file:// URL", startsWith(url_f, "file://"))
ok("the file:// URL is absolute and names the file",
   grepl("^file:///", url_f) && endsWith(url_f, "/HH_Game_x_Round_1.tif"))

cat("==> the failures that would otherwise be silent\n")
ok("publishing a raster that was never written is refused",
   refuses(esgame_publish_file(cfg_f, "NOPE.tif", src), "there is nothing to publish"))
# Copying a file onto itself truncates it. The round would still return 200, with a URL for a
# zero-byte raster and no error anywhere.
cfg_same <- esgame_publish_config(envfrom(ESGAME_PUBLISH = "files", ESGAME_FILES_DIR = src))
url_same <- esgame_publish_file(cfg_same, "HH_Game_x_Round_1.tif", src)
ok("output dir == working dir does not truncate the raster",
   file.size(file.path(src, "HH_Game_x_Round_1.tif")) > 0 && startsWith(url_same, "file://"))
ok("an unwritable directory is refused at startup, not per round",
   refuses(esgame_publish_prepare(list(mode = "files", dir = "/proc/esgame-cannot-create")),
           "could not be created"))
ok("geoserver mode prepares nothing and asks for nothing",
   is.null(esgame_publish_prepare(esgame_publish_config(envfrom()))))

unlink(tmp, recursive = TRUE)

cat("\n")
# Presence first: a rename that made every `ok` disappear would otherwise report success.
if (ran < 18) {
  cat("publish.R tests: FAIL   only ", ran, " assertions ran; this file has more than that\n", sep = "")
  quit(status = 1)
}
if (failed == 0) {
  cat("publish.R tests: PASS   ", ran, "/", ran, " assertions\n", sep = "")
} else {
  cat("publish.R tests: FAIL   ", ran - failed, "/", ran, " assertions\n", sep = "")
  quit(status = 1)
}
