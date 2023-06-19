import { ChangeDetectionStrategy, Component, ElementRef, HostBinding, Input, OnInit, Renderer2 } from '@angular/core';
import { GameService } from '../../services/game.service';
import { HighlightSide } from '../../shared/models/field';
import { ProductionType } from '../../shared/models/production-type';
import { FieldBaseComponent } from '../field-base.component';

@Component({
	selector: '[troSvgField]',
	templateUrl: './svg-field.component.html',
	styleUrls: ['./svg-field.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class SvgFieldComponent extends FieldBaseComponent implements OnInit {
	override shouldSelect(e: MouseEvent): boolean {
		return e.buttons == 1 || e.altKey
	}
	override shouldDeselect(e: MouseEvent): boolean {
		return e.buttons == 2 || e.ctrlKey
	}
	@HostBinding('style.fill') private fillColor: string;
	@HostBinding('style.stroke') private stroke: string;
	highlightColor: string;

	@HostBinding('class.show-stroke') @Input() showStroke: boolean = true;

	ngOnInit(): void {
		this.gameService.settingsObs.subscribe(o => {
			this.highlightColor = o.highlightColor;
		});
	}

	setColor(productionType: ProductionType | null = null) {
		if (!this._field) return;
		if (productionType && this.clickable) {
			this.fillColor = `${productionType.fieldColor}`;
		} else if(productionType) {
			this.fillColor = `url(#pattern_${productionType.id})`;
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
		if (this.field.editable == false) return;
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