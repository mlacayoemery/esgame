import { GameBoardType } from "./game-board-type";
import data from './../../../data.json';
import { DefaultGradients } from "../helpers/gradients";

type LanguageString = Record<string, string>;

export class Settings {
	constructor() {
		this.elementSize = data.elementSize;
		this.gameBoardColumns = data.gameBoardColumns;
		this.gameBoardRows = data.gameBoardRows;
		this.imageMode = data.imageMode;
		this.mode = data.mapMode == "svg" ? 'SVG' : 'GRID';
		this.infiniteLevels = data.infiniteLevels;
		this.productionTypes = data.productionTypes.map((o) => ({ id: o.id, name: o.name, fieldColor: o.fieldColor, image: o.image, maxElements: o.maxElements }));
		this.maps = data.maps.map((o) => ({ id: o.id, name: o.name, gradient: convertGradient(o.gradient), gameBoardType: convertGameBoardType(o.gameBoardtype), linkedToProductionTypes: o.linkedToProductionTypes, urlToData: o.linkToData }));
		this.levels = data.levels.map((o) => ({ id: o.id, name: o.name, maps: o.maps, instructions: o.instructions }));
	}

	elementSize: number;
	gameBoardColumns: number;
	gameBoardRows: number;
	imageMode: boolean;
	mode: 'GRID' | 'SVG';
	infiniteLevels: boolean;
	productionTypes: { id: string, name: LanguageString, fieldColor: string, image: string, maxElements: number}[] = [];
	maps: { id: string, name: LanguageString, gradient: DefaultGradients, gameBoardType: GameBoardType, linkedToProductionTypes: string[], urlToData: string }[] = []; 
	levels: { id: string, name: LanguageString, maps: string[], instructions: LanguageString }[] = [];
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