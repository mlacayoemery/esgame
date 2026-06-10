import { Component } from '@angular/core';
import { LevelBaseComponent } from '../level-base.component';
import { GameService } from 'src/app/services/game.service';
import { ConfigService } from 'src/app/services/config.service';

@Component({
	selector: 'tro-grid-level',
	templateUrl: './grid-level.component.html',
	styleUrls: ['./grid-level.component.scss', '../level-base.component.scss']
})
export class GridLevelComponent extends LevelBaseComponent {
	settings = this.gameService.settingsObs;
	constructor(gameService: GameService, configService: ConfigService) {
		super(gameService);
		configService.getGameData('static').subscribe(data => {
			this.gameService.loadSettings(data);
			this.gameService.initialiseGridMode();
		});
	}
}
