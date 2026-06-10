import { ChangeDetectionStrategy, Component, HostBinding, Input, OnInit, RendererStyleFlags2 } from '@angular/core';
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
	highlightColor: string;

	@HostBinding('class.show-stroke') @Input() showStroke: boolean = true;

	@Input() gameBoardId = '';

	/** When true, placed fields are rendered semi-transparent (used for consequence maps). */
	@Input() hasOpacity = false;

	ngOnInit(): void {
		this.gameService.settingsObs.subscribe(o => {
			this.highlightColor = o.highlightColor;
			// Optional per-deployment cell-border (grid line) styling; CSS falls back to the default.
			if (o.gridLineColor) this.renderer.setStyle(this.elementRef.nativeElement, '--cell-stroke', o.gridLineColor, RendererStyleFlags2.DashCase);
			if (o.gridLineWidth) this.renderer.setStyle(this.elementRef.nativeElement, '--cell-stroke-width', o.gridLineWidth, RendererStyleFlags2.DashCase);
			if (o.highlightWidth) this.renderer.setStyle(this.elementRef.nativeElement, '--highlight-stroke-width', o.highlightWidth, RendererStyleFlags2.DashCase);
		});
	}

	setColor(productionType: ProductionType | null = null) {
		if (!this._field) return;
		if (productionType && this.clickable) {
			this.fillColor = `${productionType.fieldColor}${this.hasOpacity ? '7D' : ''}`;
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
