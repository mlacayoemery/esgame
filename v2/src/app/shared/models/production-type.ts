import { GameBoard } from "./game-board";

export class ProductionType {
	fieldColor: string;
	suitabilityMap: GameBoard;
	consequenceMaps: GameBoard[] = [];
	name: string;
	image: string;
	maxElements: number;
	id: number;

	constructor(id: number, fieldColor: string, scoreMap: GameBoard, name: string, image = "", maxElements = 200) {
		this.id = id;
		this.fieldColor = fieldColor;
		this.suitabilityMap = scoreMap;
		this.name = name;
		this.image = image;
		this.maxElements = maxElements;
	}

	getScore(ids: number[]) {
		let score = this.suitabilityMap.getScore(ids);
		let minusScore = this.consequenceMaps?.map(o => o.getScore(ids)).reduce((a, b) => a+b, 0) ?? 0;
		return score - minusScore;
	}
}