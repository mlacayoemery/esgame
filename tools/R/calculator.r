# geosapi is installed at image build time (see Dockerfile). It was installed here,
# from GitHub @HEAD, on every container start — which made startup depend on GitHub
# being reachable and made two deployments of the same image differ.

#NEW CODE --> ALLOW CORS REQUESTS
#* @filter cors
cors <- function(req, res) {
  res$setHeader("Access-Control-Allow-Origin", "*")
  if (req$REQUEST_METHOD == "OPTIONS") {
    res$setHeader("Access-Control-Allow-Methods","*")
    res$setHeader("Access-Control-Allow-Headers", req$HTTP_ACCESS_CONTROL_REQUEST_HEADERS)
    res$status <- 200 
    return(list())
  } else {
    plumber::forward()
  }
}

# `#* @assets /app/data /images` used to be here. It served the rendered spider plot, and nothing
# else — every other output goes to GeoServer as a coverage. The plot is drawn in the browser now
# (v2's SpiderChartComponent), so there is nothing left to serve, and dropping the mount means
# the calculator no longer publishes the contents of its own /app/data over HTTP.
#
# ONE WAY TO REACH A THING, NOT TWO. Leaving the mount in place would have kept working at one
# replica and rotted unseen, which is exactly how the pod-local plot survived this long.

#* @post /esgame
#* @serializer unboxedJSON
esgame <- function(req, res, json_in='{}') {
  # Defaults to LOCAL, and that is a correction rather than a preference. It used to default to
  # https://esgame-geoserver.azurewebsites.net/geoserver — a host this repository does not control
  # — so a deployment that said nothing tried to publish five coverages per round to a stranger,
  # with the stock GeoServer credential, and handed the browser URLs there. The v2 compose stack
  # did exactly that until 2026-08-15: 200, five finite scores, every URL off-site, and the
  # GeoServer it had just started holding nothing but its demo workspaces.
  #
  # A wrong local address fails where the operator can see it. A wrong remote one does not.
  geoserver_url <- Sys.getenv("GEOSERVER", "http://localhost:8080/geoserver")
  #NEW CODE --> ALLOW TO SEND DATA IN BODY OF Request
  if (!(json_in == '' || json_in == '{}')) { 
    json_list<-fromJSON(json_in, simplifyVector = T)
    #json_list<-fromJSON("Results50.json", simplifyVector = T)
    game_id <- json_list$game_id 
    round_id <-json_list$round 
    score_PD <- json_list$score
    map_AG <- json_list$allocation 
  } else {
    game_id <- req$body$game_id 
    round_id <-req$body$round 
    score_PD <- req$body$score
    map_AG <- req$body$allocation
  }

  # Refuse an allocation that cannot be scored, rather than letting it reach reclassify().
  #
  # An empty one used to warn "the round will score the base raster unchanged" and then die
  # several frames later with
  #
  #   Not compatible with requested type: [type=list; target=double]
  #
  # an Rcpp type error the caller never sees: plumber turns it into a bare
  # {"error":"500 - Internal server error"}. So the log said the round would proceed, it did not,
  # and the status said the server was broken when the request was.
  #
  # 400 is what this is. The frontend already reports any error to the player, and the image
  # probe in .github/workflows/image-calculation.yml accepts any HTTP status — it is a
  # connection that fails (000) that means the process died.
  bad <- NULL
  if (is.null(map_AG)) {
    bad <- "the request has no 'allocation' field"
  } else if (length(map_AG) == 0) {
    bad <- "'allocation' is empty"
  } else if (is.data.frame(map_AG) && !all(c("id", "lulc") %in% names(map_AG))) {
    bad <- paste0("'allocation' has columns [", paste(names(map_AG), collapse = ", "),
                  "]; it needs id and lulc")
  } else if (!is.data.frame(map_AG)) {
    # jsonlite turns [{id, lulc}, ...] into a data.frame. Anything else — an object keyed by id,
    # or a bare array — does not, and reclassify wants a two-column matrix.
    bad <- paste0("'allocation' is a ", class(map_AG)[1],
                  "; it must be an array of {id, lulc} objects")
  }
  if (!is.null(bad)) {
    logger::log_error("Refusing the round: {bad}.")
    res$status <- 400
    return(list(error = paste0("Cannot score this round: ", bad,
                               ". Expected {\"allocation\": [{\"id\": <number>, \"lulc\": <number>}, ...]}.")))
  }

  return(calculate(req, geoserver_url, game_id, round_id, score_PD, map_AG))
}

