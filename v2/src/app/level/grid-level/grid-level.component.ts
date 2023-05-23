import { Component } from '@angular/core';
import { LevelBaseComponent } from '../level-base.component';
import { GameService } from 'src/app/services/game.service';

@Component({
	selector: 'tro-grid-level',
	templateUrl: './grid-level.component.html',
	styleUrls: ['./grid-level.component.scss', '../level-base.component.scss']
})
export class GridLevelComponent extends LevelBaseComponent {
	constructor(gameService: GameService) {
		super(gameService);
		gameService.initialiseGridMode();
	}
}
