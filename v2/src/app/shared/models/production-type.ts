import { GameBoard } from "./game-board";

export class ProductionType {
	fieldColor: string;
	scoreMap: GameBoard;
	name: string;

	constructor(fieldColor: string, scoreMap: GameBoard, name: string) {
		this.fieldColor = fieldColor;
		this.scoreMap = scoreMap;
		this.name = name;
	}
}