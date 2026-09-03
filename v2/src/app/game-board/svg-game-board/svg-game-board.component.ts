import { HostBinding, AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, QueryList, Renderer2, ViewChildren } from '@angular/core';
import { GameBoardBaseComponent } from '../game-board-base.component';
import { SvgFieldComponent } from 'src/app/field/svg-field/svg-field.component';
import { GameService } from 'src/app/services/game.service';
import { GameBoardType } from 'src/app/shared/models/game-board-type';
import { GameBoardClickMode } from 'src/app/shared/models/game-board';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
    selector: 'tro-svg-game-board',
    templateUrl: './svg-game-board.component.html',
    styleUrls: ['./svg-game-board.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class SvgGameBoardComponent extends GameBoardBaseComponent implements AfterViewInit {
	@ViewChildren(SvgFieldComponent) svgFieldComponents: QueryList<SvgFieldComponent>;
	background: string = "";
	background2: string = "";
	consequenceType = GameBoardType.ConsequenceMap;
	mapType: GameBoardType = GameBoardType.DrawingMap;
	/** From settings.visualOptions; gates the consequence-map opacity + overlay. Default off. */
	consequenceFieldOpacity = false;
	/**
	 * From settings.paletted. Draws the raster with nearest-neighbour scaling.
	 *
	 * A paletted board's raster is CLASSIFIED: one pixel per board cell, holding one of a handful
	 * of class values. Smoothing it invents colours that are not in the palette and blurs the cell
	 * boundaries the grid lines are drawn on, which is why the same map looked crisp on the static
	 * board and soft here — 28 x 29 pixels stretched to ~490 with interpolation.
	 *
	 * Deliberately NOT applied to every board. The Dutch model's consequence rasters are a
	 * continuous surface at 468 x 335, where interpolation is the correct way to scale and
	 * pixelating would be a downgrade.
	 */
	@HostBinding('class.is-paletted') paletted = false;
	private _showHideListeners: (() => void)[] = [];

	constructor(gameService: GameService, renderer: Renderer2, elementRef: ElementRef, cdRef: ChangeDetectorRef) {
		super(gameService, renderer, elementRef, cdRef);
		this.gameService.settingsObs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(s => {
			this.consequenceFieldOpacity = s?.visualOptions?.consequenceFieldOpacity ?? false;
			this.paletted = s?.paletted ?? false;
			this.cdRef.markForCheck();
		});
		this.gameService.highlightFieldObs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(fieldNumbers => {
			this._highlightedFields.forEach(o => this.svgFieldComponents?.find(s => s.field.id == o.id)?.removeHighlight());
			this._highlightedFields = fieldNumbers;

			if (fieldNumbers.length > 0) {
				fieldNumbers.forEach(fieldNumber => {
					this.svgFieldComponents.find(s => s.field.id == fieldNumber.id)?.highlight(fieldNumber.side);
				});
			}
			this.cdRef.markForCheck();
		});

		gameService.notSelectedFieldsObs.subscribe(_ => {
			if (this.svgFieldComponents) {
				// TODO: eventually add again
				// fields.forEach(field => this.svgFieldComponents.find(o => o.field.id == field.fields[0].id)?.addMissingHighlight());
				// setTimeout(() => fields.forEach(field => this.svgFieldComponents.find(o => o.field.id == field.fields[0].id)?.removeMissingHighlight()), 3000);
			}
		});
	}

	displayPatterns = 'inline';
	addShowHideListeners() {
		// _boardData may still be unset: the boardData setter ignores a null value, and
		// the main board binds it through an async pipe that starts null. Today the
		// clickMode check short-circuits before this is reached, but that makes the
		// component depend on the order the inputs happen to appear in the template.
		if (this.clickMode != GameBoardClickMode.SelectBoard || this._boardData?.gameBoardType == this.consequenceType || this.readOnly) {
			this._showHideListeners.forEach(o => o());
			this._showHideListeners = [];
			return;
		}
		this._showHideListeners.push(this.renderer.listen(this.elementRef.nativeElement, 'mouseenter', () => {
			this.displayPatterns = 'none';
			this.cdRef.markForCheck();
		}));
		this._showHideListeners.push(this.renderer.listen(this.elementRef.nativeElement, 'mouseleave', () => {
			this.displayPatterns = 'inline';
			this.cdRef.markForCheck();
		}));
	}

	ngAfterViewInit() {
		this.gameService.selectedFieldsObs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(fields => {
			this._selectedFields = fields;
			setTimeout(() => this.drawSelectedFields());
		});

		this.svgFieldComponents.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(_ => {
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
		this.mapType = this._boardData.gameBoardType;
		this.background = `url("${this._boardData.background}")`;
		this.background2 = `url("${this._boardData.background2}")`;
		this.addShowHideListeners();
	}

	@Input() override set readOnly(value: boolean) {
		this._readOnly = value !== false;
		this.addShowHideListeners();
	}

	override get readOnly() {
		return this._readOnly; // Keep that because otherwise it doesn't work since we're overriding the setter
	}

	getStrokeOpacity() {
		if (this.boardData?.gameBoardType == GameBoardType.ConsequenceMap) {
			return 0.5;
		}
		return 1;
	}

	getStrokeWidth() {
		if (this.boardData?.gameBoardType == GameBoardType.ConsequenceMap) {
			return 20;
		}

		return 8;
	}
}
