import { Component, HostBinding } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LevelBaseComponent } from '../level-base.component';
import { GameService } from 'src/app/services/game.service';
import { map, tap } from 'rxjs';
import { GameBoardType } from 'src/app/shared/models/game-board-type';
import { GameBoardClickMode } from 'src/app/shared/models/game-board';
import { ConfigService } from 'src/app/services/config.service';


@Component({
    selector: 'tro-svg-level',
    templateUrl: './svg-level.component.html',
    styleUrls: ['../level-base.component.scss', './svg-level.component.scss'],
    standalone: false
})
export class SvgLevelComponent extends LevelBaseComponent {
	overlayBoard = this.gameService.currentLevelObs.pipe(map(o => o?.gameBoards), map(o => o?.find(p => p.gameBoardType == GameBoardType.DrawingMap)));
	settings = this.gameService.settingsObs;
	imageExpand = false
	minSelected = 0;
	currentlySelectedPercentage: string;
	gameBoardClickMode = GameBoardClickMode;
	/** From settings.visualOptions; default off so esgame's look is unchanged. */
	highlightFocusedBoard = false;
	@HostBinding('class.neutral-scores') neutralScoreColors = false;
	/**
	 * Which level the instructions have already been auto-opened for.
	 *
	 * `level` is consumed by seven `| async` pipes in the template (plus `rightGameBoards`),
	 * and every one of them is a separate subscription to the same BehaviorSubject — so this
	 * tap runs once per subscriber, not once per level. Without the guard the dialog re-opened
	 * itself a few seconds after the player closed it, when the board finished decoding and the
	 * resulting change detection subscribed the remaining pipes. Reproduced in e2e/round-trip.
	 */
	private helpShownForLevel: number | null = null;

	override level = this.gameService.currentLevelObs.pipe(tap(o => {
		this.readOnly = o?.isReadOnly ?? false;
		// Only once an actual level exists. currentLevelObs is a BehaviorSubject that starts at
		// null and emits level 1 a few seconds later, when the board's GeoTIFFs finish decoding —
		// so opening on the null emission too meant the dialog appeared before the board, and then
		// appeared AGAIN, on top of whatever the player had just clicked.
		if (o && o.levelNumber <= 2 && !this.readOnly && this.helpShownForLevel !== o.levelNumber) {
			this.helpShownForLevel = o.levelNumber;
			this.openHelp();
		}
	}));

	constructor(gameService: GameService, configService: ConfigService) {
		super(gameService);
		configService.getGameData('dynamic').subscribe({
			next: data => {
				this.gameService.loadSettings(data);
				gameService.initialiseSVGMode();
			},
			error: (err) => {
				// Without the game data there is no board at all, so this is terminal. It used to
				// have no error handler: the observable errored, Angular's ErrorHandler logged it,
				// and the player got a blank page with nothing to read.
				console.error(err);
				alert("The game could not be loaded. Its configuration data is missing or unreadable.");
			}
		});
		this.settings.pipe(takeUntilDestroyed()).subscribe(o => {
			this.minSelected = o?.minSelected ?? 0;
			this.highlightFocusedBoard = o?.visualOptions?.highlightFocusedBoard ?? false;
			this.neutralScoreColors = o?.visualOptions?.neutralScoreColors ?? false;
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
