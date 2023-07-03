import { GameBoardType } from "./game-board-type";
import { CustomColors, DefaultGradients } from "../helpers/gradients";
import { TranslateService } from "@ngx-translate/core";

type LanguageString = Record<string, string>;

export class Settings {
	highlightColor: string;
	elementSize: number;
	gameBoardColumns: number;
	gameBoardRows: number;
	imageMode: boolean;
	basicInstructions: LanguageString;
	advancedInstructions: LanguageString;
	calcUrl: string;
	mode: 'GRID' | 'SVG';
	infiniteLevels: boolean;
	productionTypes: { id: string, name: LanguageString, fieldColor: string, urlToIcon: string, maxElements: number }[] = [];
	maps: { id: string, name: LanguageString, gradient: DefaultGradients, customColorId: string, gameBoardType: GameBoardType, productionTypes: string[], urlToData: string }[] = [];
	customColors: { id: string, colors: { number: number, color: string }[] }[];
	basicInstructionsImageUrl: string;
	advancedInstructionsImageUrl: string;
	
	constructor(
		private translate: TranslateService,
		data: any
	) {
		this.mapData(data);	
	}

	mapData(data: any) {
		this.elementSize = data.elementSize;
		this.gameBoardColumns = data.gameBoardColumns;
		this.gameBoardRows = data.gameBoardRows;
		this.imageMode = data.imageMode;
		this.mode = data.mapMode == "svg" ? 'SVG' : 'GRID';
		this.infiniteLevels = data.infiniteLevels;
		this.highlightColor = data.highlightColor;
		this.basicInstructions = data.basicInstructions;
		this.advancedInstructions = data.advancedInstructions;
		this.calcUrl = data.calcUrl;
		this.productionTypes = data.productionTypes.map((o: any) => ({ id: o.id, name: o.name, fieldColor: o.fieldColor, urlToIcon: o.urlToIcon, maxElements: o.maxElements }));
		this.maps = data.maps.map((o: any) => ({ id: o.id, name: o.name, gradient: convertGradient(o.gradient), customColorId: o.customColorId, gameBoardType: convertGameBoardType(o.gameBoardType), productionTypes: o.productionTypes, urlToData: o.urlToData }));
		this.customColors = data.customColors;
		this.basicInstructionsImageUrl = data.basicInstructionsImageUrl;
		this.advancedInstructionsImageUrl = data.advancedInstructionsImageUrl;

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
			translation["basic_instructions"] = this.basicInstructions[lang];
			translation["advanced_instructions"] = this.advancedInstructions[lang];
			translation["title"] = data.title[lang];
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