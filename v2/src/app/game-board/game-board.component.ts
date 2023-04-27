import { AfterViewInit, Component, ElementRef, HostBinding, HostListener, Input, QueryList, Renderer2, ViewChildren } from '@angular/core';
import { GameService } from '../services/game.service';
import { Field } from '../shared/models/field';
import { GameBoard, GameBoardClickMode } from '../shared/models/game-board';
import { FieldComponent } from '../field/field.component';
import { Settings } from '../shared/models/settings';
import { map } from 'rxjs';
import { Legend } from '../shared/models/legend';

@Component({
	selector: 'tro-game-board',
	templateUrl: './game-board.component.html',
	styleUrls: ['./game-board.component.scss']
})
export class GameBoardComponent implements AfterViewInit {
	private _boardData: GameBoard;
	private _hideLegend = false;
	private _clickMode = GameBoardClickMode.Field;
	fields: Field[] = [];
	settings: Settings;
	legend: Legend;
	GameBoardClickMode = GameBoardClickMode;
	@Input() set clickMode(mode: GameBoardClickMode) {
		this._clickMode = mode;
		if (mode == GameBoardClickMode.SelectBoard) {
			this.addClickListener();
		}
	}
	get clickMode() { return this._clickMode; }
	@ViewChildren(FieldComponent) fieldComponents: QueryList<FieldComponent>;
	
	@HostBinding('style.grid-template-columns') fieldColumns: string;
	
	@Input()
	set boardData(data: GameBoard | null) {
		if (data) {
			this._boardData = data;
			this.fields = data.fields;
			this.legend = data.legend;
		}
	}

	get boardData() { return this._boardData; }

	@Input() set hideLegend(value: any) {
		if (value === false) this._hideLegend = false;
		else this._hideLegend = true;
	}

	get hideLegend() { return this._hideLegend; }

	constructor(private gameService: GameService, private renderer: Renderer2, private elementRef: ElementRef) {
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
				this.fieldComponents.get(field.fields[0].id)?.showProductionTypeImage();
			});
		});
	}

	private addClickListener() {
		this.renderer.listen(this.elementRef.nativeElement, 'click', () => {
			if (this.boardData) {
				this.gameService.selectGameBoard(this.boardData);
			}
		});
	}
}
