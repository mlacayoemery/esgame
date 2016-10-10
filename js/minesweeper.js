/*global $: true, console: true */

$(function(){
  "use strict";

/* =========================================== */
// --- Global & Default Variables ---
/* =========================================== */

var globals = {
  firstClick: true,
  gameover: false,
  canvas: null,
  context: null,
  totalMines: 0,
  totalFlags: 0,
  elapsedTime: 0,
  clock: '',
  restart: '',
  mineMap: '',
  flagMap: '',
  map_ag: '',
  map_ranch: '',
  revealedMap: '',
  currentAnimation: '',
  previous: new Array(2),
  squaresX: '',
  squaresY: '',
  flag: 1,
  raster: new Object(),
  pallette: new Object(),
  totalFarms: 0,
  totalRanches: 0,
  pts_ag: 0,
  pts_ranch: 0,
  pts_pos: 0,
  pts_hq: 0,
  pts_c: 0,
  pts_hunt: 0,
  pts_wq: 0,
  pts_neg: 0,
  pts_net: 0
},

defaults = {
  difficulty: 0,
  celSize: 15,
  width: 420,
  height: 435,
  background: 'white',
  font: '14px Arial',
  celColor: "#d2b188", //'#dadada',
  celStroke: 'white',
  celRadius: 5,
  mineImg: 'images/mine.png',
  flagImg: 'images/flag.png',
  cornImg: 'images/corn.png',
  cowImg: 'images/cow.png'
},

containers = {
  // In core.init(), we add containers.
};

var pallette_ag = new Object();

pallette_ag[0] = "#d2b188";
/*
pallette_ag[75] = "#002000";
pallette_ag[150] = "#009900";
pallette_ag[225] = "#007f00";
pallette_ag[300] = "#006600";
pallette_ag[375] = "#004c00";
*/
pallette_ag[75] = "#eef5fb";
pallette_ag[150] = "#b3dfe3";
pallette_ag[225] = "#61c3a3";
pallette_ag[300] = "#20a561";
pallette_ag[375] = "#0f6d33";

var pallette_ranch = new Object();

pallette_ranch[0] = "#d2b188";
pallette_ranch[50] = "#fceedc";
pallette_ranch[100] = "#f9be85";
pallette_ranch[150] = "#f68d3b";
pallette_ranch[200] = "#f14f24";
pallette_ranch[250] = "#983f25";

var pallette_habitat = new Object();
pallette_habitat[0] = "#d2b188";
pallette_habitat[25] = "#fffaf7";
pallette_habitat[50] = "#f6c6c0";
pallette_habitat[75] = "#ea699f";
pallette_habitat[100] = "#ad1d81";
pallette_habitat[125] = "#492365";

var pallette_carbon = new Object();
pallette_carbon[0] = "#d2b188";
pallette_carbon[25] = "#f8f27d";
pallette_carbon[50] = "#f7d068";
pallette_carbon[75] = "#f6a825";
pallette_carbon[100] = "#ae5322";
pallette_carbon[125] = "#670b0d";

var pallette_water = new Object();
pallette_water[0] = "#d2b188";
pallette_water[25] = "#fbfaff";
pallette_water[50] = "#c6dbf0";
pallette_water[75] = "#6cafde";
pallette_water[100] = "#186fac";
pallette_water[125] = "#1f3069";

var pallette_hunt = new Object();
pallette_hunt[0] = "#d2b188";
pallette_hunt[25] = "#fbf9c9";
pallette_hunt[50] = "#a5d6b2";
pallette_hunt[75] = "#37b7c3";
pallette_hunt[100] = "#277ebc";
pallette_hunt[125] = "#27369a";

var h_colors = new Object();
h_colors[0] = "#0000ff";
h_colors[1] = "#ff0000";

var pallette_home = new Object();

pallette_home[0] = "#000000";
pallette_home[1] = "#010101";
pallette_home[2] = "#010102";
pallette_home[3] = "#010202";
pallette_home[4] = "#020204";
pallette_home[5] = "#030300";
pallette_home[6] = "#030405";
pallette_home[7] = "#040405";
pallette_home[8] = "#040607";
pallette_home[9] = "#050503";
pallette_home[10] = "#050709";
pallette_home[11] = "#060605";
pallette_home[12] = "#090806";
pallette_home[13] = "#0a0c0d";
pallette_home[14] = "#0b0c0a";
pallette_home[15] = "#0c1112";
pallette_home[16] = "#0d1112";
pallette_home[17] = "#0f1516";
pallette_home[18] = "#0f1617";
pallette_home[19] = "#141b17";
pallette_home[20] = "#161c2a";
pallette_home[21] = "#172127";
pallette_home[22] = "#181b0f";
pallette_home[23] = "#19252e";
pallette_home[24] = "#1b2833";
pallette_home[25] = "#1c2120";
pallette_home[26] = "#233341";
pallette_home[27] = "#252f31";
pallette_home[28] = "#263335";
pallette_home[29] = "#272b17";
pallette_home[30] = "#293e4d";
pallette_home[31] = "#2e4250";
pallette_home[32] = "#303425";
pallette_home[33] = "#303619";
pallette_home[34] = "#373c1a";
pallette_home[35] = "#374e4d";
pallette_home[36] = "#414924";
pallette_home[37] = "#49524e";
pallette_home[38] = "#4a718b";
pallette_home[39] = "#4e5b2b";
pallette_home[40] = "#51778f";
pallette_home[41] = "#526f9e";
pallette_home[42] = "#526fb1";
pallette_home[43] = "#52767d";
pallette_home[44] = "#527bb9";
pallette_home[45] = "#5361aa";
pallette_home[46] = "#5374b5";
pallette_home[47] = "#5476b8";
pallette_home[48] = "#5481b8";
pallette_home[49] = "#556cb0";
pallette_home[50] = "#5573b6";
pallette_home[51] = "#5684ba";
pallette_home[52] = "#5772b5";
pallette_home[53] = "#577cb9";
pallette_home[54] = "#5783bb";
pallette_home[55] = "#5785bf";
pallette_home[56] = "#5788bf";
pallette_home[57] = "#578cc5";
pallette_home[58] = "#586bb0";
pallette_home[59] = "#586fb2";
pallette_home[60] = "#5878b6";
pallette_home[61] = "#587eb6";
pallette_home[62] = "#5883bc";
pallette_home[63] = "#5975b7";
pallette_home[64] = "#597fbd";
pallette_home[65] = "#5985ba";
pallette_home[66] = "#5985bf";
pallette_home[67] = "#598bc4";
pallette_home[68] = "#5991bb";
pallette_home[69] = "#5a869d";
pallette_home[70] = "#5a88be";
pallette_home[71] = "#5a8dbc";
pallette_home[72] = "#5a8fb8";
pallette_home[73] = "#5c85be";
pallette_home[74] = "#5c8fbd";
pallette_home[75] = "#5c90bf";
pallette_home[76] = "#5c92bf";
pallette_home[77] = "#5d7fa2";
pallette_home[78] = "#5d858f";
pallette_home[79] = "#5d85b6";
pallette_home[80] = "#5d8aa0";
pallette_home[81] = "#5d8fc3";
pallette_home[82] = "#5d94c0";
pallette_home[83] = "#5d94c1";
pallette_home[84] = "#5e97bc";
pallette_home[85] = "#5f75b9";
pallette_home[86] = "#5f8bc4";
pallette_home[87] = "#5f92bb";
pallette_home[88] = "#5f92c2";
pallette_home[89] = "#6099c1";
pallette_home[90] = "#609bbc";
pallette_home[91] = "#616e41";
pallette_home[92] = "#6194c6";
pallette_home[93] = "#6195be";
pallette_home[94] = "#6198c3";
pallette_home[95] = "#619bb7";
pallette_home[96] = "#627a72";
pallette_home[97] = "#627d6d";
pallette_home[98] = "#6284be";
pallette_home[99] = "#628cbf";
pallette_home[100] = "#6291c2";
pallette_home[101] = "#6296c5";
pallette_home[102] = "#6298c2";
pallette_home[103] = "#6299c4";
pallette_home[104] = "#629ac2";
pallette_home[105] = "#6396be";
pallette_home[106] = "#6398c1";
pallette_home[107] = "#639bc7";
pallette_home[108] = "#639dbf";
pallette_home[109] = "#63a1bc";
pallette_home[110] = "#6494c0";
pallette_home[111] = "#64a0cb";
pallette_home[112] = "#64a2c6";
pallette_home[113] = "#659dbf";
pallette_home[114] = "#659dc0";
pallette_home[115] = "#65a1c7";
pallette_home[116] = "#6699c4";
pallette_home[117] = "#669ec5";
pallette_home[118] = "#66a1cd";
pallette_home[119] = "#6797c9";
pallette_home[120] = "#6798c3";
pallette_home[121] = "#67a1cc";
pallette_home[122] = "#67a7ba";
pallette_home[123] = "#6886c1";
pallette_home[124] = "#689eb9";
pallette_home[125] = "#68a0a6";
pallette_home[126] = "#68a2c3";
pallette_home[127] = "#68a4be";
pallette_home[128] = "#68a5cf";
pallette_home[129] = "#699db9";
pallette_home[130] = "#69a1c3";
pallette_home[131] = "#69a3cb";
pallette_home[132] = "#69a4c4";
pallette_home[133] = "#69a6cf";
pallette_home[134] = "#6a9cce";
pallette_home[135] = "#6a9dc5";
pallette_home[136] = "#6caacc";
pallette_home[137] = "#6d7f3c";
pallette_home[138] = "#6d9c9d";
pallette_home[139] = "#6da0cb";
pallette_home[140] = "#6da1c3";
pallette_home[141] = "#6da3c8";
pallette_home[142] = "#6da4c2";
pallette_home[143] = "#6da4d4";
pallette_home[144] = "#6da5c6";
pallette_home[145] = "#6da6c2";
pallette_home[146] = "#6da7c7";
pallette_home[147] = "#6ea5c3";
pallette_home[148] = "#6ea6c2";
pallette_home[149] = "#6ea6c9";
pallette_home[150] = "#6f9993";
pallette_home[151] = "#6f9c91";
pallette_home[152] = "#6fa7bb";
pallette_home[153] = "#6fa7cd";
pallette_home[154] = "#70a9c7";
pallette_home[155] = "#70aac4";
pallette_home[156] = "#70abc7";
pallette_home[157] = "#70b0a9";
pallette_home[158] = "#716754";
pallette_home[159] = "#71aac3";
pallette_home[160] = "#71aac6";
pallette_home[161] = "#72a597";
pallette_home[162] = "#72a8c3";
pallette_home[163] = "#72a9c6";
pallette_home[164] = "#72aac6";
pallette_home[165] = "#72aac9";
pallette_home[166] = "#72adc8";
pallette_home[167] = "#72b0bf";
pallette_home[168] = "#73a7d8";
pallette_home[169] = "#73a9c4";
pallette_home[170] = "#73a9c5";
pallette_home[171] = "#73abc3";
pallette_home[172] = "#73abcf";
pallette_home[173] = "#73adc5";
pallette_home[174] = "#73afc5";
pallette_home[175] = "#74a8bb";
pallette_home[176] = "#74b1d8";
pallette_home[177] = "#75a9c0";
pallette_home[178] = "#75aac0";
pallette_home[179] = "#75acbe";
pallette_home[180] = "#75adcc";
pallette_home[181] = "#75aeca";
pallette_home[182] = "#75b3d1";
pallette_home[183] = "#76adc8";
pallette_home[184] = "#76afc6";
pallette_home[185] = "#76afc9";
pallette_home[186] = "#76b0c5";
pallette_home[187] = "#76b0cf";
pallette_home[188] = "#77aca5";
pallette_home[189] = "#77adc9";
pallette_home[190] = "#77b0ce";
pallette_home[191] = "#77b3ca";
pallette_home[192] = "#77b7c6";
pallette_home[193] = "#77bbc5";
pallette_home[194] = "#78b1c6";
pallette_home[195] = "#78b1c9";
pallette_home[196] = "#78b4c5";
pallette_home[197] = "#798e73";
pallette_home[198] = "#79a06e";
pallette_home[199] = "#79aec7";
pallette_home[200] = "#79b3ca";
pallette_home[201] = "#79b7c1";
pallette_home[202] = "#79b7c6";
pallette_home[203] = "#79b8c7";
pallette_home[204] = "#79b9be";
pallette_home[205] = "#7ab1c9";
pallette_home[206] = "#7ab2c8";
pallette_home[207] = "#7ab3c9";
pallette_home[208] = "#7ab3cc";
pallette_home[209] = "#7ab4d2";
pallette_home[210] = "#7ab6c7";
pallette_home[211] = "#7ab8c8";
pallette_home[212] = "#7bb0c9";
pallette_home[213] = "#7bb1c9";
pallette_home[214] = "#7bb2c9";
pallette_home[215] = "#7bb6c8";
pallette_home[216] = "#7bb7c8";
pallette_home[217] = "#7bbaca";
pallette_home[218] = "#7bbbc9";
pallette_home[219] = "#7cabb9";
pallette_home[220] = "#7cacab";
pallette_home[221] = "#7cb3cb";
pallette_home[222] = "#7cb4cf";
pallette_home[223] = "#7cb5c9";
pallette_home[224] = "#7cb5cb";
pallette_home[225] = "#7cb5d2";
pallette_home[226] = "#7cb6ce";
pallette_home[227] = "#7cb8ca";
pallette_home[228] = "#7cb8d6";
pallette_home[229] = "#7cb9ca";
pallette_home[230] = "#7cbccb";
pallette_home[231] = "#7cc0c9";
pallette_home[232] = "#7db8cc";
pallette_home[233] = "#7e9760";
pallette_home[234] = "#7eaea6";
pallette_home[235] = "#7eb4cf";
pallette_home[236] = "#7ebbcb";
pallette_home[237] = "#7fb4be";
pallette_home[238] = "#7fbbcd";
pallette_home[239] = "#809f63";
pallette_home[240] = "#80b2a1";
pallette_home[241] = "#80b7dc";
pallette_home[242] = "#80b8cd";
pallette_home[243] = "#80bacc";
pallette_home[244] = "#80c1ce";
pallette_home[245] = "#81b4b7";
pallette_home[246] = "#81b4cb";
pallette_home[247] = "#81b6cc";
pallette_home[248] = "#81b7bd";
pallette_home[249] = "#81bacf";
pallette_home[250] = "#81bcda";
pallette_home[251] = "#81c4cd";
pallette_home[252] = "#828a39";
pallette_home[253] = "#828a42";
pallette_home[254] = "#829563";
pallette_home[255] = "#829744";
pallette_home[256] = "#82bad3";
pallette_home[257] = "#82bbcf";
pallette_home[258] = "#82c2cb";
pallette_home[259] = "#82c3cf";
pallette_home[260] = "#82c5d1";
pallette_home[261] = "#83bdcf";
pallette_home[262] = "#83bdd6";
pallette_home[263] = "#83bfca";
pallette_home[264] = "#83c1ce";
pallette_home[265] = "#83c2d0";
pallette_home[266] = "#83c4d1";
pallette_home[267] = "#84a17c";
pallette_home[268] = "#84a583";
pallette_home[269] = "#84b9d2";
pallette_home[270] = "#84bdd5";
pallette_home[271] = "#84bfdd";
pallette_home[272] = "#84c0da";
pallette_home[273] = "#84c1d1";
pallette_home[274] = "#84c1e6";
pallette_home[275] = "#85bbce";
pallette_home[276] = "#85bfd1";
pallette_home[277] = "#86a87b";
pallette_home[278] = "#86bfc5";
pallette_home[279] = "#86c5ce";
pallette_home[280] = "#87bdb7";
pallette_home[281] = "#87bdbf";
pallette_home[282] = "#87bece";
pallette_home[283] = "#87bfd2";
pallette_home[284] = "#889f4e";
pallette_home[285] = "#88a87c";
pallette_home[286] = "#88bcd3";
pallette_home[287] = "#88bebb";
pallette_home[288] = "#89a86c";
pallette_home[289] = "#89b198";
pallette_home[290] = "#89b9b7";
pallette_home[291] = "#89bdd2";
pallette_home[292] = "#89beba";
pallette_home[293] = "#89c1c8";
pallette_home[294] = "#89c6d1";
pallette_home[295] = "#8aa15a";
pallette_home[296] = "#8abfd4";
pallette_home[297] = "#8ac2db";
pallette_home[298] = "#8ac8d2";
pallette_home[299] = "#8ac8da";
pallette_home[300] = "#8b9a59";
pallette_home[301] = "#8dc3c7";
pallette_home[302] = "#8ea75d";
pallette_home[303] = "#8eb49c";
pallette_home[304] = "#8ec3c1";
pallette_home[305] = "#8fa348";
pallette_home[306] = "#8fa36a";
pallette_home[307] = "#8fc1b8";
pallette_home[308] = "#90a569";
pallette_home[309] = "#90ab71";
pallette_home[310] = "#91ae81";
pallette_home[311] = "#91c0aa";
pallette_home[312] = "#91c6de";
pallette_home[313] = "#91cbe2";
pallette_home[314] = "#92a755";
pallette_home[315] = "#92c0b8";
pallette_home[316] = "#93ad67";
pallette_home[317] = "#93b68e";
pallette_home[318] = "#94a966";
pallette_home[319] = "#94ab47";
pallette_home[320] = "#94af79";
pallette_home[321] = "#94c8e0";
pallette_home[322] = "#94d0de";
pallette_home[323] = "#95aa6e";
pallette_home[324] = "#95ac48";
pallette_home[325] = "#95c1b2";
pallette_home[326] = "#95c4b0";
pallette_home[327] = "#95ccd9";
pallette_home[328] = "#96a25c";
pallette_home[329] = "#96a64b";
pallette_home[330] = "#96aa41";
pallette_home[331] = "#97a348";
pallette_home[332] = "#97ac46";
pallette_home[333] = "#97af4d";
pallette_home[334] = "#97b37d";
pallette_home[335] = "#97b987";
pallette_home[336] = "#97c8d7";
pallette_home[337] = "#98a949";
pallette_home[338] = "#98af52";
pallette_home[339] = "#98b14a";
pallette_home[340] = "#98b249";
pallette_home[341] = "#98bb99";
pallette_home[342] = "#99ac86";
pallette_home[343] = "#99af48";
pallette_home[344] = "#99b45d";
pallette_home[345] = "#99b9a6";
pallette_home[346] = "#99c5bd";
pallette_home[347] = "#9aad47";
pallette_home[348] = "#9aad86";
pallette_home[349] = "#9aaf47";
pallette_home[350] = "#9ab049";
pallette_home[351] = "#9ab246";
pallette_home[352] = "#9ab24a";
pallette_home[353] = "#9ba945";
pallette_home[354] = "#9bab4b";
pallette_home[355] = "#9bae49";
pallette_home[356] = "#9bb053";
pallette_home[357] = "#9bb250";
pallette_home[358] = "#9bb545";
pallette_home[359] = "#9cb048";
pallette_home[360] = "#9cb094";
pallette_home[361] = "#9cb15f";
pallette_home[362] = "#9cb651";
pallette_home[363] = "#9cc0aa";
pallette_home[364] = "#9cc8c6";
pallette_home[365] = "#9db146";
pallette_home[366] = "#9db16f";
pallette_home[367] = "#9db270";
pallette_home[368] = "#9db449";
pallette_home[369] = "#9db64e";
pallette_home[370] = "#9dc4b6";
pallette_home[371] = "#9eb14b";
pallette_home[372] = "#9eb349";
pallette_home[373] = "#9eb35d";
pallette_home[374] = "#9eba6a";
pallette_home[375] = "#9ecac6";
pallette_home[376] = "#9fb259";
pallette_home[377] = "#9fb348";
pallette_home[378] = "#9fb361";
pallette_home[379] = "#9fb74a";
pallette_home[380] = "#9fb753";
pallette_home[381] = "#9fb7a2";
pallette_home[382] = "#a0b153";
pallette_home[383] = "#a0b488";
pallette_home[384] = "#a0b649";
pallette_home[385] = "#a0b661";
pallette_home[386] = "#a0b6a0";
pallette_home[387] = "#a0b761";
pallette_home[388] = "#a0b94b";
pallette_home[389] = "#a0bca7";
pallette_home[390] = "#a0bd87";
pallette_home[391] = "#a0d3e8";
pallette_home[392] = "#a1b446";
pallette_home[393] = "#a1b64a";
pallette_home[394] = "#a1b84a";
pallette_home[395] = "#a1b899";
pallette_home[396] = "#a1b94a";
pallette_home[397] = "#a1b94b";
pallette_home[398] = "#a1c7c9";
pallette_home[399] = "#a1ced9";
pallette_home[400] = "#a2b44b";
pallette_home[401] = "#a2b849";
pallette_home[402] = "#a2b94a";
pallette_home[403] = "#a3b849";
pallette_home[404] = "#a3b949";
pallette_home[405] = "#a4b649";
pallette_home[406] = "#a4b949";
pallette_home[407] = "#a4ba46";
pallette_home[408] = "#a4ba4a";
pallette_home[409] = "#a4bb56";
pallette_home[410] = "#a5b64a";
pallette_home[411] = "#a5b7a3";
pallette_home[412] = "#a5b849";
pallette_home[413] = "#a5b89d";
pallette_home[414] = "#a5ba49";
pallette_home[415] = "#a5ba4a";
pallette_home[416] = "#a5ba4e";
pallette_home[417] = "#a6b952";
pallette_home[418] = "#a6ba6c";
pallette_home[419] = "#a6bb49";
pallette_home[420] = "#a6bc4a";
pallette_home[421] = "#a6bd4b";
pallette_home[422] = "#a7ba49";
pallette_home[423] = "#a7bc49";
pallette_home[424] = "#a7be69";
pallette_home[425] = "#a7c3c0";
pallette_home[426] = "#a7c6b6";
pallette_home[427] = "#a8b54d";
pallette_home[428] = "#a8bb48";
pallette_home[429] = "#a9b847";
pallette_home[430] = "#a9ba47";
pallette_home[431] = "#a9be4b";
pallette_home[432] = "#aaa97c";
pallette_home[433] = "#aabb47";
pallette_home[434] = "#aabb48";
pallette_home[435] = "#aabc4e";
pallette_home[436] = "#aabd48";
pallette_home[437] = "#aabd49";
pallette_home[438] = "#aabe41";
pallette_home[439] = "#aabe48";
pallette_home[440] = "#aabf49";
pallette_home[441] = "#aabf4a";
pallette_home[442] = "#ab9c76";
pallette_home[443] = "#abc8bf";
pallette_home[444] = "#acae65";
pallette_home[445] = "#acbc49";
pallette_home[446] = "#acbe49";
pallette_home[447] = "#acbf48";
pallette_home[448] = "#acc049";
pallette_home[449] = "#acc14c";
pallette_home[450] = "#ada575";
pallette_home[451] = "#adb859";
pallette_home[452] = "#adbc48";
pallette_home[453] = "#adbe48";
pallette_home[454] = "#adbe49";
pallette_home[455] = "#aeaf5e";
pallette_home[456] = "#aeb363";
pallette_home[457] = "#aebb48";
pallette_home[458] = "#aebf49";
pallette_home[459] = "#aec148";
pallette_home[460] = "#aec149";
pallette_home[461] = "#aed3dd";
pallette_home[462] = "#afb845";
pallette_home[463] = "#afbb48";
pallette_home[464] = "#afc24a";
pallette_home[465] = "#afc7b3";
pallette_home[466] = "#b0bc48";
pallette_home[467] = "#b0c248";
pallette_home[468] = "#b0c249";
pallette_home[469] = "#b1bf4d";
pallette_home[470] = "#b1c14f";
pallette_home[471] = "#b1c248";
pallette_home[472] = "#b1c24b";
pallette_home[473] = "#b1c348";
pallette_home[474] = "#b1c34a";
pallette_home[475] = "#b1c34b";
pallette_home[476] = "#b1c44a";
pallette_home[477] = "#b1cdae";
pallette_home[478] = "#b2b048";
pallette_home[479] = "#b2ba47";
pallette_home[480] = "#b2be49";
pallette_home[481] = "#b2c349";
pallette_home[482] = "#b2c34a";
pallette_home[483] = "#b2c549";
pallette_home[484] = "#b3bf4d";
pallette_home[485] = "#b3c147";
pallette_home[486] = "#b4c548";
pallette_home[487] = "#b4c64d";
pallette_home[488] = "#b4c896";
pallette_home[489] = "#b4c8af";
pallette_home[490] = "#b4cdca";
pallette_home[491] = "#b4d3d4";
pallette_home[492] = "#b5bb4e";
pallette_home[493] = "#b6b46c";
pallette_home[494] = "#b6bb49";
pallette_home[495] = "#b6bd55";
pallette_home[496] = "#b6bf66";
pallette_home[497] = "#b6c447";
pallette_home[498] = "#b6c549";
pallette_home[499] = "#b7b450";
pallette_home[500] = "#b7d0a8";
pallette_home[501] = "#b8ad53";
pallette_home[502] = "#b8c461";
pallette_home[503] = "#b9c74b";
pallette_home[504] = "#b9ca4b";
pallette_home[505] = "#baa858";
pallette_home[506] = "#baaf52";
pallette_home[507] = "#bcbd40";
pallette_home[508] = "#bcc847";
pallette_home[509] = "#bccd48";
pallette_home[510] = "#bdc059";
pallette_home[511] = "#bebe55";
pallette_home[512] = "#becb4a";
pallette_home[513] = "#bfb459";
pallette_home[514] = "#bfc544";
pallette_home[515] = "#c0d4a0";
pallette_home[516] = "#c1b453";
pallette_home[517] = "#c1cd4a";
pallette_home[518] = "#c2c945";
pallette_home[519] = "#c3bf52";
pallette_home[520] = "#c3c64a";
pallette_home[521] = "#c3cf48";
pallette_home[522] = "#c4cc4c";
pallette_home[523] = "#c4cd45";
pallette_home[524] = "#c4d049";
pallette_home[525] = "#c5ce52";
pallette_home[526] = "#c6b375";
pallette_home[527] = "#c6bd51";
pallette_home[528] = "#c7d049";
pallette_home[529] = "#c8c84d";
pallette_home[530] = "#cace44";
pallette_home[531] = "#cbce42";
pallette_home[532] = "#cccf46";
pallette_home[533] = "#cecf41";
pallette_home[534] = "#ced04c";
pallette_home[535] = "#ced243";
pallette_home[536] = "#cfc845";
pallette_home[537] = "#d0d14a";
pallette_home[538] = "#d0d14b";
pallette_home[539] = "#d2d446";
pallette_home[540] = "#d3ce47";
pallette_home[541] = "#d3d247";
pallette_home[542] = "#d4d94a";
pallette_home[543] = "#d5d1cf";
pallette_home[544] = "#d5d44b";
pallette_home[545] = "#d7d548";
pallette_home[546] = "#dadc4e";

h_colors = pallette_home;

/*
var home = [[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,  1], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]];
*/

var home = [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 18, 17, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 32, 96, 432, 488, 322, 336, 399, 425, 91, 33, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 37, 348, 395, 526, 450, 290, 266, 398, 491, 490, 360, 356, 371, 34, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 11, 300, 341, 287, 389, 301, 363, 259, 327, 328, 357, 318, 358, 368, 339, 388, 252, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 14, 376, 418, 313, 260, 251, 298, 294, 443, 411, 373, 383, 344, 379, 379, 408, 394, 421, 506, 0, 0, 0, 0, 0], [0, 0, 0, 5, 366, 381, 364, 225, 238, 296, 264, 386, 323, 489, 306, 387, 396, 402, 397, 362, 407, 476, 484, 478, 0, 0, 0, 0], [0, 0, 0, 97, 121, 184, 136, 297, 244, 180, 182, 461, 367, 439, 463, 393, 434, 361, 314, 500, 477, 374, 492, 546, 158, 0, 0, 0], [0, 0, 27, 143, 98, 119, 209, 279, 257, 110, 178, 390, 382, 320, 309, 378, 347, 281, 326, 501, 426, 380, 469, 442, 543, 12, 0, 0], [0, 0, 77, 60, 100, 261, 231, 192, 141, 135, 245, 417, 220, 304, 263, 151, 197, 427, 510, 457, 527, 511, 529, 513, 456, 253, 0, 0], [0, 19, 85, 42, 232, 159, 181, 99, 241, 262, 370, 495, 530, 410, 465, 265, 280, 258, 292, 524, 340, 493, 499, 520, 420, 372, 1, 0], [0, 35, 63, 120, 142, 46, 64, 168, 312, 315, 462, 459, 464, 431, 509, 400, 369, 424, 355, 525, 521, 385, 413, 188, 334, 412, 25, 0], [0, 78, 79, 200, 65, 73, 123, 274, 375, 438, 448, 419, 449, 534, 512, 482, 441, 472, 403, 289, 542, 454, 351, 234, 299, 435, 43, 0], [0, 254, 133, 186, 62, 92, 271, 391, 317, 406, 423, 440, 504, 497, 486, 522, 473, 498, 415, 487, 345, 523, 470, 249, 321, 311, 219, 0], [0, 331, 272, 146, 61, 45, 153, 256, 316, 352, 419, 404, 437, 467, 447, 404, 483, 517, 475, 471, 444, 455, 204, 205, 228, 273, 246, 0], [0, 255, 335, 187, 155, 101, 86, 176, 342, 428, 414, 401, 384, 474, 416, 409, 468, 480, 481, 503, 505, 451, 302, 149, 207, 282, 124, 0], [0, 137, 308, 226, 235, 227, 222, 208, 154, 338, 349, 324, 333, 343, 405, 446, 460, 508, 436, 458, 516, 359, 125, 128, 199, 179, 38, 0], [0, 39, 319, 310, 173, 152, 214, 89, 131, 132, 95, 129, 270, 268, 433, 430, 422, 453, 528, 538, 347, 198, 84, 156, 190, 206, 26, 0], [0, 29, 350, 377, 288, 83, 53, 116, 224, 177, 72, 115, 213, 248, 330, 332, 365, 392, 519, 515, 354, 169, 111, 278, 286, 93, 2, 0], [0, 0, 329, 452, 239, 66, 49, 117, 291, 216, 130, 144, 71, 250, 303, 445, 434, 485, 502, 544, 233, 269, 174, 221, 211, 75, 0, 0], [0, 0, 36, 429, 277, 102, 50, 94, 276, 223, 147, 48, 58, 118, 293, 532, 539, 537, 541, 496, 284, 237, 138, 275, 217, 21, 0, 0], [0, 0, 0, 337, 285, 185, 44, 104, 283, 215, 162, 54, 59, 134, 346, 536, 533, 535, 466, 305, 157, 479, 112, 170, 175, 0, 0, 0], [0, 0, 0, 22, 240, 145, 47, 70, 165, 196, 114, 51, 52, 139, 307, 545, 531, 518, 353, 161, 201, 150, 56, 148, 0, 0, 0, 0], [0, 0, 0, 0, 28, 90, 167, 76, 189, 229, 163, 82, 88, 122, 242, 507, 514, 540, 295, 109, 230, 108, 113, 16, 0, 0, 0, 0], [0, 0, 0, 0, 0, 20, 57, 164, 247, 203, 212, 195, 127, 67, 166, 325, 494, 267, 211, 81, 202, 74, 13, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 6, 41, 126, 236, 210, 171, 107, 55, 103, 68, 172, 87, 191, 193, 80, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 15, 69, 183, 218, 243, 194, 160, 140, 105, 106, 40, 7, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]]

globals.raster = home;
globals.pallette = h_colors;

var pts_agcarb = [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 75, 50, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 75, 75, 75, 50, 50, 50, 50, 50, 50, 50, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 75, 25, 75, 50, 75, 50, 75, 50, 50, 75, 50, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 75, 50, 50, 50, 75, 50, 50, 50, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 75, 75, 75, 50, 50, 50, 25, 50, 50, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 75, 50, 50, 50, 50, 50, 50, 50, 100, 50, 50, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 75, 100, 50, 50, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 75, 50, 50, 50, 50, 50, 50, 25, 75, 75, 75, 50, 50, 50, 0, 0] , [0, 0, 0, 0, 0, 50, 50, 50, 0, 0, 0, 50, 50, 50, 50, 50, 75, 50, 50, 50, 75, 100, 50, 75, 25, 25, 25, 50] , [0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 75, 75, 50, 50, 50, 50, 50, 50, 75, 75, 25, 25, 75, 75, 50] , [0, 0, 0, 0, 75, 75, 75, 75, 50, 50, 75, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 25, 25, 25, 25, 50] , [0, 0, 0, 0, 0, 75, 75, 75, 50, 50, 50, 50, 50, 50, 50, 75, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50] , [0, 0, 0, 0, 0, 75, 75, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 0, 0] , [0, 0, 0, 0, 125, 100, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 100, 50, 50, 50, 50, 50, 50, 50, 50, 0, 0, 0] , [0, 0, 0, 0, 100, 75, 50, 50, 50, 50, 75, 75, 50, 50, 50, 50, 100, 75, 25, 25, 25, 50, 50, 50, 50, 0, 0, 0] , [0, 75, 50, 75, 75, 75, 50, 50, 50, 50, 50, 50, 50, 25, 25, 50, 75, 100, 50, 75, 50, 50, 75, 100, 50, 0, 0, 0] , [0, 50, 50, 75, 75, 75, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 100, 75, 75, 25, 75, 100, 100, 0, 0, 0, 0] , [50, 75, 50, 75, 50, 50, 75, 50, 50, 50, 50, 50, 50, 50, 75, 50, 50, 75, 100, 100, 100, 100, 100, 100, 50, 0, 0, 0] , [50, 50, 50, 50, 50, 50, 50, 50, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 100, 100, 125, 125, 125, 100, 50, 0, 0, 0] , [50, 50, 50, 50, 50, 50, 50, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 100, 100, 100, 75, 100, 100, 0, 0, 0, 0] , [0, 0, 50, 50, 50, 50, 0, 0, 0, 0, 50, 75, 50, 50, 25, 25, 50, 50, 75, 75, 75, 50, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 25, 50, 25, 25, 25, 75, 50, 50, 50, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 25, 50, 50, 50, 50, 50, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 75, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];
// the following is automatically generated by tif_to_js.py and converts the gis file pts_agrec.tif to javascript
var pts_agrec = [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 50, 25, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 25, 25, 25, 100, 100, 25, 25, 25, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 25, 50, 25, 25, 100, 100, 25, 25, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 50, 25, 75, 100, 75, 75, 25, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 50, 50, 50, 75, 100, 75, 75, 75, 25, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 25, 25, 25, 75, 100, 100, 100, 75, 25, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 50, 25, 25, 25, 75, 75, 100, 100, 75, 25, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 25, 25, 25, 75, 75, 75, 75, 75, 25, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 50, 25, 25, 25, 25, 25, 100, 100, 75, 50, 50, 25, 25, 25, 0, 0] , [0, 0, 0, 0, 0, 25, 25, 25, 0, 25, 25, 25, 25, 25, 25, 25, 50, 25, 100, 100, 100, 100, 25, 50, 25, 25, 25, 0] , [0, 0, 0, 0, 0, 25, 25, 25, 25, 25, 25, 25, 25, 50, 50, 25, 25, 25, 100, 100, 25, 25, 50, 25, 25, 50, 50, 0] , [0, 0, 0, 0, 25, 50, 25, 25, 25, 25, 50, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 0] , [0, 0, 0, 0, 0, 50, 50, 25, 25, 25, 25, 25, 25, 25, 25, 50, 25, 25, 25, 25, 25, 25, 25, 25, 25, 0, 0, 0] , [0, 0, 0, 0, 0, 50, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 0, 0, 0, 0] , [0, 0, 0, 0, 125, 75, 25, 25, 125, 75, 75, 25, 25, 25, 25, 25, 75, 25, 25, 25, 25, 25, 25, 25, 0, 0, 0, 0] , [0, 0, 0, 0, 75, 25, 25, 50, 50, 100, 125, 50, 25, 25, 25, 25, 75, 50, 25, 25, 25, 25, 25, 25, 0, 0, 0, 0] , [0, 50, 25, 25, 25, 25, 50, 125, 100, 125, 75, 75, 100, 25, 25, 25, 50, 75, 25, 50, 25, 25, 50, 0, 0, 0, 0, 0] , [0, 25, 25, 25, 25, 25, 125, 100, 50, 125, 50, 50, 100, 50, 25, 25, 25, 75, 50, 50, 25, 25, 100, 100, 0, 0, 0, 0] , [25, 25, 25, 25, 25, 75, 100, 0, 0, 125, 125, 100, 125, 75, 50, 25, 25, 25, 100, 75, 75, 100, 100, 100, 0, 0, 0, 0] , [25, 25, 25, 25, 125, 100, 0, 0, 0, 0, 100, 100, 100, 100, 25, 25, 25, 25, 75, 100, 125, 125, 125, 0, 0, 0, 0, 0] , [25, 25, 25, 25, 25, 0, 0, 0, 0, 0, 50, 50, 75, 25, 25, 25, 25, 25, 75, 75, 75, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 75, 25, 25, 25, 25, 25, 25, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 25, 25, 25, 25, 50, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 25, 25, 25, 25, 25, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 25, 25, 25, 25, 25, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 25, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];
// the following is automatically generated by tif_to_js.py and converts the gis file pts_crop_ag.tif to javascript
var pts_crop_ag = [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 150, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 225, 150, 225, 225, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 225, 225, 375, 225, 150, 375, 300, 150, 75, 225, 225, 150, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 225, 150, 300, 225, 225, 375, 375, 150, 150, 225, 225, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 300, 75, 75, 225, 150, 75, 150, 150, 150, 150, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 150, 150, 150, 225, 225, 75, 150, 150, 150, 150, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 375, 375, 375, 300, 300, 300, 75, 75, 225, 375, 225, 150, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 375, 375, 375, 150, 225, 300, 225, 75, 75, 225, 300, 225, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 375, 300, 150, 375, 225, 150, 75, 75, 300, 225, 150, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 375, 375, 300, 375, 300, 150, 300, 300, 75, 150, 150, 225, 375, 375, 300, 0, 0] , [0, 0, 0, 0, 0, 375, 225, 225, 0, 375, 375, 225, 300, 300, 150, 225, 300, 300, 300, 225, 75, 150, 225, 150, 150, 75, 75, 225] , [0, 0, 0, 0, 0, 150, 75, 150, 375, 300, 150, 225, 375, 375, 75, 75, 300, 225, 300, 375, 225, 75, 150, 150, 75, 75, 75, 150] , [0, 0, 0, 0, 0, 300, 75, 75, 375, 375, 375, 375, 375, 375, 150, 75, 375, 150, 75, 375, 300, 150, 150, 150, 225, 75, 75, 225] , [0, 0, 0, 0, 0, 75, 75, 75, 300, 300, 150, 150, 375, 375, 225, 150, 300, 300, 300, 300, 150, 300, 300, 225, 150, 150, 150, 150] , [0, 0, 0, 0, 0, 75, 75, 75, 300, 150, 300, 225, 150, 375, 375, 300, 375, 375, 300, 375, 375, 300, 300, 225, 225, 375, 0, 0] , [0, 0, 0, 0, 375, 75, 75, 150, 150, 300, 300, 375, 150, 375, 225, 225, 75, 300, 225, 150, 300, 300, 225, 225, 300, 0, 0, 0] , [0, 0, 0, 0, 0, 75, 75, 150, 150, 375, 375, 300, 225, 300, 375, 225, 75, 150, 300, 225, 300, 225, 225, 150, 225, 0, 0, 0] , [0, 225, 75, 75, 75, 75, 150, 300, 375, 375, 375, 300, 375, 225, 375, 300, 150, 75, 225, 375, 375, 300, 75, 75, 150, 0, 0, 0] , [0, 300, 75, 75, 75, 75, 300, 300, 300, 375, 300, 300, 375, 300, 300, 225, 225, 75, 75, 150, 225, 150, 75, 75, 0, 0, 0, 0] , [225, 225, 75, 75, 75, 75, 225, 375, 375, 375, 375, 375, 375, 300, 300, 375, 150, 225, 75, 75, 75, 75, 75, 75, 150, 0, 0, 0] , [375, 300, 150, 75, 300, 225, 300, 300, 0, 0, 375, 300, 375, 375, 300, 225, 150, 375, 75, 75, 75, 75, 75, 75, 75, 0, 0, 0] , [375, 375, 225, 150, 225, 225, 375, 0, 0, 0, 300, 300, 225, 375, 375, 150, 150, 225, 75, 75, 375, 300, 75, 75, 0, 0, 0, 0] , [0, 0, 375, 150, 225, 150, 0, 0, 0, 0, 225, 375, 150, 300, 225, 150, 225, 225, 75, 150, 150, 150, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 300, 75, 75, 225, 150, 150, 225, 375, 375, 225, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 225, 150, 150, 225, 300, 375, 300, 300, 225, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 225, 375, 225, 300, 300, 375, 225, 225, 150, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 300, 375, 300, 300, 225, 300, 75, 375, 375, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 375, 300, 300, 150, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 300, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];
// the following is automatically generated by tif_to_js.py and converts the gis file pts_pscarb.tif to javascript
var pts_pscarb = [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 75, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 50, 25, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 50, 50, 50, 25, 25, 25, 25, 25, 25, 25, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 0, 50, 25, 50, 25, 50, 25, 25, 50, 25, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 50, 25, 25, 25, 50, 25, 25, 25, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 50, 50, 50, 25, 25, 25, 0, 25, 25, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 50, 25, 25, 25, 25, 25, 25, 25, 75, 25, 25, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 25, 25, 25, 25, 25, 50, 75, 25, 25, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 50, 25, 25, 25, 25, 25, 25, 0, 50, 50, 50, 25, 25, 25, 0, 0] , [0, 0, 0, 0, 0, 25, 25, 25, 0, 0, 0, 25, 25, 25, 25, 25, 50, 25, 25, 25, 50, 75, 25, 50, 0, 0, 0, 25] , [0, 0, 0, 0, 0, 25, 25, 25, 25, 25, 25, 25, 25, 50, 50, 25, 25, 25, 25, 25, 25, 50, 50, 0, 0, 50, 50, 25] , [0, 0, 0, 0, 50, 50, 50, 50, 25, 25, 50, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 0, 0, 0, 0, 25] , [0, 0, 0, 0, 0, 50, 50, 50, 25, 25, 25, 25, 25, 25, 25, 50, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25] , [0, 0, 0, 0, 0, 50, 50, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 0, 0] , [0, 0, 0, 0, 100, 75, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 75, 25, 25, 25, 25, 25, 25, 25, 25, 0, 0, 0] , [0, 0, 0, 0, 75, 50, 25, 25, 25, 25, 50, 50, 25, 25, 25, 25, 75, 50, 0, 0, 0, 25, 25, 25, 25, 0, 0, 0] , [0, 50, 25, 50, 50, 50, 25, 25, 25, 25, 25, 25, 25, 0, 0, 25, 50, 75, 25, 50, 25, 25, 50, 75, 25, 0, 0, 0] , [0, 25, 25, 50, 50, 50, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 75, 50, 50, 0, 50, 75, 75, 0, 0, 0, 0] , [25, 50, 25, 50, 25, 25, 50, 25, 25, 25, 25, 25, 25, 25, 50, 25, 25, 50, 75, 75, 75, 75, 75, 75, 25, 0, 0, 0] , [25, 25, 25, 25, 25, 25, 25, 25, 0, 0, 25, 25, 25, 25, 25, 25, 25, 25, 75, 75, 100, 100, 100, 75, 25, 0, 0, 0] , [25, 25, 25, 25, 25, 25, 25, 0, 0, 0, 25, 25, 25, 25, 25, 25, 25, 25, 75, 75, 75, 50, 75, 75, 0, 0, 0, 0] , [0, 0, 25, 25, 25, 25, 0, 0, 0, 0, 25, 50, 25, 25, 0, 0, 25, 25, 50, 50, 50, 25, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 0, 25, 0, 0, 0, 50, 25, 25, 25, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 0, 25, 25, 25, 25, 25, 25, 25, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 25, 25, 25, 25, 25, 25, 25, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 25, 25, 25, 25, 25, 25, 25, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 50, 25, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];
// the following is automatically generated by tif_to_js.py and converts the gis file pts_psrec.tif to javascript
var pts_psrec = [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 75, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 75, 75, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 0, 25, 0, 0, 75, 75, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 0, 50, 75, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 25, 50, 75, 50, 50, 50, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 75, 75, 75, 50, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 0, 0, 0, 50, 50, 75, 75, 50, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 0, 0, 0, 0, 0, 75, 75, 50, 25, 25, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 0, 75, 75, 75, 75, 0, 25, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 0, 0, 0, 75, 75, 0, 0, 25, 0, 0, 25, 25, 0] , [0, 0, 0, 0, 0, 25, 0, 0, 0, 0, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 25, 25, 0, 0, 0, 0, 0, 0, 0, 0, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 100, 50, 0, 0, 100, 50, 50, 0, 0, 0, 0, 0, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 50, 0, 0, 25, 25, 75, 100, 25, 0, 0, 0, 0, 50, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 25, 0, 0, 0, 0, 25, 100, 75, 100, 50, 50, 75, 0, 0, 0, 25, 50, 0, 25, 0, 0, 25, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 100, 75, 25, 100, 25, 25, 75, 25, 0, 0, 0, 50, 25, 25, 0, 0, 75, 75, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 50, 75, 0, 0, 100, 100, 75, 100, 50, 25, 0, 0, 0, 75, 50, 50, 75, 75, 75, 0, 0, 0, 0] , [0, 0, 0, 0, 100, 75, 0, 0, 0, 0, 75, 75, 75, 75, 0, 0, 0, 0, 50, 75, 100, 100, 100, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 50, 0, 0, 0, 0, 0, 50, 50, 50, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 50, 0, 0, 0, 0, 0, 0, 25, 25, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];
// the following is automatically generated by tif_to_js.py and converts the gis file pts_aghq.tif to javascript
var pts_aghq = [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 125, 125, 50, 125, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 75, 50, 75, 75, 100, 125, 125, 125, 100, 75, 125, 125, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 100, 75, 50, 50, 75, 75, 125, 125, 50, 125, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 125, 125, 125, 75, 125, 125, 75, 50, 125, 100, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 125, 125, 125, 75, 125, 100, 125, 50, 75, 50, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 100, 125, 125, 75, 75, 100, 125, 125, 125, 50, 50, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 125, 25, 125, 125, 125, 75, 125, 125, 75, 50, 50, 125, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 125, 125, 125, 75, 125, 125, 75, 25, 50, 125, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 125, 50, 75, 100, 125, 75, 125, 125, 75, 50, 25, 50, 125, 75, 50, 0, 0] , [0, 0, 0, 0, 0, 25, 75, 125, 0, 0, 0, 75, 50, 75, 50, 50, 50, 75, 75, 75, 50, 25, 125, 50, 25, 25, 25, 75] , [0, 0, 0, 0, 0, 25, 25, 50, 50, 100, 125, 125, 75, 75, 75, 75, 125, 125, 125, 50, 75, 100, 50, 25, 25, 25, 25, 125] , [0, 0, 0, 0, 25, 25, 25, 25, 125, 50, 50, 50, 50, 125, 100, 50, 125, 125, 125, 125, 75, 125, 25, 75, 75, 25, 25, 125] , [0, 0, 0, 0, 0, 25, 25, 25, 75, 125, 125, 50, 75, 50, 75, 25, 125, 125, 125, 100, 50, 50, 100, 75, 125, 125, 125, 125] , [0, 0, 0, 0, 0, 25, 25, 25, 50, 125, 125, 75, 125, 125, 125, 50, 50, 50, 50, 50, 50, 75, 125, 50, 50, 125, 0, 0] , [0, 0, 0, 0, 0, 25, 25, 125, 125, 125, 125, 75, 125, 125, 75, 50, 25, 50, 100, 125, 75, 125, 125, 75, 125, 0, 0, 0] , [0, 0, 0, 0, 25, 25, 25, 25, 50, 25, 50, 50, 50, 50, 50, 125, 25, 75, 50, 25, 25, 75, 75, 50, 50, 0, 0, 0] , [0, 75, 25, 25, 25, 25, 125, 50, 100, 100, 75, 125, 100, 50, 75, 125, 50, 25, 100, 75, 75, 100, 50, 50, 75, 0, 0, 0] , [0, 75, 25, 25, 25, 25, 125, 75, 125, 125, 75, 125, 75, 125, 75, 125, 125, 25, 75, 75, 25, 100, 25, 25, 0, 0, 0, 0] , [125, 75, 25, 25, 25, 25, 50, 50, 100, 125, 50, 50, 75, 75, 50, 125, 125, 75, 25, 25, 25, 25, 25, 25, 100, 0, 0, 0] , [25, 50, 100, 25, 100, 100, 125, 125, 0, 0, 50, 125, 125, 75, 75, 125, 125, 125, 25, 25, 25, 25, 25, 25, 125, 0, 0, 0] , [125, 100, 125, 125, 125, 100, 125, 0, 0, 0, 50, 125, 125, 75, 50, 75, 125, 75, 25, 25, 25, 75, 25, 25, 0, 0, 0, 0] , [0, 0, 125, 100, 50, 75, 0, 0, 0, 0, 25, 75, 125, 100, 25, 25, 50, 50, 50, 50, 75, 125, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 125, 125, 75, 50, 50, 50, 75, 50, 75, 50, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 125, 100, 75, 50, 75, 75, 75, 75, 125, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 125, 125, 75, 125, 125, 125, 125, 75, 125, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 125, 50, 50, 100, 125, 125, 100, 125, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 125, 50, 75, 125, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 125, 125, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];
// the following is automatically generated by tif_to_js.py and converts the gis file pts_agwq.tif to javascript
var pts_agwq = [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 25, 25, 25, 25, 25, 25, 50, 25, 50, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 25, 25, 50, 50, 50, 25, 25, 25, 50, 25, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 25, 25, 25, 25, 25, 50, 50, 50, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 25, 25, 25, 25, 25, 25, 75, 75, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 25, 25, 25, 25, 50, 25, 25, 50, 50, 75, 75, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 50, 25, 25, 25, 50, 25, 25, 25, 25, 50, 50, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 75, 25, 25, 25, 50, 25, 25, 25, 25, 50, 50, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 25, 50, 25, 25, 25, 50, 50, 50, 50, 25, 50, 0, 0] , [0, 0, 0, 0, 0, 25, 50, 50, 0, 0, 0, 25, 50, 75, 50, 50, 50, 50, 50, 50, 50, 25, 25, 50, 25, 25, 25, 25] , [0, 0, 0, 0, 0, 25, 100, 50, 25, 25, 50, 50, 50, 50, 25, 50, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 50] , [0, 0, 0, 0, 0, 25, 100, 75, 25, 50, 50, 25, 25, 25, 25, 50, 25, 25, 25, 50, 50, 25, 25, 25, 25, 25, 25, 25] , [0, 0, 0, 0, 0, 75, 100, 100, 25, 50, 50, 25, 50, 50, 50, 50, 25, 25, 25, 25, 50, 50, 25, 50, 50, 50, 50, 25] , [0, 0, 0, 0, 0, 75, 100, 125, 125, 125, 125, 125, 100, 75, 50, 50, 25, 50, 50, 75, 75, 50, 50, 50, 50, 0, 0, 0] , [0, 0, 0, 0, 0, 75, 100, 25, 50, 75, 50, 75, 125, 75, 75, 50, 50, 50, 25, 75, 75, 50, 50, 75, 50, 0, 0, 0] , [0, 0, 0, 0, 25, 75, 75, 50, 75, 75, 75, 75, 125, 50, 75, 25, 100, 100, 75, 75, 75, 75, 75, 75, 50, 0, 0, 0] , [0, 50, 50, 75, 75, 25, 50, 50, 50, 75, 75, 50, 100, 50, 50, 100, 125, 100, 50, 50, 50, 75, 50, 50, 50, 0, 0, 0] , [0, 75, 75, 75, 75, 50, 75, 50, 50, 50, 75, 50, 125, 125, 125, 125, 125, 125, 100, 25, 50, 25, 50, 50, 0, 0, 0, 0] , [25, 75, 50, 75, 75, 75, 50, 50, 50, 75, 75, 75, 50, 75, 50, 100, 25, 100, 125, 75, 100, 100, 75, 25, 50, 0, 0, 0] , [50, 75, 75, 75, 75, 75, 75, 75, 0, 0, 75, 75, 50, 50, 50, 125, 100, 25, 125, 125, 125, 125, 100, 100, 25, 0, 0, 0] , [50, 75, 75, 75, 75, 75, 75, 0, 0, 0, 50, 50, 25, 50, 100, 125, 25, 50, 125, 100, 25, 25, 75, 100, 0, 0, 0, 0] , [0, 0, 50, 50, 75, 75, 0, 0, 0, 0, 75, 50, 25, 100, 125, 100, 50, 50, 125, 50, 50, 50, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 100, 125, 25, 25, 25, 25, 125, 50, 50, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 125, 50, 50, 50, 50, 25, 125, 100, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 25, 25, 100, 125, 25, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 75, 50, 75, 50, 25, 25, 125, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];
// the following is automatically generated by tif_to_js.py and converts the gis file pts_past_ps.tif to javascript
var pts_past_ps = [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 150, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 150, 150, 150, 200, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 200, 200, 250, 200, 150, 250, 150, 100, 50, 200, 100, 100, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 250, 100, 250, 200, 150, 150, 150, 50, 100, 100, 100, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 250, 100, 50, 100, 50, 50, 150, 150, 150, 200, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 150, 50, 100, 100, 50, 100, 150, 200, 100, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 200, 200, 150, 150, 150, 100, 50, 50, 150, 250, 200, 150, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 200, 250, 150, 100, 100, 150, 100, 50, 50, 250, 150, 100, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 250, 250, 100, 150, 200, 50, 50, 50, 250, 100, 150, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 200, 250, 250, 250, 250, 200, 150, 150, 50, 150, 200, 250, 200, 150, 150, 0, 0] , [0, 0, 0, 0, 0, 250, 250, 100, 0, 0, 0, 100, 150, 200, 100, 250, 250, 100, 250, 200, 50, 200, 150, 100, 100, 50, 50, 250] , [0, 0, 0, 0, 0, 250, 50, 200, 250, 150, 100, 150, 200, 250, 50, 100, 200, 100, 200, 250, 100, 50, 150, 100, 50, 50, 50, 200] , [0, 0, 0, 0, 250, 250, 50, 50, 200, 250, 150, 250, 200, 150, 100, 50, 250, 200, 100, 250, 200, 50, 100, 200, 150, 50, 50, 200] , [0, 0, 0, 0, 0, 50, 50, 50, 100, 150, 100, 100, 250, 250, 200, 100, 250, 200, 150, 100, 100, 150, 150, 200, 150, 200, 250, 100] , [0, 0, 0, 0, 0, 50, 50, 50, 100, 50, 100, 100, 100, 200, 250, 250, 250, 200, 250, 250, 150, 200, 200, 250, 200, 200, 0, 0] , [0, 0, 0, 0, 250, 100, 50, 100, 250, 150, 150, 150, 50, 200, 100, 250, 100, 250, 150, 150, 200, 200, 200, 150, 150, 0, 0, 0] , [0, 0, 0, 0, 250, 100, 50, 100, 100, 200, 250, 100, 100, 150, 200, 250, 50, 250, 250, 150, 100, 150, 200, 150, 250, 0, 0, 0] , [0, 200, 50, 50, 50, 50, 100, 250, 200, 250, 150, 150, 200, 150, 150, 250, 150, 50, 250, 250, 150, 200, 100, 50, 200, 0, 0, 0] , [0, 200, 50, 50, 0, 50, 250, 200, 100, 250, 100, 100, 200, 100, 150, 200, 250, 50, 50, 100, 200, 150, 50, 100, 0, 0, 0, 0] , [250, 200, 50, 50, 50, 150, 200, 200, 250, 250, 250, 200, 250, 150, 200, 200, 150, 200, 50, 50, 50, 50, 50, 50, 250, 0, 0, 0] , [250, 200, 50, 50, 250, 200, 150, 250, 0, 0, 200, 200, 200, 200, 100, 100, 100, 250, 50, 50, 50, 50, 50, 50, 250, 0, 0, 0] , [250, 250, 150, 100, 100, 250, 250, 0, 0, 0, 100, 100, 150, 200, 250, 150, 150, 200, 50, 50, 250, 250, 50, 50, 0, 0, 0, 0] , [0, 0, 250, 100, 50, 200, 0, 0, 0, 0, 100, 150, 50, 150, 150, 150, 250, 250, 100, 200, 200, 150, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 50, 50, 150, 150, 200, 250, 250, 200, 150, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 100, 100, 200, 150, 200, 150, 250, 100, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 200, 150, 100, 150, 250, 100, 100, 100, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 150, 200, 150, 150, 100, 100, 50, 200, 200, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 150, 150, 150, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 200, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];
// the following is automatically generated by tif_to_js.py and converts the gis file pts_pshq.tif to javascript
var pts_pshq = [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 100, 25, 100, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 25, 50, 50, 75, 100, 100, 100, 75, 50, 100, 100, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 75, 50, 25, 25, 50, 50, 100, 100, 25, 100, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 100, 100, 50, 100, 100, 50, 25, 100, 75, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 100, 100, 50, 100, 75, 100, 25, 50, 25, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 75, 100, 100, 50, 50, 75, 100, 100, 100, 25, 25, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 0, 100, 100, 100, 50, 100, 100, 50, 25, 25, 100, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 100, 100, 50, 100, 100, 50, 0, 25, 100, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 25, 50, 75, 100, 50, 100, 100, 50, 25, 0, 25, 100, 50, 25, 0, 0] , [0, 0, 0, 0, 0, 0, 50, 100, 0, 0, 0, 50, 25, 50, 25, 25, 25, 50, 50, 50, 25, 0, 100, 25, 0, 0, 0, 50] , [0, 0, 0, 0, 0, 0, 0, 25, 25, 75, 100, 100, 50, 50, 50, 50, 100, 100, 100, 25, 50, 75, 25, 0, 0, 0, 0, 100] , [0, 0, 0, 0, 0, 0, 0, 0, 100, 25, 25, 25, 25, 100, 75, 25, 100, 100, 100, 100, 50, 100, 0, 50, 50, 0, 0, 100] , [0, 0, 0, 0, 0, 0, 0, 0, 50, 100, 100, 25, 50, 25, 50, 0, 100, 100, 100, 75, 25, 25, 75, 50, 100, 100, 100, 100] , [0, 0, 0, 0, 0, 0, 0, 0, 25, 100, 100, 50, 100, 100, 100, 25, 25, 25, 25, 25, 25, 50, 100, 25, 25, 100, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 100, 100, 100, 100, 50, 100, 100, 50, 25, 0, 25, 75, 100, 50, 100, 100, 50, 100, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 25, 0, 25, 25, 25, 25, 25, 100, 0, 50, 25, 0, 0, 50, 50, 25, 25, 0, 0, 0] , [0, 50, 0, 0, 0, 0, 100, 25, 75, 75, 50, 100, 75, 25, 50, 100, 25, 0, 75, 50, 50, 75, 25, 25, 50, 0, 0, 0] , [0, 50, 0, 0, 0, 0, 100, 50, 100, 100, 50, 100, 50, 100, 50, 100, 100, 0, 50, 50, 0, 75, 0, 0, 0, 0, 0, 0] , [100, 50, 0, 0, 0, 0, 25, 25, 75, 100, 25, 25, 50, 50, 25, 100, 100, 50, 0, 0, 0, 0, 0, 0, 75, 0, 0, 0] , [0, 25, 75, 0, 75, 75, 100, 100, 0, 0, 25, 100, 100, 50, 50, 100, 100, 100, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0] , [100, 75, 100, 100, 100, 75, 100, 0, 0, 0, 25, 100, 100, 50, 25, 50, 100, 50, 0, 0, 0, 50, 0, 0, 0, 0, 0, 0] , [0, 0, 100, 75, 25, 50, 0, 0, 0, 0, 0, 50, 100, 75, 0, 0, 25, 25, 25, 25, 50, 100, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 100, 50, 25, 25, 25, 50, 25, 50, 25, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 75, 50, 25, 50, 50, 50, 50, 100, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 100, 50, 100, 100, 100, 100, 50, 100, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 25, 25, 75, 100, 100, 75, 100, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 25, 50, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];
// the following is automatically generated by tif_to_js.py and converts the gis file pts_pswq.tif to javascript
var pts_pswq = [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 25, 25, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 25, 0, 0, 0, 0, 0, 0, 25, 0, 25, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 0, 0, 25, 25, 25, 0, 0, 0, 25, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 25, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 0, 0, 0, 0, 25, 0, 0, 25, 25, 50, 50, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 0, 0, 0, 25, 0, 0, 0, 0, 25, 25, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 0, 0, 0, 25, 0, 0, 0, 0, 25, 25, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 25, 25, 0, 25, 0, 0, 0, 25, 25, 25, 25, 0, 25, 0, 0] , [0, 0, 0, 0, 0, 0, 25, 25, 0, 0, 0, 0, 25, 50, 25, 25, 25, 25, 25, 25, 25, 0, 0, 25, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 75, 25, 0, 0, 25, 25, 25, 25, 0, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25] , [0, 0, 0, 0, 0, 0, 75, 50, 0, 25, 25, 0, 0, 0, 0, 25, 0, 0, 0, 25, 25, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 50, 75, 75, 0, 25, 25, 0, 25, 25, 25, 25, 0, 0, 0, 0, 25, 25, 0, 25, 25, 25, 25, 0] , [0, 0, 0, 0, 0, 50, 75, 100, 100, 100, 100, 100, 75, 50, 25, 25, 0, 25, 25, 50, 50, 25, 25, 25, 25, 0, 0, 0] , [0, 0, 0, 0, 0, 50, 75, 0, 25, 50, 25, 50, 100, 50, 50, 25, 25, 25, 0, 50, 50, 25, 25, 50, 25, 0, 0, 0] , [0, 0, 0, 0, 0, 50, 50, 25, 50, 50, 50, 50, 100, 25, 50, 0, 75, 75, 50, 50, 50, 50, 50, 50, 25, 0, 0, 0] , [0, 25, 25, 50, 50, 0, 25, 25, 25, 50, 50, 25, 75, 25, 25, 75, 100, 75, 25, 25, 25, 50, 25, 25, 25, 0, 0, 0] , [0, 50, 50, 50, 50, 25, 50, 25, 25, 25, 50, 25, 100, 100, 100, 100, 100, 100, 75, 0, 25, 0, 25, 25, 0, 0, 0, 0] , [0, 50, 25, 50, 50, 50, 25, 25, 25, 50, 50, 50, 25, 50, 25, 75, 0, 75, 100, 50, 75, 75, 50, 0, 25, 0, 0, 0] , [25, 50, 50, 50, 50, 50, 50, 50, 0, 0, 50, 50, 25, 25, 25, 100, 75, 0, 100, 100, 100, 100, 75, 75, 0, 0, 0, 0] , [25, 50, 50, 50, 50, 50, 50, 0, 0, 0, 25, 25, 0, 25, 75, 100, 0, 25, 100, 75, 0, 0, 50, 75, 0, 0, 0, 0] , [0, 0, 25, 25, 50, 50, 0, 0, 0, 0, 50, 25, 0, 75, 100, 75, 25, 25, 100, 25, 25, 25, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 75, 100, 0, 0, 0, 0, 100, 25, 25, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 100, 25, 25, 25, 25, 0, 100, 75, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 25, 25, 0, 0, 75, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 25, 50, 25, 0, 0, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 25, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] , [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];


/* =========================================== */
// --- Core Functions ---
/* =========================================== */

var core = {
  
  /* ------------------------------------------- */
  // -- Initiate function
  // -- Get the canvas and context, as well as
  // -- attach some listeners.
  // -- @return void
  /* ------------------------------------------- */
  
  init: function(){
    globals.canvas = $('#board');
    globals.context = globals.canvas[0].getContext("2d");
    globals.context.background = defaults.background;

    var ratio = this.hiDPIRatio();
    if (ratio !== 1) {
      var originalWidth = globals.canvas[0].width;
      var originalHeight = globals.canvas[0].height;

      globals.canvas[0].width = originalWidth * ratio;
      globals.canvas[0].height = originalHeight * ratio;
      globals.canvas.css({
        width: originalWidth + "px",
        height: originalHeight + "px"
      });

      globals.context.scale(ratio, ratio);
    }

    globals.context.font = defaults.font;
    
    defaults.width = globals.canvas.width();
    globals.squaresX = Math.floor(defaults.width / defaults.celSize);
    globals.squaresY = Math.floor(defaults.height / defaults.celSize);
    
    globals.mineMap = new Array(globals.squaresX);
    globals.flagMap = new Array(globals.squaresX);
    globals.revealedMap = new Array(globals.squaresX);

    globals.map_ag = new Array(globals.squaresX);
    globals.map_ranch = new Array(globals.squaresX);
    
    containers.flags = $('#flags');
    containers.mines = $('#mines');

    containers.farms = $('#farms');
    containers.ranches = $('#ranches');

    containers.pts_ag = $('#pts_ag');
    containers.pts_ranch = $('#pts_ranch');
    containers.pts_pos = $('#pts_pos');
    containers.pts_hq = $('#pts_hq');
    containers.pts_c = $('#pts_c');
    containers.pts_hunt = $('#pts_hunt');
    containers.pts_wq = $('#pts_wq');
    containers.pts_neg = $('#pts_neg');
    containers.pts_net = $('#pts_net');

    containers.status = $('#status');
    containers.time = $('#time');
    containers.msg = $('#msg');
    containers.scoreboard = $('#scoreboard');
    
    containers.easy = $('#easybtn');
    //containers.medium = $('#mediumbtn');
    //containers.insane = $('#insanebtn');
    containers.ag = $('#ag');
    containers.ranch = $('#ranch');
//    containers.switchscreens = $('#switchscreens');
//    containers.reset = $('#reset');

    containers.color_ag = $('#color_ag');
    containers.color_ranch = $('#color_ranch');
    containers.color_habitat = $('#color_habitat');
    containers.color_carbon = $('#color_carbon');
    containers.color_water = $('#color_water');
    containers.color_hunt = $('#color_hunt');
    
    var difarr = { 9: containers.easy }; //, 6: containers.medium, 3: containers.insane};
    
    $.each(difarr, function(index, value){
      value.on({
        click: function(){
          defaults.difficulty = index;
          util.switchScreens();
        }
      });
    });

/*    
    containers.switchscreens.on({
      click: function(){
        util.switchScreens();
      }
    });
    
    containers.reset.on({
      click: function(){
        core.reset();
      }
    });
*/
    containers.ag.on({
      click: function(){
        globals.flag = 0;
      }
    });

    containers.ranch.on({
      click: function(){
        globals.flag = 1;
        globals.totalFlags = 1;
      }
    });


    containers.color_ag.on({
      click: function(){
        globals.raster = pts_crop_ag;
        globals.pallette = pallette_ag;
        animation.standardBoard();
      }
    });

    containers.color_ranch.on({
      click: function(){
        globals.raster = pts_past_ps;
	globals.pallette = pallette_ranch;
	animation.standardBoard();
      }
    });

    containers.color_habitat.on({
      click: function(){
        globals.raster = pts_aghq;
	globals.pallette = pallette_habitat;
	animation.standardBoard();
      }
    });

    containers.color_carbon.on({
      click: function(){
        globals.raster = pts_agcarb;
	globals.pallette = pallette_carbon;
	animation.standardBoard();
      }
    });

    containers.color_water.on({
      click: function(){
        globals.raster = pts_agwq;
	globals.pallette = pallette_water;
	animation.standardBoard();
      }
    });

    containers.color_hunt.on({
      click: function(){
        globals.raster = pts_agrec;
	globals.pallette = pallette_hunt;
	animation.standardBoard();
      }
    });

  
    $('.gamescreen').hide();
    
    // Attach some listeners, at this point only mousedown
    globals.canvas.on({
      mouseup: function(e){
        action.click(e);
      },
      mousemove: function(e){
        //action.hover(e);  
      }
    });
	
	// Some quick preloading of the mine and flag images
	var images = new Array();
	images[0] = new Image();
	images[0].src = defaults.mineImg;
	images[1] = new Image();
	images[1].src = defaults.flagImg;
    
    // Initialize the board
    core.setup();
    
    //animation.arrow();

  },

  hiDPIRatio: function() {
    var devicePixelRatio, backingStoreRatio;

    devicePixelRatio = window.devicePixelRatio || 1;
    backingStoreRatio = globals.context.webkitBackingStorePixelRatio ||
                        globals.context.mozBackingStorePixelRatio ||
                        globals.context.msBackingStorePixelRatio ||
                        globals.context.oBackingStorePixelRatio ||
                        globals.context.backingStorePixelRatio || 1;

    return devicePixelRatio / backingStoreRatio;
  },
  
  /* ------------------------------------------- */
  // -- Reset function
  // -- Resets the game, clears the timers, etc.
  // -- @return void
  /* ------------------------------------------- */
  
  reset: function(){  
    
    // Clear the timer
    window.clearInterval(globals.clock);
    window.clearInterval(globals.restart);
  
    // Wipe the canvas clean
    globals.context.clearRect(0,0,defaults.width,defaults.height);
    
    // Reset all global vars to their default value
    globals.gameover = false;
    globals.firstClick = false;
    globals.totalMines = 0;
    globals.totalFlags = 0;
    globals.elapsedTime = 0;
    globals.mineMap = new Array(globals.squaresX);
    globals.flagMap = new Array(globals.squaresX);

    globals.map_ag = new Array(globals.squaresX);
    globals.map_ranch = new Array(globals.squaresX);

    globals.revealedMap = new Array(globals.squaresX);
    
    // Clear certain containers
    containers.flags.html('');

    containers.farms.html('');
    containers.ranches.html('');

    containers.pts_ag.html('');
    containers.pts_ranch.html('');
    containers.pts_pos.html('');
    containers.pts_hq.html('');
    containers.pts_c.html('');
    containers.pts_hunt.html('');
    containers.pts_wq.html('');
    containers.pts_neg.html('');
    containers.pts_net.html('');

    containers.mines.html('');
    containers.status.html('Game on :)');
    containers.time.html('0');
    containers.msg.html('Click on a square to start the game!');
    
    // Initialize the board
    core.setup();
    
    window.clearInterval(globals.currentAnimation);
    //animation.walker();
  },
  
  /* ------------------------------------------- */
  // -- Setup function
  // -- Sets up certain variables and draws the 
  // -- board. Used during both init() and reset()
  // -- @return void
  /* ------------------------------------------- */
  
  setup: function(){
    // Clear flagMap array
    for(var k = 0; k < globals.squaresX; k++){
      globals.flagMap[k] = Array(globals.squaresY);
      globals.revealedMap[k] = Array(globals.squaresY);

    globals.map_ag[k] = Array(globals.squaresX);
    globals.map_ranch[k] = Array(globals.squaresX);
    }
    
    scores.display();
    
    // Make sure proper styles are set
    globals.context.strokeStyle = defaults.celStroke;
    globals.context.fillStyle = defaults.celColor;
    
    animation.standardBoard();
  },
  
  /* ------------------------------------------- */
  // -- Timer function
  // -- Starts the clock
  // -- @return void
  /* ------------------------------------------- */
  
  timer: function(){
    // Setup global var timer
    globals.clock = setInterval(function(){
      globals.elapsedTime++;
      // Append time to #time
      containers.time.html(globals.elapsedTime);
    }, 1000); 
  }
};

/* =========================================== */
// --- Action Functions ---
/* =========================================== */

var action = {
  
  /* ------------------------------------------- */
  // -- Click function
  // -- listens to right and left mouse clicks
  // -- and determines the proper cel and what 
  // -- action to take.
  // -- @return void
  /* ------------------------------------------- */
  
  click: function(e){  
  
    if(globals.gameover){
			return false;
		}
    
    // Calculate x & y relevant to the cel size, also (l) check if current x,y combo has already been revealed
    var x = Math.floor((e.pageX - globals.canvas[0].offsetLeft - 1) / defaults.celSize),
      	y = Math.floor((e.pageY - globals.canvas[0].offsetTop - 1) / defaults.celSize),
      	l = (globals.revealedMap[x][y]) ? 1 : -1;
    
    // If left-click, not a flag and the game is still going on
    if(e.which === 1 && globals.flagMap[x][y] !== 1 && globals.map_ag[x][y] != 1 && globals.map_ranch[x][y] != 1 && defaults.difficulty !== 0){
/*     

      // Is this the first click of the game?
      if(globals.firstClick === true){
        
        window.clearInterval(globals.currentAnimation);
        animation.standardBoard();
        
        // Set difficulty, based on default and difficulty selector, and start the timer
        //defaults.difficulty = containers.difficulty.val();
        core.timer();
        
        // Keep generating possible minemaps till one is generate where the square first clicked is not a mine
        do{
          action.generateMines(globals.mineMap); 
        }while(globals.mineMap[x][y] === -1);
        
        // Set number of mines
        containers.mines.html('You have to find ' + globals.totalMines + ' mines to win.');
        globals.firstClick = false;
      }
      
      // Activate index function. See below for more details
      action.index(x, y);
    
		// If middle-click and a revealed square
  	}else if(e.which === 3 && util.is('revealed', x, y)){
	  
			// Calculate number of surrounding mines
			var num = 0,
					surrounded = new Array(),
					xArr = [x, x + 1, x - 1],
					yArr = [y, y + 1, y - 1];
			
			for(var a = 0; a < 3; a++){
				for(var b = 0; b < 3; b++){
			
        	if(util.is('flag', xArr[a], yArr[b])){
				  	num++;	  
          }else{
		  			surrounded.push([xArr[a], yArr[b]]);  
		  		}
        }
      }
	  
			// Compare with number of actual mines
			if(num === globals.mineMap[x][y]){
				$.each(surrounded, function(){
					// Remove non-flagged squares, using action.index	
					action.index(this[0], this[1]);	  
				});
			}
		
*/			// If right-click, game is not over, square has not been revealed and this is not the first click	
		}else if(e.which === 3 && l < 0 && globals.firstClick !== true){
      
      // Flag the square
      var flag = new Image();

      //flag.src = defaults.cornImg;

      if (globals.flag == 0) {
        flag.src = defaults.cornImg;
      } else {
        flag.src = defaults.cowImg;
      }

      flag.onload = function(){
        action.flag(flag,x,y);
      };
    } 
  },
  
  /* ------------------------------------------- */
  // -- Hover function
  // -- Speaks for itself
  // -- @return void
  /* ------------------------------------------- */
  
  hover: function(e){
    
		if(!globals.gameover){
			// Calculate x & y relevant to the cel size, also (l) check if current x,y combo has already been revealed
			var x = Math.floor((e.pageX - globals.canvas[0].offsetLeft - 1) / defaults.celSize),
				y = Math.floor((e.pageY - globals.canvas[0].offsetTop - 1) / defaults.celSize),
				l = (globals.revealedMap[x][y]) ? 1 : -1,
				f = (globals.flagMap[x][y]) ? 1 : -1;
			
			var pX = globals.previous[0],
				pY = globals.previous[1];
			
			if(typeof pX !== 'undefined' && globals.revealedMap[pX][pY] !== 1 && globals.flagMap[pX][pY] !== 1){
				globals.context.fillStyle = "#FFFFFF";//defaults.celColor;
				util.roundRect(globals.previous[0], globals.previous[1]);
                                util.roundRect(globals.previous[0]+1, globals.previous[1]);
                                util.roundRect(globals.previous[0], globals.previous[1]+1);
				util.roundRect(globals.previous[0]+1, globals.previous[1]+1);
			}
			
			if(l < 0 && f < 0 && !globals.firstClick){
				
				globals.context.fillStyle = '#aaa';
				util.roundRect(x, y);
				globals.previous[0] = x;
				globals.previous[1] = y;
			}
		}
  },
  
  /* ------------------------------------------- */
  // -- Index function
  // -- Used to determine whether square is a mine
  // -- or not 
  // -- @return void
  /* ------------------------------------------- */
  
  index: function(x, y){
    
    // If square is not revealed, is within boundaries and exists
    if(x >= 0 && y >= 0 && x <= globals.squaresX && y <= globals.squaresY && globals.mineMap[x] !== undefined){
      
      var l = (globals.revealedMap[x][y]) ? 1 : -1;
      
      if(!util.is('revealed', x, y)){
        
        // Add revealed square to the revealed array
        globals.revealedMap[x][y] = 1;
        
				if(globals.mineMap[x][y] !== -1){
					// 'remove square', by drawing a white one over it
					var alpha = 0.1,
					squareFade = setInterval(function(){
						globals.context.strokeStyle = 'white';
						globals.context.fillStyle = 'rgba(255,255,255,' + alpha + ')';
						util.roundRect(x, y);
							
						if(globals.mineMap[x][y] !== -1){
					
							// Default colors for the index numbers in an array. [0] not having a color.
							var colorMap = ['none', 'blue', 'green', 'red',  'black', 'orange', 'cyan'];
							globals.context.fillStyle = colorMap[globals.mineMap[x][y]];
							globals.context.fillText(globals.mineMap[x][y], (x * defaults.celSize) + 5, (y * defaults.celSize) + 16);	
						}
						
						alpha = alpha + .1;
						
						if(alpha > 1){
							window.clearInterval(squareFade);
						}
					}, 50);
				
        // If the square that was clicked has no surrounding mines...
				}else{
          
          // If unforutantely there is mine, display it and trigger the function leading to the end of the game
          var mine = new Image();
          mine.src = defaults.mineImg;
          mine.onload = function() {
            action.revealMines(mine);
          };
        }
				
				if(globals.mineMap[x][y] === 0){
          
          // remove all neighbors till squares are found that do have surrounding mines
          for(var i = -1; i <= 1; i++){
            for(var j = -1; j <= 1; j++){
              // If a neighboring square is also not surrounded by mines, remove his neighbors also; and repeat
              if(l < 0 && x + i >= 0 && y + j >= 0 && x + i <= globals.squaresX && y + j <= globals.squaresX){
                action.index(x + i, y + j);
              }
            }
          }
          
        // If the square does not cover a mine, display the index number
        }
      }
    }
  },
  
  /* ------------------------------------------- */
  // -- Flag function
  // -- Used to flag a square
  // -- @return void
  /* ------------------------------------------- */
  
  flag: function(flag, x, y){
    
    // If square is not already flagged
    if(globals.flagMap[x][y] !== 1 && globals.map_ag[x][y] != 1 && globals.map_ranch[x][y] != 1 &&((globals.flag == 1 && globals.totalRanches < 3.25) || (globals.flag == 0 && globals.totalFarms < 3.25))){
      
      // Draw flag
      for(var i = 0; i < 2; i++){
        for(var j = 0; j < 2; j++){
          globals.context.drawImage(flag, (x+i) * defaults.celSize, (y+j) * defaults.celSize, defaults.celSize, defaults.celSize);
          if (globals.flag == 1){
            globals.map_ranch[x+i][y+j]=1;
          } else {
            globals.map_ag[x+i][y+j]=1;
          }
      }}

      globals.flagMap[x][y] = 1;
      globals.totalFlags++;




      if (globals.flag == 1){
        for(var i = 0; i < 2; i++){
          for(var j = 0; j < 2; j++){
            globals.pts_ranch+=pts_past_ps[y+j][x+i];
            globals.pts_hq+=pts_pshq[y+j][x+i];
            globals.pts_c+=pts_pscarb[y+j][x+i];
            globals.pts_hunt+=pts_psrec[y+j][x+i];
            globals.pts_wq+=pts_pswq[y+j][x+i];
        }}
        globals.totalRanches+=1;
      }
      else {
        for(var i = 0; i < 2; i++){
          for(var j = 0; j < 2; j++){
            globals.pts_ag+=pts_crop_ag[y+j][x+i];
            globals.pts_hq+=pts_aghq[y+j][x+i];
            globals.pts_c+=pts_agcarb[y+j][x+i];
            globals.pts_hunt+=pts_agrec[y+j][x+i];
            globals.pts_wq+=pts_agwq[y+j][x+i];
        }}
        globals.totalFarms+=1;
      }


      globals.pts_pos=globals.pts_ag+globals.pts_ranch;
      globals.pts_neg=globals.pts_hq+globals.pts_c+globals.pts_hunt+globals.pts_wq;
      globals.pts_net=globals.pts_pos-globals.pts_neg;
      
    }else{
      
      // Remove flag image
      var img = globals.context.createImageData(defaults.celSize, defaults.celSize);
      for(var i = img.data.length; --i >= 0;){
        img.data[i] = 0;
      }
      
      globals.context.putImageData(img, x * defaults.celSize, y * defaults.celSize);
      
      // Make sure proper styles are set
      globals.context.strokeStyle = defaults.celStroke;

      //globals.context.fillStyle = defaults.celColor;


      for(var i = 0; i < 2; i++){
        for(var j = 0; j < 2; j++){

      globals.context.fillStyle = globals.pallette[globals.raster[y+j][x+i]];    
      util.roundRect(x+i, y+j);

     }}

      globals.flagMap[x][y] = 0;
      globals.totalFlags--;


        for(var i = 0; i < 2; i++){
          for(var j = 0; j < 2; j++){
            if (globals.map_ranch[x+i][y+j] == 1){
              globals.pts_ranch-=pts_past_ps[y+j][x+i];
              globals.pts_hq-=pts_pshq[y+j][x+i];
              globals.pts_c-=pts_pscarb[y+j][x+i];
              globals.pts_hunt-=pts_psrec[y+j][x+i];
              globals.pts_wq-=pts_pswq[y+j][x+i];

              globals.map_ranch[x+i][y+j]=0;
              globals.totalRanches-=0.25;
           }
        }}

        for(var i = 0; i < 2; i++){
          for(var j = 0; j < 2; j++){
            if (globals.map_ag[x+i][y+j] == 1){
            globals.pts_ag-=pts_crop_ag[y+j][x+i];
            globals.pts_hq-=pts_aghq[y+j][x+i];
            globals.pts_c-=pts_agcarb[y+j][x+i];
            globals.pts_hunt-=pts_agrec[y+j][x+i];
            globals.pts_wq-=pts_agwq[y+j][x+i];

              globals.map_ag[x+i][y+j]=0;
              globals.totalFarms-=0.25;
           }

        }}


      globals.pts_pos=globals.pts_ag+globals.pts_ranch;
      globals.pts_neg=globals.pts_hq+globals.pts_c+globals.pts_hunt+globals.pts_wq;
      globals.pts_net=globals.pts_pos-globals.pts_neg;

    }
    
    // Adjust counters accordingly
    containers.farms.html('Farm area: ' + globals.totalFarms);
    containers.ranches.html('Ranch area: ' + globals.totalRanches);

    containers.pts_ag.html(globals.pts_ag);
    containers.pts_ranch.html(globals.pts_ranch);
    containers.pts_pos.html(globals.pts_pos);
    containers.pts_hq.html(globals.pts_hq);
    containers.pts_c.html(globals.pts_c);
    containers.pts_hunt.html(globals.pts_hunt);
    containers.pts_wq.html(globals.pts_wq);
    containers.pts_neg.html(globals.pts_neg);
    containers.pts_net.html(globals.pts_net);
    
    // With every flag (or unflag) check if the game has been won
    //action.won();
  },
  
  /* ------------------------------------------- */
  // -- Won function
  // -- Used to determine if the game has been won
  // -- @return void
  /* ------------------------------------------- */
  
  won: function(){
    
    // Setup counter
    var count = 0;
    
    // Count the number of flagged mines 
    for(var i = 0; i < globals.squaresX; i++){
      for(var j = 0; j < globals.squaresY; j++){
        if((globals.flagMap[i][j] === 1 ) && (globals.mineMap[i][j] === -1)){
          count++;
        } 
      }
    }
    
    // If the number of flagged mines equals the total number of mines, the game has been won
    if(count === globals.totalMines){
      // Set game over status
      globals.gameover = true;
      containers.status.html('You won! :D');
      
      scores.save();
      
      // Stops the timer and counts down to a reset of the game
      window.clearInterval(globals.clock);
    }
  },
  
  /* ------------------------------------------- */
  // -- Generate Mines function
  // -- Places the mines on the field, at random
  // -- @return void
  /* ------------------------------------------- */
  
  generateMines: function(){
    
    // For every square
    for(var i = 0; i < globals.squaresX; i++){
      globals.mineMap[i] = new Array(globals.squaresX);
      
      // The lower the dificulty, the more mines
      for(var j = 0; j < globals.squaresY; j++){
        globals.mineMap[i][j] = Math.floor((Math.random() * defaults.difficulty) - 1);
        
        if(globals.mineMap[i][j] > 0){
          globals.mineMap[i][j] = 0;
        }
      }
    } 
    
    // Move on to the next step of the setup
    action.calculateMines();
  },
  
  /* ------------------------------------------- */
  // -- Calculate Mines function
  // -- Used to calculate surrounding mines number
  // -- @return void
  /* ------------------------------------------- */
  
  calculateMines: function() {
    
    var mineCount = 0;
    globals.totalMines = 0;
    
    // Check every square
    for(var i = 0; i < globals.squaresX; i++){
      for(var j = 0; j < globals.squaresY; j++){
		  
			if(globals.mineMap[i][j] === -1){
				
				var xArr = [i, i + 1, i - 1],
						yArr = [j, j + 1, j - 1];	
				
					/* 
					
					The loop iterates over the surrounding squares as shown below:
								
								-------------------------
								| i - 1 |   i   | i + 1 |
								| j - 1 | j - 1 | j - 1 |
								-------------------------
								| i - 1 |   i   | i + 1 |
								|   j   |   j   |   j   |
								-------------------------
								| i - 1 |   i   | i + 1 |
								| j + 1 | j - 1 | j + 1 |
								-------------------------	
					*/
			
					for(var a = 0; a < 3; a++){
						for(var b = 0; b < 3; b++){
							if(util.is('mine', xArr[a], yArr[b])){
								globals.mineMap[xArr[a]][yArr[b]]++;
							}
						}
					}
					
					globals.totalMines++;	
				}  
      } 
    }
  },
  
  /* ------------------------------------------- */
  // -- Reveal Mines function
  // -- Reveals all the mines and triggers a game
  // -- over status
  // -- @return void
  /* ------------------------------------------- */
  
  revealMines: function(mine){
    
    // Draw all the mines
    for(var i = 0; i < globals.squaresX; i++){
      for(var j = 0; j < globals.squaresY; j++){
        if(globals.mineMap[i][j] === -1){
          globals.context.drawImage(mine, i * defaults.celSize, j * defaults.celSize, defaults.celSize, defaults.celSize);
        }
      }
    }
    
    // Set game over status
    globals.gameover = true;
    containers.status.html('Game over :(');
    containers.msg.html('Click the reset button to start a new game');
    
    // Stops the timer and counts down to a reset of the game
    window.clearInterval(globals.clock);
  }
};

/* =========================================== */
// --- Scores Functions ---
/* =========================================== */

var scores = {
  
  display: function(){
    
    if(typeof Storage !== 'undefined'){
      
      //delete localStorage.scores;
      
      if(typeof localStorage.scores !== 'undefined'){
      
        var lScores = JSON.parse(localStorage.scores);
        
        containers.scoreboard.html('<tr><th>Name</th><th>Mines</th><th>Seconds</th></tr>');
        
        $.each(lScores, function(){
          containers.scoreboard.append('<tr><td>' + this[0] + '</td><td>' + this[2] + '</td><td>' + this[3] + '</td></tr>');  
        });
      
      }else{
        
        containers.scoreboard.html('<tr><td>You have not won any games yet :(</td></tr>');
      }
    
    }else{
      containers.scoreboard.html('<tr><td>Unfortunately, your browser does not support local storage</td></tr>');       
    } 
    
  },
  
  save: function(){
    
    if(typeof Storage !== 'undefined'){
      
      var name = prompt('Your score is being stored. Please enter your name','Name'),
        score = [name, 'Insane', globals.totalMines, globals.elapsedTime, 10000];

      var scores = (typeof localStorage.scores !== 'undefined') ? JSON.parse(localStorage.scores) : new Array();
      
      scores.push(score);
      localStorage.scores = JSON.stringify(scores);
    }
  }
    
};

/* =========================================== */
// --- Animation Functions ---
/* =========================================== */

var animation = {
  
  standardBoard: function(){

    globals.context.fillStyle = defaults.celColor;

//    document.write(home[28][28]);
      
    for(var i = 0; i <= globals.squaresX; i++){
      for(var j = 0; j <= globals.squaresY; j++){
	if ((i < globals.squaresX) && (j < globals.squaresY)) {
       	    globals.context.fillStyle = globals.pallette[globals.raster[j][i]];
        } else {
            globals.context.fillStyle = defaults.celColor;
        }

          util.roundRect(i, j);

/*	if (globals.map_ag[i][j] == 1 || globals.map_ranch[i][j] == 1){
	  globals.context.fillStyle = defaults.celColor;
          util.roundRect(i, j);

        }*/
      } 
    }
//    globals.context.fillStyle = defaults.celColor;
  },
  
  walker: function(){
    // Make sure proper styles are set
    globals.context.strokeStyle = defaults.celStroke;
    
    var x = 0, y = 0;
    globals.currentAnimation = setInterval(function(){
      
      animation.standardBoard();
      
      globals.context.fillStyle = '#f16529';
      util.roundRect(x, y);
      
      x++;
      
      if(x === globals.squaresX){ x = 0; y++; }
      
      if(y === globals.squaresY){ x = 0; y = 0; }
    
    }, 30);
  }, 
  
  topDown: function(){
    // Make sure proper styles are set
    globals.context.strokeStyle = defaults.celStroke;
    
    var y = 0;
    globals.currentAnimation = setInterval(function(){
      
      animation.standardBoard();
      
      globals.context.fillStyle = '#f16529';
      
      for(var x = 0; x <= globals.squaresX; x++){
        util.roundRect(x, y);
      }
      
      if(y === globals.squaresY){
        y = 0;
      }
      
      y++;
    
    }, 50);
  },
  
  leftRight: function(){
    
    globals.context.strokeStyle = defaults.celStroke;
    
    var x = 0, dir = 0;
    globals.currentAnimation = setInterval(function(){
      
      animation.standardBoard();
      
      globals.context.fillStyle = '#f16529';
      
      util.roundRect(x, y);
      
      if(dir === 0 && x === globals.squaresX){
        dir = 1;
      }else if(dir === 1 && x === -1){
        dir = 0;
      }
      
      if(dir === 0){
        x++;  
      }else if(dir === 1){
        x--;
      }
    
    }, 50);
  },
  
  arrow: function(){
    
    var longArrow = [
      [5, 9], [5, 10], [5, 11],
      [6, 9], [6, 10], [6, 11],
      [7, 9], [7, 10], [7, 11],
      [8, 9], [8, 10], [8, 11],
      [9, 9], [9, 10], [9, 11],
      [10, 9], [10, 10], [10, 11],
      [11, 9], [11, 10], [11, 11],
      
      [12, 8], [12, 9], [12, 10], [12, 11], [12, 12],
      [13, 9], [13, 10], [13, 11],
      [14, 10]
    ], 
    shortArrow = [
      [5, 9], [5, 10], [5, 11],
      [6, 9], [6, 10], [6, 11],
      [7, 9], [7, 10], [7, 11],
      [8, 9], [8, 10], [8, 11],
      [9, 9], [9, 10], [9, 11],
      [10, 9], [10, 10], [10, 11],
      
      [11, 8], [11, 9], [11, 10], [11, 11], [11, 12],
      [12, 9], [12, 10], [12, 11],
      [13, 10]
    ],
    x = 0,
    arrow = shortArrow;
    
    globals.currentAnimation = setInterval(function(){  
    
      animation.standardBoard();
    
      globals.context.fillStyle = '#f16529';
    
      for(var i = 0; i <= arrow.length; i++){
        if(arrow[i] !== undefined){
          util.roundRect(arrow[i][0] * defaults.celSize, arrow[i][1] * defaults.celSize, defaults.celSize - 1, defaults.celSize - 1); 
        }
      }
      
      if(x % 2 === 0){
        arrow = longArrow;
      }else{
        arrow = shortArrow;
      }
      
      x++;
      
    }, 200);
  }
  
};

/* =========================================== */
// --- Utility Functions ---
/* =========================================== */

var util = {
  
  /* ------------------------------------------- */
  // -- Rounded Rectangle function
  // -- Draws rounded rectangles
  /* ------------------------------------------- */
  
  roundRect: function(x, y){
		
		var width = defaults.celSize - 1,
				height = defaults.celSize - 1,
				x = x * defaults.celSize,
				y = y * defaults.celSize;

    defaults.celRadius = 0;

    globals.context.strokeStyle="#a6a6a6";		
    globals.context.beginPath();
    globals.context.moveTo(x + defaults.celRadius, y);
    globals.context.lineTo(x + width - defaults.celRadius, y);
    //globals.context.quadraticCurveTo(x + width, y, x + width, y + defaults.celRadius);
    globals.context.lineTo(x + width, y + height - defaults.celRadius);
    //globals.context.quadraticCurveTo(x + width, y + height, x + width - defaults.celRadius, y + height);
    globals.context.lineTo(x + defaults.celRadius, y + height);
    //globals.context.quadraticCurveTo(x, y + height, x, y + height - defaults.celRadius);
    globals.context.lineTo(x, y + defaults.celRadius);
    //globals.context.quadraticCurveTo(x, y, x + defaults.celRadius, y);
    globals.context.closePath();
    globals.context.stroke();
    globals.context.fill();    
  },
  
  /* ------------------------------------------- */
  // -- Switch Screens function
  // -- Switch between start and game screen
  /* ------------------------------------------- */
  
  switchScreens: function(){
    if($('.startscreen').is(':hidden') === false){
      $('.startscreen').fadeToggle(400, 'swing', function(){
        core.reset();
        $('.gamescreen').fadeToggle();
      });   
    }else{
      $('.gamescreen').fadeToggle(400, 'swing', function(){
        core.reset();
        defaults.difficulty = 0;
        $('.startscreen').fadeToggle();
      });   
    }
  },
	
	is: function(what, x, y){
		var p = {
			'revealed': globals.revealedMap,
			'mine': globals.mineMap,
			'flag': globals.flagMap
		};
		
		if(typeof p[what][x] !== 'undefined' && typeof p[what][x][y] !== 'undefined' && p[what][x][y] > -1){
			return true;
		}else{
			return false;
		}
	}
};

/* =========================================== */
// --- Initiate Minesweeper ---
/* =========================================== */

  core.init();
});
