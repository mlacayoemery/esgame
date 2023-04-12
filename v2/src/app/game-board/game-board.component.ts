import { AfterViewInit, Component, HostBinding, HostListener, Input, QueryList, ViewChildren } from '@angular/core';
import { GameService } from '../services/game.service';
import { Field } from '../shared/models/field';
import { GameBoard } from '../shared/models/game-board';
import { FieldComponent } from '../field/field.component';
import { Settings } from '../shared/models/settings';
import { map } from 'rxjs';

@Component({
  selector: 'tro-game-board',
  templateUrl: './game-board.component.html',
  styleUrls: ['./game-board.component.scss']
})
export class GameBoardComponent implements AfterViewInit {
	private _boardData: GameBoard;
	fields: Field[];
	fieldSize = this.gameService.settingsObs.pipe(map(o => o.fieldSize));
	settings: Settings;
	@ViewChildren(FieldComponent) fieldComponents: QueryList<FieldComponent>;

	@HostBinding('style.grid-template-columns') fieldColumns: string;

	@Input()
	set boardData(data: GameBoard) {
		this._boardData = data;
		this.fields = data.fields;
	}

	get boardData() { return this._boardData; }
	
	constructor(private gameService: GameService) {
		this.gameService.settingsObs.subscribe(settings => {
			this.setFieldColumns(settings.gameBoardColumns);
		});
	}

	@HostListener('mouseleave')
	onLeave() {
	  	this.gameService.removeHighlight();
	}

	setFieldColumns(fieldColumns: number) {
		this.fieldColumns = `repeat(${fieldColumns}, 1fr)`;
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