library(sf)
library(sp)
library(raster)
# rgdal was retired from CRAN (Oct 2023) and is not used directly here — modern
# 'raster' delegates GeoTIFF I/O to 'terra'/GDAL, so no replacement import is needed.
library(ggplot2)
library(ggpubr)
library(tidyverse)
library(tidyr)
library(grid)
#library(jsonlite)
library(geosapi)
library(logger)
# library(devtools) was here — nothing in this file calls anything from it. See the Dockerfile.
# Allocation-vs-raster coverage check. The Dockerfile puts this next to calculator.r in /app;
# the plain relative path covers running it from a checkout. stopifnot rather than a silent skip:
# a guard that quietly fails to load is worse than no guard.
for (.p in c("coverage.R", "/app/coverage.R")) if (file.exists(.p)) { source(.p); break }
stopifnot("coverage.R must be alongside calculator.r" = exists("esgame_report_coverage"))

# The concentration field and the scoring. Same loading shape as coverage.R above: the
# Dockerfile puts these next to calculator.r in /app, and the relative path covers a checkout.
for (.p in c("model.R", "/app/model.R")) if (file.exists(.p)) { source(.p); break }
stopifnot("model.R must be alongside calculator.r" = exists("esgame_score"))

# Where the round's rasters go and what URL the browser is given — geoserver, fileserver or files.
for (.p in c("publish.R", "/app/publish.R")) if (file.exists(.p)) { source(.p); break }
stopifnot("publish.R must be alongside calculator.r" = exists("esgame_publish_config"))

# Per-indicator normalisation bounds, derived from THIS deployment's base raster by
# tools/R/derive-bounds.R. Loaded once at startup rather than per round: if they are missing or
# malformed the calculator must not start, because every score it would return is wrong, and a
# wrong score is indistinguishable from a right one at the far end.
for (.p in c("bounds.json", "/app/bounds.json")) if (file.exists(.p)) { ESGAME_BOUNDS_PATH <- .p; break }
stopifnot("bounds.json must be alongside calculator.r" = exists("ESGAME_BOUNDS_PATH"))
ESGAME_BOUNDS <- esgame_load_bounds(ESGAME_BOUNDS_PATH)
log_info("normalisation bounds loaded from {ESGAME_BOUNDS_PATH}")

