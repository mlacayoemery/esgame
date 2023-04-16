import { Component, HostBinding, HostListener, Input } from '@angular/core';
import { GameService } from '../services/game.service';
import { Field, HighlightSide } from '../shared/models/field';
import { ProductionType } from '../shared/models/production-type';

@Component({
  selector: 'tro-field',
  templateUrl: './field.component.html',
  styleUrls: ['./field.component.scss']
})
export class FieldComponent {
	private _field: Field;
	
	@HostBinding('style.width') private fieldWidth: string;
	@HostBinding('style.height') private fieldHeight: string;
	@HostBinding('style.background-color') private backgroundColor: string;
	@HostBinding('class.is-highlighted') isHighlighted = false;
	@HostBinding('class') highlightSide = HighlightSide.NONE;
	
	@Input() set field(field: Field) {
		this._field = field;
		this.setColor();
	}

	get field() { return this._field; }

	@Input() set size(size: number | null) {
		size = size ?? 10;
		this.fieldWidth = size + 'px';
		this.fieldHeight = size + 'px';
	}

	constructor(private gameService: GameService) {
	}

	@HostListener('mouseenter') // Testen, ob das nicht zu langsam wird, evtl. mit debounce?
	onEnter() {
	  	this.gameService.highlightOnOtherFields(this._field.id);
	}

	@HostListener('click')
	onClick() {
		if (this.field.assigned) this.gameService.deselectField(this.field.id);
		else this.gameService.selectField(this.field.id);
	}

	setColor() {
		if (this.field) {
			if (this.field.productionType) {
				this.backgroundColor = this.field.productionType.fieldColor;
			} else {
				this.backgroundColor = this.field.type.fieldColor;
			}
		}
	}

	highlight(side: HighlightSide) {
		this.isHighlighted = true;
		this.highlightSide = side;
	}

	removeHighlight() {
		this.isHighlighted = false;
		this.highlightSide = HighlightSide.NONE;
	}

	assign(productionType: ProductionType) {
		this.field.assigned = true;
		this.field.productionType = productionType;
		this.setColor();
	}

	unassign() {
		this.field.assigned = false;
		this.field.productionType = null;
		this.setColor();
	}
}
