import { Component, Input, QueryList, ViewChildren } from '@angular/core';
import { GameBoardBaseComponent } from '../game-board-base.component';
import { SvgFieldComponent } from 'src/app/field/svg-field/svg-field.component';
import { Field } from 'src/app/shared/models/field';
import { GameBoard } from 'src/app/shared/models/game-board';

@Component({
  selector: 'tro-svg-game-board',
  templateUrl: './svg-game-board.component.html',
  styleUrls: ['./svg-game-board.component.scss']
})
export class SvgGameBoardComponent extends GameBoardBaseComponent {
	@ViewChildren(SvgFieldComponent) svgFieldComponents: QueryList<SvgFieldComponent>;

  @Input() 
	set overlay(overlay: GameBoard | null | undefined) {
		this.overlayFields = overlay?.fields ?? [];
	}
  overlayFields: Field[] = [];
}
