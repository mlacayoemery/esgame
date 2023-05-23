import { Component, ElementRef, HostBinding, Input, Renderer2 } from '@angular/core';
import { GameService } from '../../services/game.service';
import { HighlightSide } from '../../shared/models/field';
import { ProductionType } from '../../shared/models/production-type';
import { FieldBaseComponent } from '../field-base.component';

@Component({
	selector: '[troSvgField]',
	templateUrl: './svg-field.component.html',
	styleUrls: ['./svg-field.component.scss']
})
export class SvgFieldComponent extends FieldBaseComponent {
	@HostBinding('class.is-overlay') _isOverlay: boolean = false;

	@HostBinding('style.fill') private fillColor: string;
	@HostBinding('style.stroke') private stroke: string;

	constructor(gameService: GameService, renderer: Renderer2, elementRef: ElementRef) {
		super(gameService, renderer, elementRef);
	}

	@Input() set isOverlay(isOverlay: boolean) {
		this._isOverlay = isOverlay;
		if(isOverlay) {
			this.addClickListener();
			this.addHoverListener()
		}
	}

	setColor() {
		if (this._field) {
			if (!this._isOverlay)
				this.fillColor = `#${this._field.type?.fieldColor}`;
		}
	}

	assign(productionType: ProductionType, side: HighlightSide) {
		this._field.assigned = this.isAssigned = true;
		this.setColor();
		this.gameService.removeHighlight();
	}

	unassign() {
		this._field.assigned = this.isAssigned = false;
		this._field.productionType = null;
		this.setColor();
	}
}