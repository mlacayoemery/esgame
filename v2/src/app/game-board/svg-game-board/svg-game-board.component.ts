import { Component, QueryList, ViewChildren } from '@angular/core';
import { SvgFieldComponent } from 'src/app/svg-field/svg-field.component';
import { GameBoardComponent } from '../game-board.component';

@Component({
  selector: 'tro-svg-game-board',
  templateUrl: './svg-game-board.component.html',
  styleUrls: ['./svg-game-board.component.scss']
})
export class SvgGameBoardComponent extends GameBoardComponent {
	@ViewChildren(SvgFieldComponent) svgFieldComponents: QueryList<SvgFieldComponent>;
}
