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
	minSelected = 0;
	currentlySelectedPercentage: string;

	constructor(gameService: GameService) {	
		super(gameService);
		gameService.initialiseSVGMode();
		this.settings.subscribe(o => {
			this.minSelected = o?.minSelected ?? 0;
		});
	}

	override nextLevel() {
		const selected = this.gameService.getPercentageSelectedFields();
		this.currentlySelectedPercentage = (this.gameService.getPercentageSelectedFields() * 100).toFixed(1);
		if (selected >= (this.minSelected / 100)) {
			super.nextLevel();
		} else {
			(document.getElementById('svg-level-dialog') as any).showModal();
		}
	}

	switchExpand() {
		this.imageExpand = !this.imageExpand
	}
}
