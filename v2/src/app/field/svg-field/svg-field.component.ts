import { ChangeDetectionStrategy, Component, HostBinding, Input, OnInit, RendererStyleFlags2 } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HighlightSide } from '../../shared/models/field';
import { ProductionType } from '../../shared/models/production-type';
import { FieldBaseComponent } from '../field-base.component';

@Component({
    selector: '[troSvgField]',
    template: '',
    styleUrls: ['./svg-field.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class SvgFieldComponent extends FieldBaseComponent implements OnInit {
	override shouldSelect(e: MouseEvent): boolean {
		return e.buttons == 1 || e.shiftKey
	}
	override shouldDeselect(e: MouseEvent): boolean {
		return e.buttons == 2 || e.ctrlKey
	}
	@HostBinding('style.fill') fillColor: string;
	@HostBinding('style.stroke') stroke: string;
	@HostBinding('style.stroke-width') strokeWidth: string;
	highlightColor: string;

	@HostBinding('class.show-stroke') @Input() showStroke: boolean = true;

	@Input() gameBoardId = '';


	/** When true, placed fields are rendered semi-transparent (used for consequence maps). */
	@Input() hasOpacity = false;
	/** From settings.imageMode: the piece is drawn as its production icon, so the fill stays clear. */
	private imageMode = false;

	ngOnInit(): void {
		this.gameService.settingsObs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(o => {
			this.highlightColor = o.highlightColor;
			this.imageMode = o.imageMode ?? false;
			// A paletted board is the grid board drawn as SVG, and the grid board's cell border is
			// `outline: 1px solid black` — ONE SCREEN PIXEL, whatever the board's size. An SVG
			// stroke is in board units, so the same nominal width renders differently on every
			// board and at every zoom: measured 0.05 units x 17.24 px/unit = 0.86 px here against
			// the grid board's flat 1 px. non-scaling-stroke takes the stroke out of the user
			// coordinate system so the width means screen pixels, as a CSS outline does.
			//
			// Scoped to paletted boards. The Dutch board's strokes are tuned in board units at its
			// own scale and changing what they mean would resize every line on it.
			// Set only when asked for, like the three above: the spec pins that a settings object
			// omitting these leaves the stylesheet's own defaults in place.
			if (o.paletted) {
				this.renderer.setStyle(this.elementRef.nativeElement, 'vector-effect', 'non-scaling-stroke');
			}
			// Optional per-deployment cell-border (grid line) styling; CSS falls back to the default.
			if (o.gridLineColor) this.renderer.setStyle(this.elementRef.nativeElement, '--cell-stroke', o.gridLineColor, RendererStyleFlags2.DashCase);
			if (o.gridLineWidth) this.renderer.setStyle(this.elementRef.nativeElement, '--cell-stroke-width', o.gridLineWidth, RendererStyleFlags2.DashCase);
			if (o.highlightWidth) this.renderer.setStyle(this.elementRef.nativeElement, '--highlight-stroke-width', o.highlightWidth, RendererStyleFlags2.DashCase);
		});
	}

	/**
	 * Apply the consequence-map alpha to a deployment-supplied colour.
	 *
	 * This used to be `fieldColor + '7D'`, which only works for exactly `#RRGGBB`. CSS hex
	 * colours are 3, 4, 6 or 8 digits, so concatenation produces an invalid one for the other
	 * forms and the browser drops the declaration — the field renders with no fill at all.
	 * Measured, and both broken forms are in this repository's own data files:
	 *
	 *   #40916c   + 7D = #40916c7D     rgba(64, 145, 108, 0.49)   data.json
	 *   #FFF      + 7D = #FFF7D        REJECTED                   dataGridExample.json
	 *   #b2b2b2c0 + 7D = #b2b2b2c07D   REJECTED                   data.json customColors
	 *
	 * So expand shorthand and replace any alpha already there, rather than appending to it.
	 * Anything that is not a hex colour is returned untouched: named colours and rgb() are valid
	 * CSS the game may legitimately be given, and mangling them would be worse than not applying
	 * the alpha.
	 */
	private withConsequenceAlpha(color: string): string {
		const m = /^#([0-9a-fA-F]{3,8})$/.exec(color?.trim() ?? '');
		if (!m) return color;
		let hex = m[1];
		if (hex.length === 3 || hex.length === 4) hex = hex.split('').map(c => c + c).join('');
		if (hex.length !== 6 && hex.length !== 8) return color;   // 5 or 7 digits: not a colour
		return `#${hex.slice(0, 6)}7D`;
	}

	setColor(productionType: ProductionType | null = null) {
		if (!this._field) return;
		// imageMode boards show the piece as its production ICON, drawn over the cell by the board
		// (SvgGameBoardComponent.pieceImages) exactly as the grid board does. The fill stays
		// transparent so the map underneath still reads — a solid one hid the very land the player
		// is choosing between.
		if (productionType && this.imageMode) {
			// EVERY board, not only the clickable one. A secondary map fell through to the hatch
			// pattern below and filled the piece on maps that are there to be read through.
			this.fillColor = "";
		} else if (productionType && this.clickable) {
			this.fillColor = this.hasOpacity
				? this.withConsequenceAlpha(productionType.fieldColor)
				: productionType.fieldColor;
		} else if(productionType) {
			this.fillColor = `url(#pattern_${productionType.id}_${this.gameBoardId})`;
		} else {
			this.fillColor = "";
		}
	}

	override highlight(side: HighlightSide): void {
		super.highlight(side);
		this.stroke = this.highlightColor;
	}

	override removeHighlight(): void {
		super.removeHighlight();
		this.stroke = '';
	}

	assign(productionType: ProductionType, side: HighlightSide) {
		if (!this.field.editable) return;
		this._field.assigned = this.isAssigned = true;
		this.setColor(productionType);
		this.gameService.removeHighlight();
	}

	unassign() {
		this._field.assigned = this.isAssigned = false;
		this._field.productionType = null;
		this.setColor();
	}

}
