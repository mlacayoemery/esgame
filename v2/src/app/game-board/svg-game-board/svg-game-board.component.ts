import { ChangeDetectorRef, Component, ElementRef, Input, QueryList, Renderer2, ViewChildren } from '@angular/core';
import { GameBoardBaseComponent } from '../game-board-base.component';
import { SvgFieldComponent } from 'src/app/field/svg-field/svg-field.component';
import { Field } from 'src/app/shared/models/field';
import { GameBoard } from 'src/app/shared/models/game-board';
import { GameService } from 'src/app/services/game.service';

@Component({
  selector: 'tro-svg-game-board',
  templateUrl: './svg-game-board.component.html',
  styleUrls: ['./svg-game-board.component.scss']
})
export class SvgGameBoardComponent extends GameBoardBaseComponent {
	@ViewChildren(SvgFieldComponent) svgFieldComponents: QueryList<SvgFieldComponent>;


  constructor(gameService: GameService, renderer: Renderer2, elementRef: ElementRef, cdRef: ChangeDetectorRef) {
    super(gameService, renderer, elementRef, cdRef);
    this._sink.sink = this.gameService.highlightFieldObs.subscribe(fieldNumbers => {
			this._highlightedFields.forEach(o => this.svgFieldComponents?.filter(s => s._isOverlay)?.find(s => s.field.id == o.id)?.removeHighlight());
			this._highlightedFields = fieldNumbers;

			if (fieldNumbers.length > 0) {
				fieldNumbers.forEach(fieldNumber => {
					this.svgFieldComponents.filter(s => s._isOverlay)?.find(s => s.field.id == fieldNumber.id)?.highlight(fieldNumber.side);
				});
			}
			this.cdRef.markForCheck();
		});
  }

  @Input() 
	set overlay(overlay: GameBoard | null | undefined) {
		this.overlayFields = overlay?.fields ?? [];
	}
  overlayFields: Field[] = [];
}
