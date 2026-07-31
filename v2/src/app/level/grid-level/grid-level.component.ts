import { Component } from '@angular/core';
import { LevelBaseComponent } from '../level-base.component';
import { GameService } from 'src/app/services/game.service';
import { ConfigService } from 'src/app/services/config.service';

@Component({
    selector: 'tro-grid-level',
    templateUrl: './grid-level.component.html',
    styleUrls: ['./grid-level.component.scss', '../level-base.component.scss'],
    standalone: false
})
export class GridLevelComponent extends LevelBaseComponent {
	settings = this.gameService.settingsObs;
	constructor(gameService: GameService, configService: ConfigService) {
		super(gameService);
		configService.getGameData('static').subscribe({
			next: data => {
				this.gameService.loadSettings(data);
				this.gameService.initialiseGridMode();
			},
			error: (err) => {
				// Without the game data there is no board at all, so this is terminal. It used to
				// have no error handler: the observable errored, Angular's ErrorHandler logged it,
				// and the player got a blank page with nothing to read.
				console.error(err);
				alert("The game could not be loaded. Its configuration data is missing or unreadable.");
			}
		});
	}
}
