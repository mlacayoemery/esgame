import { Component } from '@angular/core';
import { LevelBaseComponent } from '../level-base.component';
import { GameService } from 'src/app/services/game.service';

@Component({
	selector: 'tro-svg-level',
	templateUrl: './svg-level.component.html',
	styleUrls: ['./svg-level.component.scss', '../level-base.component.scss']
})
export class SvgLevelComponent extends LevelBaseComponent {

	constructor(gameService: GameService) {
		super(gameService);
		gameService.initialiseSVGMode();
	}
}
