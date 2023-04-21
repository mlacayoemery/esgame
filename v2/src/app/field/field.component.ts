import { Component, HostBinding, HostListener, Input } from '@angular/core';
import { map } from 'rxjs';
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

	@Input() set field(field: Field) {
		this._field = field;
		this.setColor();
	}

	get field() { return this._field; }

	private _size: number;

	@HostBinding('style.width') private fieldWidth: string;
	@HostBinding('style.height') private fieldHeight: string;
	@HostBinding('style.background-color') private backgroundColor: string;
	@HostBinding('class.--is-highlighted') isHighlighted = false;
	@HostBinding('class') highlightSide = HighlightSide.NONE;
	@HostBinding('class.--has-image') showProductionImage = false;
	@HostBinding('class.--is-assigned') isAssigned = false;

	imageSize = 0;
	imageMode = false;

	@Input() set size(size: number | null) {
		size = size ?? 10;
		this._size = size;
		this.fieldWidth = size + 'px';
		this.fieldHeight = size + 'px';
	}

	constructor(private gameService: GameService) {
		this.gameService.settingsObs.subscribe(settings => {
			this.imageMode = settings.imageMode;
		});
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
	}

	assign(productionType: ProductionType, side: HighlightSide) {
		this.field.assigned = this.isAssigned = true;
		this.field.productionType = productionType;
		this.highlightSide = side;
		console.log(this.field.id, side);
		if (this.imageMode == false) {
			this.setColor();
		}
		this.gameService.removeHighlight();
	}

	unassign() {
		this.field.assigned = this.isAssigned = false;
		this.field.productionType = null;
		this.showProductionImage = false;
		this.highlightSide = HighlightSide.NONE;
		if (this.imageMode == false) {
			this.setColor();
		}
	}

	showProductionTypeImage(size: number) {
		this.showProductionImage = true;
		this.imageSize = size * this._size;
	}
}
