import { Component } from '@angular/core';
import { LevelBaseComponent } from '../level-base.component';
import { GameService } from 'src/app/services/game.service';
import { map } from 'rxjs';
import { GameBoardType } from 'src/app/shared/models/game-board-type';

@Component({
	selector: 'tro-svg-level',
	templateUrl: './svg-level.component.html',
	styleUrls: ['../level-base.component.scss', './svg-level.component.scss']
})
export class SvgLevelComponent extends LevelBaseComponent {
	overlayBoard = this.gameService.currentLevelObs.pipe(map(o => o?.gameBoards), map(o => o?.find(p => p.gameBoardType == GameBoardType.DrawingMap)));

	constructor(gameService: GameService) {
		super(gameService);
		gameService.initialiseSVGMode();
	}
}
