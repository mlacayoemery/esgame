import { GameBoard } from "./game-board";

export class ProductionType {
	fieldColor: string;
	scoreMap: GameBoard;
	name: string;
	image: string;

	constructor(fieldColor: string, scoreMap: GameBoard, name: string, image = "") {
		this.fieldColor = fieldColor;
		this.scoreMap = scoreMap;
		this.name = name;
		this.image = image;
	}
}