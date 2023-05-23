import { GameService } from "src/app/services/game.service";
import { Field, HighlightSide } from "./field";
import { ProductionType } from "./production-type";
import { Component, ElementRef, HostBinding, Input, OnInit, Renderer2 } from '@angular/core';

@Component({
  template: '',
})
export abstract class FieldBaseComponent {
    @HostBinding('class.--is-highlighted') public isHighlighted = false;
	@HostBinding('class.--is-assigned') public isAssigned = false;
    protected _field: Field;

    constructor(private gameService: GameService, private renderer: Renderer2, private elementRef: ElementRef) {}

    @Input() set field(field: Field) {
		this._field = field;
		this.setColor();
	}

    abstract addClickListener(): void;

    abstract addHoverListener(): void;

    abstract setColor(): void;

    abstract highlight(side: HighlightSide): void;

    abstract removeHighlight(): void;

    abstract assign(productionType: ProductionType, side: HighlightSide): void;

    abstract unassign(): void;

}