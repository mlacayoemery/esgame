import { GameBoardType } from "./game-board-type";
import { DefaultGradients } from "../helpers/gradients";
import { TranslateService } from "@ngx-translate/core";

type LanguageString = Record<string, string>;

export class Settings {
	title: string;
	highlightColor: string;
	elementSize: number;
	gameBoardColumns: number;
	gameBoardRows: number;
	imageMode: boolean;
	basicInstructions: LanguageString;
	advancedInstructions: LanguageString;
	mode: 'GRID' | 'SVG';
	infiniteLevels: boolean;
	productionTypes: { id: string, name: LanguageString, fieldColor: string, image: string, maxElements: number }[] = [];
	maps: { id: string, name: LanguageString, gradient: DefaultGradients, gameBoardType: GameBoardType, linkedToProductionTypes: string[], urlToData: string }[] = [];
	
	constructor(
		private translate: TranslateService,
		data: any
	) {
		this.mapData(data);	
	}

	//levels: { id: string, name: LanguageString, maps: string[], instructions: LanguageString }[] = [];

	mapData(data: any) {
		this.title = data.title;
		this.elementSize = data.elementSize;
		this.gameBoardColumns = data.gameBoardColumns;
		this.gameBoardRows = data.gameBoardRows;
		this.imageMode = data.imageMode;
		this.mode = data.mapMode == "svg" ? 'SVG' : 'GRID';
		this.infiniteLevels = data.infiniteLevels;
		this.highlightColor = data.highlightColor;
		this.basicInstructions = data.basicInstructions;
		this.advancedInstructions = data.advancedInstructions;
		this.productionTypes = data.productionTypes.map((o: any) => ({ id: o.id, name: o.name, fieldColor: o.fieldColor, image: o.image, maxElements: o.maxElements }));
		this.maps = data.maps.map((o: any) => ({ id: o.id, name: o.name, gradient: convertGradient(o.gradient), gameBoardType: convertGameBoardType(o.gameBoardtype), linkedToProductionTypes: o.linkedToProductionTypes, urlToData: o.linkToData }));
		//this.levels = data.levels.map((o) => ({ id: o.id, name: o.name, maps: o.maps, instructions: o.instructions }));

		this.translate.getLangs().forEach((lang) => {
			this.maps.forEach(o => {
				var translation = {} as any;
				translation["map_name_" + o.id] = o.name[lang];
				this.translate.setTranslation(lang, translation, true);
			});
			this.productionTypes.forEach(o => {
				var translation = {} as any;
				translation["production_type_" + o.id] = o.name[lang];
				this.translate.setTranslation(lang, translation, true);
			});
			var translation = {} as any;
			translation["basic instructions"] = this.basicInstructions[lang];
			translation["advanced instructions"] = this.advancedInstructions[lang];
			this.translate.setTranslation(lang, translation, true);
		});
	}
}

const convertGameBoardType = (type: string) => {
	switch (type) {
		case "Suitablity": return GameBoardType.SuitabilityMap;
		case "Consequence": return GameBoardType.ConsequenceMap;
		case "Drawing": return GameBoardType.DrawingMap;
		case "Background": return GameBoardType.BackgroundMap;
		default: return GameBoardType.SuitabilityMap;
	}
};
const convertGradient = (gradientName: string) => gradientName as unknown as DefaultGradients;