import { Component, ElementRef, HostBinding, Input, Renderer2 } from '@angular/core';
import { GameService } from '../services/game.service';
import { Field, HighlightSide } from '../shared/models/field';
import { ProductionType } from '../shared/models/production-type';

@Component({
	selector: '[troSvgField]',
	templateUrl: './svg-field.component.html',
	styleUrls: ['./svg-field.component.scss']
})
export class SvgFieldComponent {
	private _field: Field;
	_isOverlay: boolean = false;

	@HostBinding('class.--is-highlighted') isHighlighted = false;
	@HostBinding('class.--is-assigned') isAssigned = false;
	@HostBinding('style.fill') private fillColor: string;
	@HostBinding('style.stroke') private stroke: string;

	constructor(private gameService: GameService, private renderer: Renderer2, private elementRef: ElementRef) {
		
	}

	@Input() set field(field: Field) {
		this._field = field;
		this.setColor();
	}

	@Input() set isOverlay(isOverlay: boolean) {
		this._isOverlay = isOverlay;
		if(isOverlay) {
			this.addClickListener();
			this.addHoverListener()
		}
	}

	addClickListener() {
		this.renderer.listen(this.elementRef.nativeElement, 'click', () => {
			if (this._field.assigned) this.gameService.deselectField(this._field.id);
			else this.gameService.selectField(this._field.id);
		});
	}

	addHoverListener() {
		this.renderer.listen(this.elementRef.nativeElement, 'mouseenter', () => {
			this.gameService.highlightOnOtherFields(this._field.id);
		});
	}

	setColor() {
		if (this._field) {
			if (!this._isOverlay)
				this.fillColor = `rgba(255, 204, 203,  ${this._field.score})`;
			if (this._isOverlay)
				this.stroke = "rgba(0,0,0,0.0)";
		}
	}



	highlight(side: HighlightSide) {
		console.log("highlight");
		this.isHighlighted = true;
	}

	removeHighlight() {
		this.isHighlighted = false;
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