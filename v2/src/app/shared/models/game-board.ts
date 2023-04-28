import { Legend } from "./legend";
import { Field } from "./field";
import { GameBoardType } from "./game-board-type";

export class GameBoard {
	fields: Field[];
	gameBoardType: GameBoardType;
	legend: Legend;
	name: string;

	constructor(gameBoardType: GameBoardType, fields: Field[], legend: Legend, name: string) {
		this.fields = fields;
		this.gameBoardType = gameBoardType;
		this.legend = legend;
		this.name = name;
	}

	getScore(ids: number[]) {
		let scores = this.fields.filter(o => ids.some(p => o.id == p)).map(o => o.score);
		return scores.reduce((a, b) => a+b, 0);
	}
}

export enum GameBoardClickMode {
	Field = "FIELD",
	SelectBoard = "SELECTBOARD"
}