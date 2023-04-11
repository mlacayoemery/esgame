import { Field } from "./field";
import { GameBoardType } from "./game-board-type";

export class GameBoard {
	fields: Field[];
	gameBoardType: GameBoardType;

	constructor(gameBoardType: GameBoardType, fields: Field[]) {
		this.fields = fields;
		this.gameBoardType = gameBoardType;
	}
}