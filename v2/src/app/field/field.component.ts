import { Component, HostBinding, HostListener, Input } from '@angular/core';
import { GameService } from '../services/game.service';
import { Field } from '../shared/models/field';

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

	setColor() {
		if (this.field) {
			if (this._field.productionType) {
				this.backgroundColor = this._field.productionType.fieldColor;
			} else {
				this.backgroundColor = this._field.type.fieldColor;
			}
		}
	}

	highlight() {
		this.isHighlighted = true;
	}

	removeHighlight() {
		this.isHighlighted = false;
	}

	assign() {
		this.field.assigned = true;
	}

	unassign() {
		this.field.assigned = false;
	}
}
