import { SelectedField } from "./field";
import { GameBoard } from "./game-board";

export class Level {
	levelNumber: number;
	gameBoards: GameBoard[] = [];
	selectedFields: SelectedField[];
	isReadOnly = false;
	showConsequenceMaps = false;
}