# The board this deployment scores against, checked HERE rather than on the first round. calculate()
# runs with setwd("/app/data"), and raster() on a missing file fails inside a request handler — one
# 500 per round, with the operator's mistake buried in a stack trace. A calculator pointed at a
# board it does not have should not come up at all.
#
# The same bounds.json serves both boards. derive-bounds.R's extremes are "every unit nature" and
# "every unit agropark", which depend on WHICH CELLS the board covers, not on how they are grouped,
# and the rectangular board covers the hexagonal board's 65,826 cells exactly. Re-derived against
# LU_and_NEW_rect.tif on 2026-08-14, all five bounds came back identical to the committed file.
# MANDATORY, AND WITH NO DEFAULT. It had one — LU_and_NEW_hexa.tif — and a default is the same
# defect as a missing file, one step earlier: a deployment that never says which board it serves
# gets one chosen for it, comes up healthy, and scores every round against a board the browser may
# not be drawing. There are two boards now and the number is not going to go down; "whichever one
# used to be the only one" is not an answer a calculator should supply on the operator's behalf.
#
# Every deployment states it: deploy/k8s/base/configmap.yaml for the cluster (overlays/rectangular
# overrides it), v2/docker-compose.dynamic.yml for compose. That is a few more characters in each
# and it makes the frontend/calculator pairing visible at both ends, which is what
# deploy/k8s/render-test.sh checks.
ESGAME_BASE_RASTER <- Sys.getenv("ESGAME_BASE_RASTER", "")
local({
  if (!nzchar(ESGAME_BASE_RASTER)) {
    stop(paste("ESGAME_BASE_RASTER is not set. It names the board this calculator scores against",
               "and has no default: set it to the base raster in /app/data, e.g.",
               "LU_and_NEW_hexa.tif (hexagonal) or LU_and_NEW_rect.tif (rectangular)."))
  }
  .p <- file.path("/app/data", ESGAME_BASE_RASTER)
  if (!file.exists(.p)) {
    stop(sprintf("ESGAME_BASE_RASTER is '%s' but %s does not exist; this deployment has no board to score.",
                 ESGAME_BASE_RASTER, .p))
  }
  log_info("base raster: {ESGAME_BASE_RASTER}")
})

# The GeoServer this publishes to, and who it publishes as. Checked HERE for the same reason the
# base raster is: a credential that is wrong is wrong on every round, and finding out inside a
# request handler buries it in a stack trace the operator never sees.
#
# NO DEFAULT FOR EITHER. They defaulted to admin/geoserver — the stock GeoServer credential — which
# is exactly what let a calculator pointed at the wrong host keep trying rather than fail. A
# password worth having is one the deployment supplies; deploy/k8s injects both from a Secret and
# v2/docker-compose.dynamic.yml states them for the local stack.
ESGAME_PUBLISH <- esgame_publish_config()
esgame_publish_prepare(ESGAME_PUBLISH)

ESGAME_GEOSERVER_USER <- Sys.getenv("GEOSERVER_USER", "")
ESGAME_GEOSERVER_PASSWORD <- Sys.getenv("GEOSERVER_PASSWORD", "")
local({
  if (ESGAME_PUBLISH$mode != "geoserver") {
    # No REST API is contacted in the file modes, so there is nothing to authenticate to.
    # Requiring a credential that will not be used would be a barrier with no subject.
    log_info("publishing mode: {ESGAME_PUBLISH$mode} -> {ESGAME_PUBLISH$dir}")
    return(invisible(NULL))
  }
  missing <- c(if (!nzchar(ESGAME_GEOSERVER_USER)) "GEOSERVER_USER",
               if (!nzchar(ESGAME_GEOSERVER_PASSWORD)) "GEOSERVER_PASSWORD")
  if (length(missing)) {
    stop(paste0(paste(missing, collapse = " and "), " not set. The calculator publishes every ",
                "round's coverages to GeoServer over its REST API and will not guess a credential ",
                "for it; there is no default."))
  }
  log_info("publishing mode: geoserver, as {ESGAME_GEOSERVER_USER}")
})


