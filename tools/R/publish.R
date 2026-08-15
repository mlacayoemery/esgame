# Where a round's five rasters go, and what URL the browser is given for them.
#
# THREE MODES, STATED RATHER THAN INFERRED, and the URL in the response says which one produced
# it:
#
#   ESGAME_PUBLISH=geoserver   published over GeoServer's REST API   -> http(s):// WCS GetCoverage
#   ESGAME_PUBLISH=fileserver  written to a directory something else serves  -> http(s)://…/name.tif
#   ESGAME_PUBLISH=files       written to a directory, nothing serving it     -> file:///…/name.tif
#
# The mode is explicit because inferring it from whichever variables happen to be set is how a
# deployment ends up in a mode nobody chose. A calculator that cannot tell you which of three
# things it is doing is one you have to read the environment of to understand.
#
# WHY FILE MODES ARE CHEAP: the five GeoTIFFs already exist on disk before anything is published.
# calculate() writes them with writeRaster() into its working directory and only then uploads
# them. So a file publisher does not produce anything new — it copies what is already there to
# somewhere serveable and builds a different URL.
#
# WHY THEY WRITE TO A SEPARATE DIRECTORY. The obvious shortcut is to serve the working directory
# itself, and it is wrong: /app/data holds the base raster and bounds.json as well as the round
# output. `#* @assets /app/data /images` was removed from calculator.r in 2026-08-07 for exactly
# that reason — the calculator stopped publishing the contents of its own data directory over
# HTTP. ESGAME_FILES_DIR is where output goes and nothing else does.

#' Read and validate the publishing configuration. Call once, at startup.
#'
#' Returns a list(mode, dir, url). Stops with a message naming what is missing, because every one
#' of these is wrong on every round: discovering it inside a request handler buries the operator's
#' mistake in a stack trace and produces one 500 per player instead of one refusal at start.
esgame_publish_config <- function(env = Sys.getenv) {
  mode <- env("ESGAME_PUBLISH", "geoserver")
  if (!nzchar(mode)) mode <- "geoserver"
  modes <- c("geoserver", "fileserver", "files")
  if (!(mode %in% modes)) {
    stop(sprintf("ESGAME_PUBLISH is '%s'; it must be one of %s.",
                 mode, paste(modes, collapse = ", ")))
  }

  dir <- env("ESGAME_FILES_DIR", "")
  url <- env("ESGAME_FILES_URL", "")

  if (mode == "geoserver") {
    # The GeoServer variables are checked where they are used; nothing here needs dir or url, and
    # a deployment that sets them anyway is not doing harm.
    return(list(mode = mode, dir = "", url = ""))
  }

  if (!nzchar(dir)) {
    stop(sprintf("ESGAME_PUBLISH is '%s' but ESGAME_FILES_DIR is not set; there is nowhere to put the round's rasters.",
                 mode))
  }
  if (mode == "fileserver") {
    if (!nzchar(url)) {
      stop("ESGAME_PUBLISH is 'fileserver' but ESGAME_FILES_URL is not set; that is the address the BROWSER fetches the rasters from, and it is not the directory they are written to.")
    }
    if (!grepl("^https?://", url)) {
      stop(sprintf("ESGAME_FILES_URL is '%s'; a fileserver URL must be http:// or https:// — use ESGAME_PUBLISH=files for a file:// one.", url))
    }
  }
  if (mode == "files" && nzchar(url)) {
    # Not an error worth refusing over, but it means someone expected it to be used.
    warning(sprintf("ESGAME_FILES_URL is set to '%s' but ESGAME_PUBLISH is 'files', which builds file:// URLs from ESGAME_FILES_DIR. The value is ignored.", url))
  }

  list(mode = mode, dir = sub("/+$", "", dir), url = sub("/+$", "", url))
}

#' Make the output directory usable, or say why it is not. Call once, at startup.
esgame_publish_prepare <- function(cfg) {
  if (cfg$mode == "geoserver") return(invisible(NULL))
  if (!dir.exists(cfg$dir) && !dir.create(cfg$dir, recursive = TRUE, showWarnings = FALSE)) {
    stop(sprintf("ESGAME_FILES_DIR '%s' does not exist and could not be created.", cfg$dir))
  }
  # Writability is not implied by existence: the container runs as uid 10001 and a mounted
  # directory carries the ownership of whatever created it. A read-only mount here fails every
  # round, silently as far as the caller is concerned, because the score is computed either way.
  probe <- file.path(cfg$dir, ".esgame-write-probe")
  if (!file.create(probe, showWarnings = FALSE)) {
    stop(sprintf("ESGAME_FILES_DIR '%s' is not writable by this process.", cfg$dir))
  }
  unlink(probe)
  invisible(NULL)
}

#' Publish one raster in file mode, returning the URL to hand back.
#'
#' @param cfg  from esgame_publish_config()
#' @param name the file's basename, as written into `from_dir`
#' @param from_dir where calculate() wrote it
esgame_publish_file <- function(cfg, name, from_dir) {
  src <- file.path(from_dir, name)
  if (!file.exists(src)) {
    stop(sprintf("%s was not written to %s; there is nothing to publish.", name, from_dir))
  }
  dst <- file.path(cfg$dir, name)
  # normalizePath() first, so src and dst being the same file is detected even when one path is
  # relative — copying a file onto itself truncates it, and the round would return a URL for a
  # zero-byte raster with no error anywhere.
  same <- normalizePath(src, mustWork = FALSE) == normalizePath(dst, mustWork = FALSE)
  if (!same && !file.copy(src, dst, overwrite = TRUE)) {
    stop(sprintf("could not copy %s to %s.", src, cfg$dir))
  }
  if (cfg$mode == "files") {
    # file:// wants an absolute path, and the caller's is not necessarily one.
    paste0("file://", normalizePath(dst, mustWork = FALSE))
  } else {
    paste0(cfg$url, "/", name)
  }
}
