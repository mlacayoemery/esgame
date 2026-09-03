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
	/** From settings.imageMode: draw each placed piece's production icon, as the grid board does. */
	imageMode = false;
	/** settings.elementSize — a piece is this many cells square. */
	elementSize = 1;
	/**
	 * One entry per placed piece: the production icon, positioned at the piece's top-left cell.
	 *
	 * The grid board renders `<img [src]="field.productionType?.image">` sized to the whole piece
	 * (grid-field.component.html), and this is the SVG board's equivalent — one image per PIECE,
	 * not one per cell, which a fill pattern could not do: a pattern tiles against the user
	 * coordinate system, so a piece anchored on an odd cell would show the icon sliced.
	 *
	 * The position is derived from the field id as a raster index, which holds only for a board
	 * numbered that way. That is not a hidden assumption: `imageMode` gates this, and a board
	 * asking for per-piece images is a board whose pieces are cells.
	 */
	pieceImages: { href: string, x: number, y: number, size: number }[] = [];
	/** One outline per piece, around its footprint. Empty on the board being played and on the
	 *  consequence maps, where the icon alone marks it. */
	pieceOutlines: { x: number, y: number, size: number, colour: string }[] = [];
	/**
	 * How this board outlines a placed cell — see SvgFieldComponent.assignedOutline.
	 *
	 * The playable board needs nothing: the piece is drawn there as its production icon. The maps
	 * beside it have no grid of their own, so a placed piece showed as a faint tint and was
	 * effectively invisible on the maps that say what it cost.
	 */

	private _showHideListeners: (() => void)[] = [];

	constructor(gameService: GameService, renderer: Renderer2, elementRef: ElementRef, cdRef: ChangeDetectorRef) {
		super(gameService, renderer, elementRef, cdRef);
		this.gameService.settingsObs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(s => {
			this.consequenceFieldOpacity = s?.visualOptions?.consequenceFieldOpacity ?? false;
			this.paletted = s?.paletted ?? false;
			this.imageMode = s?.imageMode ?? false;
			this.elementSize = s?.elementSize ?? 1;
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
			this.updatePieceImages();
			setTimeout(() => this.drawSelectedFields());
		});

		this.svgFieldComponents.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(_ => {
			setTimeout(() => this.drawSelectedFields());
		});
	}

	/** Recompute the per-piece icons. Cheap: one entry per placed piece, a handful in this game. */
	private updatePieceImages() {
		const width = this._boardData?.width ?? 0;
		// Every board, not only the playable one: the maps beside it are where a player reads what a
		// piece cost, and the piece itself is the clearest marker of where that cost was incurred.
		if (!this.imageMode || !width) {
			this.pieceImages = [];
			return;
		}
		// Outlined only on the suitability maps: the board being played has its own grid, and the
		// consequence maps are marked by the icon alone.
		const outlined = this.clickMode != GameBoardClickMode.Field
			&& this._boardData?.gameBoardType != GameBoardType.ConsequenceMap;

		const pieces = (this._selectedFields ?? []).flatMap(piece => {
			const icon = piece.productionType?.image;
			// The anchor is the piece's top-left cell, which is its lowest id — ids run along rows.
			const anchor = Math.min(...piece.fields.map((f: any) => f.id));
			if (!icon || !Number.isFinite(anchor)) return [];
			return [{ href: icon, x: anchor % width, y: Math.floor(anchor / width), size: this.elementSize }];
		});
		this.pieceImages = pieces;
		this.pieceOutlines = outlined
			? pieces.map(p => ({ x: p.x, y: p.y, size: p.size, colour: 'black' }))
			: [];
		this.cdRef.markForCheck();
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
