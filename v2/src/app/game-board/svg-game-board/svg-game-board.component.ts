import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostBinding, Input, QueryList, Renderer2, ViewChildren, ViewEncapsulation } from '@angular/core';
import { GameBoardBaseComponent } from '../game-board-base.component';
import { SvgFieldComponent } from 'src/app/field/svg-field/svg-field.component';
import { Field } from 'src/app/shared/models/field';
import { GameBoard } from 'src/app/shared/models/game-board';
import { GameService } from 'src/app/services/game.service';
import { debounce, interval } from 'rxjs';
import { GameBoardType } from 'src/app/shared/models/game-board-type';

@Component({
	selector: 'tro-svg-game-board',
	templateUrl: './svg-game-board.component.html',
	styleUrls: ['./svg-game-board.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class SvgGameBoardComponent extends GameBoardBaseComponent implements AfterViewInit {
	@ViewChildren(SvgFieldComponent) svgFieldComponents: QueryList<SvgFieldComponent>;
	background: string = "";
	background2: string = "";
	consequenceType = GameBoardType.ConsequenceMap;

	constructor(gameService: GameService, renderer: Renderer2, elementRef: ElementRef, cdRef: ChangeDetectorRef) {
		super(gameService, renderer, elementRef, cdRef);
		this._sink.sink = this.gameService.highlightFieldObs.subscribe(fieldNumbers => {
			this._highlightedFields.forEach(o => this.svgFieldComponents?.find(s => s.field.id == o.id)?.removeHighlight());
			this._highlightedFields = fieldNumbers;

			if (fieldNumbers.length > 0) {
				fieldNumbers.forEach(fieldNumber => {
					this.svgFieldComponents.find(s => s.field.id == fieldNumber.id)?.highlight(fieldNumber.side);
				});
			}
			this.cdRef.markForCheck();
		});

		gameService.notSelectedFieldsObs.subscribe(fields => {
			if (this.svgFieldComponents) {
				fields.forEach(field => this.svgFieldComponents.find(o => o.field.id == field.fields[0].id)?.addMissingHighlight());
				setTimeout(() => fields.forEach(field => this.svgFieldComponents.find(o => o.field.id == field.fields[0].id)?.removeMissingHighlight()), 3000);
			}
		});
	}

	ngAfterViewInit() {
		this._sink.sink = this.gameService.selectedFieldsObs.subscribe(fields => {
			this._selectedFields = fields;
			setTimeout(() => this.drawSelectedFields());
		});

		this._sink.sink = this.svgFieldComponents.changes.subscribe(r => {
			setTimeout(() => this.drawSelectedFields());
		});
	}

	protected drawSelectedFields() {
		if (this.fields && this._selectedFields && this.svgFieldComponents) {
			this.fields.forEach(field => this.svgFieldComponents.find(o => o.field.id == field.id)?.unassign());
			this._selectedFields.forEach(field => {
				field.fields.forEach(highlightField => {
					this.svgFieldComponents.find(o => o.field.id == highlightField.id)?.assign(field.productionType, highlightField.side);
				});
			});
			this.cdRef.markForCheck();
		}
	}

	override afterBoardDataSet(): void {
		this.background = `url("${this._boardData.background}")`;
		this.background2 = `url("${this._boardData.background2}")`;
	}
}
