import { GameBoard } from "./game-board";

export class ProductionType {
	fieldColor: string;
	suitabilityMap: GameBoard;
	consequenceMaps: GameBoard[] = [];
	name: string;
	image: string;
	maxElements: number;

	constructor(fieldColor: string, scoreMap: GameBoard, name: string, image = "", maxElements = 4) {
		this.fieldColor = fieldColor;
		this.suitabilityMap = scoreMap;
		this.name = name;
		this.image = image;
		this.maxElements = maxElements;
	}
}