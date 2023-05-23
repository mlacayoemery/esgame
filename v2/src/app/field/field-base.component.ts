import { GameService } from "src/app/services/game.service";
import { Field, HighlightSide } from "../shared/models/field";
import { ProductionType } from "../shared/models/production-type";
import { Component, ElementRef, HostBinding, Input, OnInit, Renderer2 } from '@angular/core';

@Component({
  template: '',
})
export abstract class FieldBaseComponent {
  @HostBinding('class.--is-highlighted') public isHighlighted = false;
  @HostBinding('class.--is-assigned') public isAssigned = false;
  protected _field: Field;

  constructor(protected gameService: GameService, protected renderer: Renderer2, protected elementRef: ElementRef) { }

  @Input() set field(field: Field) {
    this._field = field;
    this.setColor();
  }

  get field(): Field {
    return this._field;
  }

  abstract addClickListener(): void;

  abstract addHoverListener(): void;

  abstract setColor(): void;

  abstract highlight(side: HighlightSide): void;

  abstract removeHighlight(): void;

  abstract assign(productionType: ProductionType, side: HighlightSide): void;

  abstract unassign(): void;

}