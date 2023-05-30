import { ChangeDetectionStrategy, Component, ElementRef, HostBinding, Input, Renderer2 } from '@angular/core';
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
export class SvgFieldComponent extends FieldBaseComponent {
	@HostBinding('class.is-overlay') _isOverlay: boolean = false;

	@HostBinding('style.fill') private fillColor: string;
	@HostBinding('style.stroke') private stroke: string;

	@Input() set isOverlay(isOverlay: boolean) {
		this._isOverlay = isOverlay;
	}

	setColor(productionType: ProductionType | null = null) {
		if (!this._field) return;


		if (productionType && this._isOverlay) {
			this.fillColor = `${productionType.fieldColor}`;
		} else if(!this._isOverlay) {
			this.fillColor = `#${this._field.type?.fieldColor}`;
		} else if(this._isOverlay) {
			this.fillColor = `transparent`;
		}
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