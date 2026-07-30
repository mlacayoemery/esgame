import { GameBoard } from "./game-board";

export class ProductionType {
	fieldColor: string;
	suitabilityMap: GameBoard;
	consequenceMaps: GameBoard[] = [];
	image: string;
	maxElements: number;
	id: number;

	constructor(id: number, fieldColor: string, scoreMap: GameBoard, image : string, maxElements : number) {
		this.id = id;
		this.fieldColor = fieldColor;
		this.suitabilityMap = scoreMap;
		this.image = image;
		this.maxElements = maxElements;
	}

	// getScore() was here: suitability minus the sum of the consequence maps. Nothing called it.
	//
	// Worth a note rather than a silent deletion, because it read like the authoritative scoring
	// rule and it is not even the right shape. The rule actually in force is in
	// SelectedField.updateScore, which records the suitability score and EACH consequence
	// separately (negated), and ScoreService.calculateScore, which then sums per map id across
	// fields. That per-indicator breakdown is what the score board renders; collapsing it to one
	// number, as this did, would not have served any caller.
}