calculate<-function(req, geoserver_url, game_id, round_id,score_PD,map_AG) {
  ##### 0) start #####
  #directory<-"C:/Users/Gebha002/Documents/phd/ES tradeoff model/files ready  for game"
  directory<-"/app/data"
  setwd(directory)
  
  ##### 1) Create Land use map #####
  # Which board this deployment serves. The hexagonal board is the default and the shipped one;
  # ESGAME_BASE_RASTER=LU_and_NEW_rect.tif serves the rectangular board instead (tools/R/make-rect-board.R).
  # It must match the board the BROWSER draws — both are derived from the same farmland mask, so a
  # mismatched pair produces ids that are simply absent from the raster, which reclassify() ignores
  # in silence. That is exactly the failure coverage_stats below exists to surface, and the reason
  # this is one variable rather than a guess.
  LU_hexa<- raster(ESGAME_BASE_RASTER)
  # How much of the allocation actually lands on this raster? reclassify() silently ignores any
  # id that is not present, so a caller whose ids belong to a different id space gets a 200, a
  # published set of coverages, and five finite scores that are the SAME whatever they allocate.
  # That happened: the copy of LU_and_NEW_hexa.tif committed under v2/src/assets/images numbers
  # its hexagons 10-474 while the board numbers its own 100-46500 in hundreds — 4 ids in common
  # out of 465 — and the constant it returns was quoted in the docs as a working round.
  # Cheap to check, and the only thing that distinguishes "scored" from "ignored".
  # Kept, not just logged. The log line below is inside the container; the person who needs it is
  # the one running the workshop, and until now the only way to learn a round had been ignored was
  # to read the calculator's stdout. It goes back in the response — see the end of this function.
  coverage_stats <- esgame_report_coverage(LU_hexa, map_AG, base_name = ESGAME_BASE_RASTER)
  LU_complete<-reclassify(LU_hexa, map_AG, right=F) # no value can be 1!!!!

  #### Set parameters ####
  ext_arable<-10
  ext_livest<-20
  int_arable<-30
  int_livest<-40
  agropark<-50
  add_nat<-60
  #NEW CODE
  human_health<-11
  nutrient_pollution<-22
  water_availability<-33
  habitat_cohesion<-44
  recreational<-55
  
  zero_raster<-LU_complete
  zero_raster[!is.na(zero_raster)] <- 0
  
  #### 2) MODEL: Human health #####
  
  # create distance maps for each agriculture type
  
  if (any(ext_arable %in% values(LU_complete))) {
    AG10<-reclassify(LU_complete, cbind(ext_arable,1), right=FALSE)
    AG10<-reclassify(AG10, cbind(2,70,NA), right=FALSE)
    airdist10<-raster::distance(AG10)
    airconc10<- (10 *  exp(-0.005 * airdist10)) # 
    
  }else{
    airconc10<-zero_raster
  }
  
  
  
  if (any(ext_livest %in% values(LU_complete))) {
    AG20<-reclassify(LU_complete, cbind(ext_livest,1), right=FALSE)
    AG20<-reclassify(AG20, cbind(2,70,NA), right=FALSE)
    airdist20<-raster::distance(AG20) 
    airconc20<- (40 *  exp(-0.005 * airdist20)) # 
    
  }else{
    airconc20<-zero_raster
  }
  
  
  if (any(int_arable %in% values(LU_complete))) {
    AG30<-reclassify(LU_complete, cbind(int_arable,1), right=FALSE)
    AG30<-reclassify(AG30, cbind(2,70,NA), right=FALSE)
    airdist30<-raster::distance(AG30)
    airconc30<- (70 * exp(-0.005 * airdist30)) # 
    
  }else{
    airconc30<-zero_raster
  }
  
  
  if (any(int_livest %in% values(LU_complete))) {
    AG40<-reclassify(LU_complete, cbind(int_livest,1), right=FALSE)
    AG40<-reclassify(AG40, cbind(2,70,NA), right=FALSE)
    airdist40<-raster::distance(AG40)
    airconc40<- (100 *  exp(-0.005 * airdist40)) # 
    
  }else{
    airconc40<-zero_raster
  }
  
  
  if (any(agropark %in% values(LU_complete))) {
    AG50<-reclassify(LU_complete, cbind(agropark,1), right=FALSE)
    AG50<-reclassify(AG50, cbind(2,70,NA), right=FALSE)
    airdist50<-raster::distance(AG50)
    airconc50<- (130 *  exp(-0.005 * airdist50)) # 
    
  } else{
    airconc50<-zero_raster
  }
  
  # sum up all agriculture types
  airconctot<- airconc10+airconc20+airconc30+airconc40+airconc50 + zero_raster
  
  # THE < 1 FLOOR IS GONE FROM ALL FIVE, 2026-08-15. It dropped every receptor cell under an
  # exposure of 1 before scoring, which emptied 93% of a cautious allocation's map — 1,377 of
  # 21,105 HH cells drawn — and lifted the bottom of the score range. Its stated reason (a NaN
  # under the round-relative normalisation) went away on 2026-08-07. See tools/R/model.R.
  #
  # THESE FIVE BLOCKS ARE A SECOND IMPLEMENTATION of model.R's esgame_indicator(), and that is
  # how this change nearly went wrong: derive-bounds.R builds bounds.json through model.R, so
  # removing the floor there moved the CEILING while these lines went on applying it. The golden
  # allocation came back at HH 80 — a round scored with the floor against bounds derived without
  # it — which is arithmetically consistent and means nothing. Both had to change together.
  # Unifying them is worth doing and is not this change.
  #
  # Human Health
  HH<-airconctot
  HH[which(values(LU_complete != 2) )]<-NA
  
  # ROUND-RELATIVE, AND DELIBERATELY SO FOR NOW. Each raster is stretched to 0-100 over its OWN
  # round's surface before it is published, so the colour a player sees means "low or high within
  # this round" and nothing across rounds. The legend says exactly that (v2's Legend.isRoundRelative,
  # #210) rather than printing numbers the stretch does not support.
  #
  # THE CONSEQUENCE OF DOING IT HERE is that the SCALE is a server decision baked into the
  # published GeoTIFF, while the PALETTE is a client one. A game builder offering symbology can
  # only reach half of it. Measured alternatives are written up under the ramp discussion in
  # docs/verification-status.rst: a fixed linear scale puts a cautious allocation in the bottom
  # 4-8% of the ramp, a logarithmic one at 27-41%.
  #
  # A POSSIBLE FUTURE CHANGE, not made: an optional flag — say ESGAME_SCALE, defaulting to
  # round-relative so nothing moves — choosing between this stretch, a fixed one, and publishing
  # RAW exposure values for the client to scale. Raw is what a builder-level colour UI would need,
  # and it changes what every published coverage contains, so it is a decision about consumers
  # (WCS clients, places) rather than a refactor. The five values are written five times below;
  # whoever does it should unify these blocks with model.R's esgame_indicator() first.
  HH_norm<-HH
  HH_norm<-(HH - cellStats(HH,min))/(cellStats(HH,max) - cellStats(HH,min))*100
  
  #NEW CODE
  hh_name<-paste0("HH_", "Game_", game_id, "_Round_", round_id, ".tif")
  
  # write Raster
  writeRaster(x=HH_norm, filename=paste0("HH_", "Game_",game_id,"_Round_",round_id,".tif"),overwrite=TRUE, NAflag=-9999)
  
  #NEW CODE
  hh_info <- list('name' = hh_name, 'id' = human_health)
  
  #### 3) MODEL: Nutrient pollution #####
  NP<-airconctot
  NP[which(values(LU_complete != 5) )]<-NA
  
  NP_norm<-NP
  NP_norm<-(NP - cellStats(NP,min))/(cellStats(NP,max) - cellStats(NP,min))*100
  
  #NEW CODE
  np_name<-paste0("NP_", "Game_", game_id, "_Round_", round_id, ".tif")
  
  # write Raster
  writeRaster(x=NP_norm, filename=paste0("NP_", "Game_",game_id,"_Round_",round_id,".tif"),overwrite=TRUE, NAflag=-9999)
  
  #NEW CODE
  np_info <- list('name' = np_name, 'id' = nutrient_pollution)
  
  #### 4) MODEL: Water availability #####
  WA<-airconctot
  WA[which(values(LU_complete != 4) )]<-NA
  
  WA_norm<-WA
  WA_norm<-(WA - cellStats(WA,min))/(cellStats(WA,max) - cellStats(WA,min))*100
  
  #NEW CODE
  wa_name<-paste0("WA_", "Game_", game_id, "_Round_", round_id, ".tif")
  
  # write Raster
  writeRaster(x=WA_norm, filename=paste0("WA_", "Game_",game_id,"_Round_",round_id,".tif"),overwrite=TRUE, NAflag=-9999)
  
  #NEW CODE
  wa_info <- list('name' = wa_name, 'id' = water_availability)
  
  #### 5) MODEL: Habitat cohesion #####
  HC<-airconctot
  HC[which(values(LU_complete != 7) )]<-NA
  
  HC_norm<-HC
  HC_norm<-(HC - cellStats(HC,min))/(cellStats(HC,max) - cellStats(HC,min))*100
  
  #NEW CODE
  hc_name<-paste0("HC_", "Game_", game_id, "_Round_", round_id, ".tif")
  
  # write Raster
  writeRaster(x=HC_norm, filename=paste0("HC_", "Game_",game_id,"_Round_",round_id,".tif"),overwrite=TRUE, NAflag=-9999)
  
  #NEW CODE
  hc_info <- list('name' = hc_name, 'id' = habitat_cohesion)
  
  #### 6) MODEL: Recreational value #####
  RV<-airconctot
  RV[which(values(LU_complete != 6) & values(LU_complete != 8))]<-NA
  
  RV_norm<-RV
  RV_norm<-(RV - cellStats(RV,min))/(cellStats(RV,max) - cellStats(RV,min))*100
  
  #NEW CODE
  rv_name<-paste0("RV_", "Game_", game_id, "_Round_", round_id, ".tif")
  
  # write Raster
  writeRaster(x=RV_norm, filename=paste0("RV_","Game_",game_id,"_Round_",round_id,".tif"),overwrite=TRUE, NAflag=-9999)
  
  #NEW CODE
  rv_info<- list('name' = rv_name, 'id' = recreational)
  
  #### Scores #####
  #HH_norm<-HH_norm*100
 # NP_norm<-NP_norm*100
  #WA_norm<-WA_norm*100
 # HC_norm<-HC_norm*100
 # RV_norm<-RV_norm*100
  # Mean exposure over the cells that encounter the consequence, on a FIXED 0-100 scale.
  #
  # This used to be `cellStats(X_norm, mean)` — the mean of the ROUND-RELATIVE raster, rescaled
  # to that round's own min and max. Three defects, all measured on 2026-08-07 against the
  # golden allocation (see tools/R/derive-bounds.R for the numbers):
  #
  #   * a landscape with no agriculture divided by zero and returned NaN for all five;
  #   * scores were not comparable between rounds, because the scale moved with the data;
  #   * the ranking was an artefact of the < 1 floor and came out INVERTED — all-ext_arable
  #     (amplitude 10) scored HH 49 and all-agropark (amplitude 130) scored HH 40.
  #
  # The raw masked raster (HH, not HH_norm) is what is scored now, against bounds derived from
  # this deployment's base raster. X_norm is still what gets published as a coverage: the map
  # answers "where, within this round", and the score answers "how does this round compare",
  # which are different questions and want different scales.
  score_HH<-esgame_score(values(HH), ESGAME_BOUNDS$HH$lo, ESGAME_BOUNDS$HH$hi)
  score_NP<-esgame_score(values(NP), ESGAME_BOUNDS$NP$lo, ESGAME_BOUNDS$NP$hi)
  score_WA<-esgame_score(values(WA), ESGAME_BOUNDS$WA$lo, ESGAME_BOUNDS$WA$hi)
  score_HC<-esgame_score(values(HC), ESGAME_BOUNDS$HC$lo, ESGAME_BOUNDS$HC$hi)
  score_RV<-esgame_score(values(RV), ESGAME_BOUNDS$RV$lo, ESGAME_BOUNDS$RV$hi)
  log_info("scores HH={score_HH} NP={score_NP} WA={score_WA} HC={score_HC} RV={score_RV}")
  
  #NEW CODE
  hh_info['score']<-score_HH
  np_info['score']<-score_NP
  wa_info['score']<-score_WA
  hc_info['score']<-score_HC
  rv_info['score']<-score_RV
  
  # The spider plot used to be rendered here: a ggplot with coord_polar, written to a 394x394
  # PNG in the calculation pod's own /app/data, served back through the `@assets` mount that used
  # to be at the top of this file, with a URL built from req$HTTP_HOST, and returned as a sixth
  # result with id -1.
  #
  # It is drawn in the browser now, by v2's SpiderChartComponent, from these five scores. The
  # chart is a pure function of them, so there was never anything to store.
  #
  # WHAT THAT FIXES. The file lived on whichever pod happened to serve the round. With more than
  # one calculation replica a plot GET can land on a pod that never wrote it, so the player gets
  # a 404 for a chart of their own round — which is why `replicas` could not be raised. That is
  # documented under "adding calculation replicas breaks the spider plot".
  #
  # It also removes the req$HTTP_HOST URL, which was wrong for the same reason the coverage URLs
  # were: it names whatever host the request happened to arrive on.
  #
  # ggplot2/grid are no longer used by this file. They stay in the Dockerfile: dropping them is a
  # separate change with its own image rebuild to verify, and an unused package costs nothing at
  # run time.

#### Upload #####
  #connect to GeoServer
  ## Geoserver
  gs_url <- geoserver_url
  # Two addresses, because this one variable was doing two incompatible jobs. gs_url is
  # server-to-server: coverages are published over the REST API from inside the cluster, so it
  # must be the in-cluster name — deploy/k8s sets GEOSERVER to esgame-geoserver-service. But the
  # WCS URLs built from it further down are fetched by the BROWSER, which cannot resolve a
  # Service name. That is what the geoserver Ingress is for. The FastAPI example calculator
  # already made this split; this brings the R calculator in line with it.
  # Defaults to gs_url, so an existing single-address deployment behaves exactly as before.
  gs_public <- Sys.getenv("GEOSERVER_PUBLIC_URL", geoserver_url)
  if (gs_public == gs_url) {
    log_warn("GEOSERVER_PUBLIC_URL is unset, so coverage URLs will use the internal GeoServer address ({gs_url}). A browser probably cannot resolve it.")
  }
  # Checked at startup, so this only reads them. They were hardcoded as admin/geoserver once, then
  # defaulted to it with a warning; both are gone. A guessed credential is what turned publishing
  # to the wrong host into an ATTEMPT rather than an obvious failure.
  gs_user <- ESGAME_GEOSERVER_USER
  gs_pwd  <- ESGAME_GEOSERVER_PASSWORD
  # Only in geoserver mode: the file modes contact nothing and need no workspace.
  gsman <- NULL
  ws_name <- paste0("esgame_game", game_id, "_round", round_id)
  if (ESGAME_PUBLISH$mode == "geoserver") {
  gsman <-GSManager$new(
    url = gs_url, #baseUrl of the Geoserver
    user = gs_user, pwd = gs_pwd,
    logger = NULL #logger, for info or debugging purpose
  )
  
  #create GeoServer workspace for given game and round
  deleted <- gsman$deleteWorkspace(ws_name, recurse = TRUE)
  created <- gsman$createWorkspace(ws_name, paste0("https://esgame.unige.ch/", ws_name))
  }
  
  ### raster upload
  #DELETED CODE

  raster_minx<-xmin(LU_complete)
  raster_miny <-ymin(LU_complete)
  raster_maxx <-xmax(LU_complete)
  raster_maxy <-ymax(LU_complete)
  raster_width <-res(LU_complete)[1]
  raster_height <-res(LU_complete)[2]
  raster_epsg <- 28992
  
  #DELETED CODE
  
  #register each raster into GeoServer
  #https://cran.r-project.org/web/packages/geosapi/vignettes/geosapi.html#GSCoverage-upload
  
  # Five coverages, no sixth plot entry. Everything in this list is a real GeoTIFF that goes to
  # GeoServer, so the id == -1 branch that built a pod-local URL from req$HTTP_HOST is gone with
  # it — see the note where the plot used to be rendered.
  calculated_rasters <- list(hh_info, wa_info, hc_info, np_info, rv_info)

  #CHANGED CODE --> loop over calculated rasters which contains all the informations
  for (i in 1:length(calculated_rasters)) {
  short_name <- substring(calculated_rasters[[i]]['name'], 1, nchar(calculated_rasters[[i]]['name'])-4)
  if (ESGAME_PUBLISH$mode != "geoserver") {
    # The file already exists — writeRaster() put it in `directory` above. Publishing it is a copy
    # and a URL, not a second rendering.
    raster_url <- esgame_publish_file(ESGAME_PUBLISH, calculated_rasters[[i]][["name"]], directory)
  } else {
  log_info("Attempting upload of {short_name} from {calculated_rasters[[i]]['path']}")
  uploaded <- gsman$uploadGeoTIFF(
    ws = ws_name, cs = short_name,
    endpoint = "file", configure = "none", update = "overwrite",
    filename = paste0(directory, '/', calculated_rasters[[i]]['name'])
  )
  
  #create coverage object
  cov <- GSCoverage$new()
  cov$setName(short_name)
  cov$setNativeName(short_name)
  cov$setTitle(paste("Title for", short_name))
  cov$setDescription(paste("Description for", short_name))
  cov$addKeyword(paste(short_name,"keyword1"))
  cov$addKeyword(paste(short_name,"keyword2"))
  cov$addKeyword(paste(short_name,"keyword3"))
  
  md1 <- GSMetadataLink$new(
    type = "text/xml",
    metadataType = "ISO19115:2003",
    content = "http://somelink.org/sfdem_new/xml"
  )
  cov$addMetadataLink(md1)
  md2 <- GSMetadataLink$new(
    type = "text/html",
    metadataType = "ISO19115:2003",
    content = "http://somelink.org/sfdem_new/html"
  )
  cov$addMetadataLink(md2)
  
  cov$setSrs(paste("EPSG:",raster_epsg))
  cov$setNativeCRS(paste("EPSG:",raster_epsg))
  cov$setProjectionPolicy("FORCE_DECLARED")
  cov$setLatLonBoundingBox(5.0332222794293484, 51.5304424429716477, 5.7127527056648306, 51.8315979727805569, crs = "EPSG:4326")
  cov$setNativeBoundingBox(raster_minx, raster_miny, raster_maxx, raster_maxy, crs = paste("EPSG:",raster_epsg))
  
  created <- gsman$createCoverage(ws = ws_name, cs = short_name, coverage = cov)
  
  raster_url <- paste0(gs_public , "/wcs?service=WCS&version=2.0.0&request=GetCoverage" ,
                           "&coverageId=" , ws_name , ":" , short_name ,
                           "&format=image%2Fgeotiff" )
  }
  
  calculated_rasters[[i]]['url'] = raster_url
  log_info("Constructed URL for  {short_name}: from {raster_url}")

  #DELETED CODE
  }

  
  #DELETED CODE
  
  # `results` is unchanged: every existing client keys off it and none of them know about the
  # field below. allocationCoverage is additive and optional by design — a client that ignores it
  # behaves exactly as before, which is what keeps other calculators (places carries its own
  # calculation.r) from having to ship this at the same time.
  #
  # Omitted entirely rather than sent as nulls when the diagnostic itself failed:
  # esgame_report_coverage returns NULL in that case, and a client cannot tell "0% matched" from
  # "could not measure" if both arrive as zeroes.
  if (is.null(coverage_stats)) {
    return(list(results = calculated_rasters))
  }
  return(list(
    results = calculated_rasters,
    allocationCoverage = list(
      allocated = coverage_stats$allocated,
      matched   = coverage_stats$matched,
      fraction  = coverage_stats$fraction
    )
  ))
}
