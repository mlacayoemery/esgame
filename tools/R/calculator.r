library(remotes)
remotes::install_github('eblondel/geosapi')	

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

#* @assets /app/data /images
list()

#* @post /esgame
#* @serializer unboxedJSON
esgame <- function(req, json_in='{}') {
  geoserver_url <- Sys.getenv("GEOSERVER", "https://esgame-geoserver.azurewebsites.net/geoserver")
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
  return(calculate(req, geoserver_url, game_id, round_id, score_PD, map_AG))
}

library(sf)
library(sp)
library(raster)
library(rgdal)
library(ggplot2)
library(ggpubr)
library(tidyverse)
library(tidyr)
library(grid)
#library(jsonlite)
library(geosapi)
library(logger)
library(devtools)


calculate<-function(req, geoserver_url, game_id, round_id,score_PD,map_AG) {
  ##### 0) start #####
  #directory<-"C:/Users/Gebha002/Documents/phd/ES tradeoff model/files ready  for game"
  directory<-"/app/data"
  setwd(directory)
  
  ##### 1) Create Land use map #####
  LU_hexa<- raster("LU_and_NEW_hexa.tif")
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
  
  # Human Health
  HH<-airconctot
  HH[which(values(LU_complete != 2) )]<-NA
  HH[which(values(HH < 1) )]<-NA
  
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
  NP[which(values(NP < 1) )]<-NA
  
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
  WA[which(values(WA < 1) )]<-NA
  
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
  HC[which(values(HC < 1) )]<-NA
  
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
  RV[which(values(RV < 1) )]<-NA
  
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
  # The relative score of all cells that encounter the consequence: sum(score in cells that encounter consequence)/number of cells that encounter consequence
  score_HH<-round(cellStats(HH_norm, mean), 0) #cellStats(HH_norm, sum)/(ncell(HH_norm)-freq(HH_norm, value=NA)
  score_NP<-round(cellStats(NP_norm, mean), 0)
  score_WA<-round(cellStats(WA_norm, mean), 0)
  score_HC<-round(cellStats(HC_norm, mean), 0)
  score_RV<-round(cellStats(RV_norm, mean), 0)
  
  #NEW CODE
  hh_info['score']<-score_HH
  np_info['score']<-score_NP
  wa_info['score']<-score_WA
  hc_info['score']<-score_HC
  rv_info['score']<-score_RV
  
  # scores matrix
  scores_df<-as.data.frame(matrix(data=c("Human health", "Nutrient pollution", "Water availability", "Habitat cohesion", "Recreational value",
                                            score_HH , score_NP, score_WA, score_HC ,  score_RV), nrow =5 , ncol=2, byrow = F)) 
  colnames(scores_df)<-c("consequence","scores")
  scores_df$scores<-as.numeric(scores_df$scores)
  
  #write.table(scores_df, file=paste0("Scores_Game_",game_id,"Round_",round_id,".txt"), row.names=F, col.names = T)
  
  #### Spider plot #####
  scores_df$max_cons<-rep(100,length(scores_df$consequence))
  scores_df$id<- seq(1,length(scores_df$consequence),1)
  
  p <-
    ggplot(scores_df, aes(x=as.factor(id), y=max_cons))+        # Note that id is a factor. If x is numeric, there is some space between the first bar
    geom_bar(aes(x=as.factor(id), y=max_cons),fill = "snow4", stat="identity", alpha=0.3) +
    geom_bar(aes(x=as.factor(id), y=scores, fill=consequence), stat="identity", alpha=0.9) +
    theme_minimal() +
    theme(
      legend.position = "none",
      axis.text = element_blank(),
      axis.title = element_blank(),
      panel.grid = element_blank(),
      plot.margin = unit(rep(1,5), "cm") 
    ) +
    coord_polar()
  
  # Save your plot
 png(paste0("Spider_plot_","Game_",game_id,"_Round_",round_id,".png"), bg = 'transparent',  width = 5, height = 5, units = "cm", res = 200)
  plot(p)

  # Adding labels
  grid.text(scores_df[1,1], x=0.77,  y=0.75, gp=gpar(col="black", fontsize=5, fontface="bold"))
  grid.text(scores_df[2,1], x=0.92,  y=0.4, gp=gpar(col="black", fontsize=5, fontface="bold"))
  grid.text(scores_df[3,1], x=0.5,  y=0.21, gp=gpar(col="black", fontsize=5, fontface="bold"))
  grid.text(scores_df[4,1], x=0.1,  y=0.4, gp=gpar(col="black", fontsize=5, fontface="bold"))
  grid.text(scores_df[5,1], x=0.21,  y=0.75, gp=gpar(col="black", fontsize=5, fontface="bold"))

  dev.off()

#}  
  
  #NEW CODE
  plot_name <- paste0("Spider_plot_", "Game_", game_id, "_Round_", round_id, ".png")
  plot_info <- list('name' = plot_name, 'id' = -1)
  
  
#### Upload #####
  #connect to GeoServer
  ## Geoserver
  gs_url <- geoserver_url
  gsman <-GSManager$new(
    url = gs_url, #baseUrl of the Geoserver
    user = "admin", pwd = "geoserver", #credentials
    logger = NULL #logger, for info or debugging purpose
  )
  
  #create GeoServer workspace for given game and round
  ws_name <- paste0("esgame_game",game_id, "_round",round_id)
  deleted <- gsman$deleteWorkspace(ws_name, recurse = TRUE)
  created <- gsman$createWorkspace(ws_name, paste0("https://esgame.unige.ch/", ws_name))
  
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
  
  calculated_rasters <- list(hh_info, wa_info, hc_info, np_info, rv_info, plot_info)
  
  #CHANGED CODE --> loop over calculated rasters which contains all the informations
  for (i in 1:length(calculated_rasters)) {
      if(calculated_rasters[[i]]['id'] == -1) {
        calculated_rasters[[i]]['url'] = paste0(req$rook.url_scheme,"://", req$HTTP_HOST, "/images/", calculated_rasters[[i]]['name'])
      } else {
  short_name <- substring(calculated_rasters[[i]]['name'], 1, nchar(calculated_rasters[[i]]['name'])-4)
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
  
  raster_url <- paste0(gs_url , "/wcs?service=WCS&version=2.0.0&request=GetCoverage" ,
                           "&coverageId=" , ws_name , ":" , short_name ,
                           "&format=image%2Fgeotiff" )
  
  calculated_rasters[[i]]['url'] = raster_url
  log_info("Constructed URL for  {short_name}: from {raster_url}")
  
  #DELETED CODE
  }
  }
 
  
  #DELETED CODE
  
  return(list(results = calculated_rasters))
}
