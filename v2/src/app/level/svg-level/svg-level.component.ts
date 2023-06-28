import { Component } from '@angular/core';
import { LevelBaseComponent } from '../level-base.component';
import { GameService } from 'src/app/services/game.service';
import { map, timeout } from 'rxjs';
import { GameBoardType } from 'src/app/shared/models/game-board-type';

@Component({
	selector: 'tro-svg-level',
	templateUrl: './svg-level.component.html',
	styleUrls: ['../level-base.component.scss', './svg-level.component.scss']
})
export class SvgLevelComponent extends LevelBaseComponent {
	overlayBoard = this.gameService.currentLevelObs.pipe(map(o => o?.gameBoards), map(o => o?.find(p => p.gameBoardType == GameBoardType.DrawingMap)));
	settings = this.gameService.settingsObs;
	imageExpand = false

	constructor(gameService: GameService) {
		super(gameService);
		gameService.initialiseSVGMode();
	}

	override nextLevel() {
		if (this.gameService.checkIfAllFieldsAreSelected()) {
			super.nextLevel();
		} else {
			// TODO: Show error message
			super.nextLevel();
		}
	}

	switchExpand() {
		this.imageExpand = !this.imageExpand
	}
}
