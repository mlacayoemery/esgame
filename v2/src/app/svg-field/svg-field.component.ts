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

	@HostBinding('class.--is-highlighted') isHighlighted = false;
	@HostBinding('class.--is-assigned') isAssigned = false;
	@HostBinding('style.fill') private fillColor: string;

	constructor(private gameService: GameService, private renderer: Renderer2, private elementRef: ElementRef) {
		this.addClickListener();
		this.addHoverListener();
	}

	@Input() set field(field: Field) {
		this._field = field;
		this.setColor();
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
		console.log(this._field);
		if (this._field) {
			this.fillColor = `rgba(${this._field.score}, ${this._field.score}, ${this._field.score}, 1)`;
		}
	}

	highlight(side: HighlightSide) {
		console.log('highlight', side);
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
