import { Component, HostBinding, Input } from '@angular/core';
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
	
	@Input() set field(field: Field) {
		this._field = field;
	}

	get field() { return this._field; }

	@Input() set size(size: number) {
		this.fieldWidth = size + 'px';
		this.fieldHeight = size + 'px';
	}

	constructor(private gameService: GameService) {
	}

	highlight() {
	}

	removeHighlight() {
	}

	assign() {
		this.field.assigned = true;
	}

	unassign() {
		this.field.assigned = false;
	}
}
