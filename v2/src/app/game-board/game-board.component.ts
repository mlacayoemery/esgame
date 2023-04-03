import { Component, HostBinding, Input } from '@angular/core';
import { GameService } from '../services/game.service';
import { Field } from '../shared/models/field';
import { GameBoard } from '../shared/models/game-board';

@Component({
  selector: 'tro-game-board',
  templateUrl: './game-board.component.html',
  styleUrls: ['./game-board.component.scss']
})
export class GameBoardComponent {
	private _boardData: GameBoard;
	fields: Field[];

	@HostBinding('style.grid-template-columns') fieldColumns: string;

	@Input()
	set boardData(data: GameBoard) {
		this._boardData = data;
		this.fieldColumns = `repeat(${data.fieldColumns}, 1fr)`;
		this.fields = data.fields;
	}

	get boardData() { return this._boardData; }
	
	constructor(private gameService: GameService) {}
}
