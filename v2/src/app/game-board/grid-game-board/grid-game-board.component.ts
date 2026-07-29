import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, QueryList, Renderer2, ViewChildren } from '@angular/core';
import { GameBoardBaseComponent } from '../game-board-base.component';
import { GameService } from 'src/app/services/game.service';
import { GameBoard } from 'src/app/shared/models/game-board';
import { GridFieldComponent } from 'src/app/field/grid-field/grid-field.component';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
    selector: 'tro-grid-game-board',
    templateUrl: './grid-game-board.component.html',
    styleUrls: ['./grid-game-board.component.scss'],
    standalone: false
})
export class GridGameBoardComponent extends GameBoardBaseComponent implements AfterViewInit {

	override set boardData(data: GameBoard | null) {
		super.boardData = data;
		this.setFieldColumns(this.settings.gameBoardColumns);
	}

	@ViewChildren(GridFieldComponent) fieldComponents: QueryList<GridFieldComponent>;

	constructor(
		gameService: GameService,
		renderer: Renderer2,
		elementRef: ElementRef,
		cdRef: ChangeDetectorRef
		) {
			super(gameService, renderer, elementRef, cdRef);
			this.gameService.highlightFieldObs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(fieldNumbers => {
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
			this.gameService.selectedFieldsObs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(fields => {
				this._selectedFields = fields;
				setTimeout(() => this.drawSelectedFields());
			});

			this.fieldComponents.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(_ => {
				setTimeout(() => this.drawSelectedFields());
			});
		}

		protected drawSelectedFields() {
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

		override afterBoardDataSet(): void {

		}
	}
