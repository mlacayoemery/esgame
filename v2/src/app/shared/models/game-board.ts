import { Legend } from "./legend";
import { Field } from "./field";
import { GameBoardType } from "./game-board-type";

export class GameBoard {
	fields: Field[];
	gameBoardType: GameBoardType;
	legend: Legend;
	name: string;
	isSvg: boolean;
	width: number;
	height: number;
	background: string;

	constructor(gameBoardType: GameBoardType, fields: Field[], legend: Legend, name: string, isSvg = false, width = 0, height = 0, background = "") {
		this.fields = fields;
		this.gameBoardType = gameBoardType;
		this.legend = legend;
		this.name = name;
		this.isSvg = isSvg;
		this.width = width;
		this.height = height;
		this.background = background;
	}

	getScore(ids: number[]) {
		let scores = this.fields.filter(o => ids.some(p => o.id == p)).map(o => o.score);
		return scores.reduce((a, b) => a+b, 0);
	}
}

export enum GameBoardClickMode {
	Field = "FIELD",
	SelectBoard = "SELECTBOARD",
}