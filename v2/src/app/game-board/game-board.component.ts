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
			this.settings = settings;
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
		this.gameService.highlightFieldObs.subscribe(fieldNumbers => {
			this.fieldComponents.forEach(o => o.removeHighlight());

			if (fieldNumbers.length > 0) {
				fieldNumbers.forEach(fieldNumber => {
					this.fieldComponents.get(fieldNumber.id)?.highlight(fieldNumber.side);
				});
			}
		});

		this.gameService.selectedFieldsObs.subscribe(fields => {
			this.fields.forEach(field => this.fieldComponents.get(field.id)?.unassign());
			fields.forEach(field => {
				field.fields.forEach(highlightField => {
					this.fieldComponents.get(highlightField.id)?.assign(field.productionType, highlightField.side);
				});
				this.fieldComponents.get(field.fields[0].id)?.showProductionTypeImage(this.settings.elementSize);
			});
		});
	}
}
