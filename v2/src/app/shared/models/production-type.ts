import { GameBoard } from "./game-board";

export class ProductionType {
	fieldColor: string;
	scoreMap: GameBoard;
	name: string;
	image: string;
	maxElements: number;

	constructor(fieldColor: string, scoreMap: GameBoard, name: string, image = "", maxElements = 4) {
		this.fieldColor = fieldColor;
		this.scoreMap = scoreMap;
		this.name = name;
		this.image = image;
		this.maxElements = maxElements;
	}
}