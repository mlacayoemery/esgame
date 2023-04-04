import { AfterViewInit, Component, HostBinding, HostListener, Input, QueryList, ViewChildren } from '@angular/core';
import { GameService } from '../services/game.service';
import { Field } from '../shared/models/field';
import { GameBoard } from '../shared/models/game-board';
import { FieldComponent } from '../field/field.component';

@Component({
  selector: 'tro-game-board',
  templateUrl: './game-board.component.html',
  styleUrls: ['./game-board.component.scss']
})
export class GameBoardComponent implements AfterViewInit {
	private _boardData: GameBoard;
	fields: Field[];
	@ViewChildren(FieldComponent) fieldComponents: QueryList<FieldComponent>;

	@HostBinding('style.grid-template-columns') fieldColumns: string;

	@Input()
	set boardData(data: GameBoard) {
		this._boardData = data;
		this.fieldColumns = `repeat(${data.fieldColumns}, 1fr)`;
		this.fields = data.fields;
	}

	get boardData() { return this._boardData; }
	
	constructor(private gameService: GameService) {}

	@HostListener('mouseleave')
	onLeave() {
	  	this.gameService.removeHighlight();
	}

	ngAfterViewInit() {
        this.gameService.highlightFieldObs.subscribe(fieldNumber => {
			this.fieldComponents.forEach(o => o.removeHighlight());
            
			if (fieldNumber != null) {
                this.fieldComponents.get(fieldNumber)?.highlight();
            }
        })
    }
}
