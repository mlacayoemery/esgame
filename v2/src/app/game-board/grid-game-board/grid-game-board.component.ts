import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, QueryList, Renderer2, ViewChildren } from '@angular/core';
import { GameBoardComponent } from '../game-board.component';
import { GameService } from 'src/app/services/game.service';
import { FieldComponent } from 'src/app/field/field.component';
import { GameBoard } from 'src/app/shared/models/game-board';

@Component({
  selector: 'tro-grid-game-board',
  templateUrl: './grid-game-board.component.html',
  styleUrls: ['./grid-game-board.component.scss']
})
export class GridGameBoardComponent extends GameBoardComponent implements AfterViewInit {

	override set boardData(data: GameBoard | null) {
		super.boardData = data;
		this.setFieldColumns(this.settings.gameBoardColumns);
	} 

	@ViewChildren(FieldComponent) fieldComponents: QueryList<FieldComponent>;

	constructor(
		gameService: GameService,
		renderer: Renderer2,
		elementRef: ElementRef,
		cdRef: ChangeDetectorRef
	) {
		super(gameService, renderer, elementRef, cdRef);
		this._sink.sink = this.gameService.highlightFieldObs.subscribe(fieldNumbers => {
			this._highlightedFields.forEach(o => this.fieldComponents?.get(o.id)?.removeHighlight());
			this._highlightedFields = fieldNumbers;

			if (fieldNumbers.length > 0) {
				fieldNumbers.forEach(fieldNumber => {
					this.fieldComponents.get(fieldNumber.id)?.highlight(fieldNumber.side);
				});
			}
			this.cdRef.markForCheck();
		});
	}

	setFieldColumns(fieldColumns: number) {
		this.fieldColumns = `repeat(${fieldColumns}, 1fr)`;
	}

	ngAfterViewInit() {
		this._sink.sink = this.gameService.selectedFieldsObs.subscribe(fields => {
			this._selectedFields = fields;
			setTimeout(() => this.drawSelectedFields());
		});

		this._sink.sink = this.fieldComponents.changes.subscribe(r => {
			setTimeout(() => this.drawSelectedFields());
		});
	}

	private drawSelectedFields() {
		if (this.fields && this._selectedFields && this.fieldComponents) {
			this.fields.forEach(field => this.fieldComponents.get(field.id)?.unassign());
			this._selectedFields.forEach(field => {
				field.fields.forEach(highlightField => {
					this.fieldComponents.get(highlightField.id)?.assign(field.productionType, highlightField.side);
				});
				this.fieldComponents.get(field.fields[0].id)?.showProductionTypeImage();
			});
			this.cdRef.markForCheck();
		}
	}
}
