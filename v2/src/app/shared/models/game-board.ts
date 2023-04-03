import { Field } from "./field";
import { GameBoardType } from "./game-board-type";

export class GameBoard {
	fields: Field[];
	fieldColumns: number;
	gameBoardType: GameBoardType;

	constructor(gameBoardType: GameBoardType, fields: Field[], fieldColumns: number) {
		this.fields = fields;
		this.gameBoardType = gameBoardType;
		this.fieldColumns = fieldColumns;
	}
}