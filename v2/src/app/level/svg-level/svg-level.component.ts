import { Component, HostBinding } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LevelBaseComponent } from '../level-base.component';
import { GameService } from 'src/app/services/game.service';
import { combineLatest, map, tap } from 'rxjs';
import { GameBoardType } from 'src/app/shared/models/game-board-type';
import { GameBoardClickMode } from 'src/app/shared/models/game-board';
import { ConfigService } from 'src/app/services/config.service';
import { ScoreService } from 'src/app/services/score.service';
import { TranslateService } from '@ngx-translate/core';


/** Four pieces of 2 x 2 — the most any one production type can hold. See dataAgDynamic.json. */
const PIECE_CELLS = 16;

@Component({
    selector: 'tro-svg-level',
    templateUrl: './svg-level.component.html',
    styleUrls: ['../level-base.component.scss', './svg-level.component.scss'],
    standalone: false
})
export class SvgLevelComponent extends LevelBaseComponent {
	overlayBoard = this.gameService.currentLevelObs.pipe(map(o => o?.gameBoards), map(o => o?.find(p => p.gameBoardType == GameBoardType.DrawingMap)));

	/**
	 * The chart's axes, recomputed whenever a piece moves.
	 *
	 * A client-scored board sums each consequence map in the browser — the same numbers the score
	 * board shows, from the same SelectedField.updateScore values — so the chart tracks the board
	 * instead of the last round submitted. Anything else keeps the calculator's own scores.
	 *
	 * As a PERCENTAGE of what that map could hold: sixteen cells (four 2x2 pieces) times the map's
	 * own highest value, read from its legend rather than written down here. The chart draws on a
	 * 0-100 axis, so every map is on the same scale and 100 means a board that could not be worse.
	 *
	 * Absolute value because SelectedField.updateScore records a consequence as a cost, negated.
	 */
	chartEntries = combineLatest([
		this.gameService.currentLevelObs,
		this.gameService.selectedFieldsObs,
		this.gameService.settingsObs,
	]).pipe(map(([level, fields, settings]) => {
		if (!settings?.clientScored) return level?.indicatorScores ?? [];

		// Suitability AND consequence, grouped by the map's translated name exactly as
		// ScoreBoardComponent.groupedScores does — so the chart's axes ARE the score board's rows.
		// Carbon is one axis, not two, even though arable and livestock each have a carbon map.
		const entries = this.scoreService.createEmptyScoreEntry(level);
		if (!entries.length) return [];
		this.scoreService.calculateScore(entries, fields);

		const groups = new Map<string, { id: string, score: number, ceiling: number, positive: boolean }>();
		entries.forEach(entry => {
			const name = this.translateService.instant('map_name_' + entry.id) as string;
			const board = level!.gameBoards.find(b => b.id == entry.id);
			const legend = board?.legend?.elements;
			const top = legend?.length ? legend[legend.length - 1].forValue : 0;
			const group = groups.get(name) ?? { id: entry.id, score: 0, ceiling: 0,
				// A production map is what the round GAINS; a consequence map is what it costs.
				positive: board?.gameBoardType == GameBoardType.SuitabilityMap };
			group.score += Math.abs(entry.score);
			// The worst ONE of the maps behind this axis, not their sum: sixteen cells cannot be
			// both arable and livestock at once, so the reachable worst is sixteen at the higher
			// rate. Carbon is 16 x 125 = 2000, not 16 x 125 + 16 x 100.
			group.ceiling = Math.max(group.ceiling, PIECE_CELLS * top);
			groups.set(name, group);
		});

		return Array.from(groups.values())
			.map(g => ({ id: g.id, score: g.ceiling ? (100 * g.score) / g.ceiling : 0, positive: g.positive }));
	}));
	settings = this.gameService.settingsObs;
	imageExpand = false
	minSelected = 0;
	currentlySelectedPercentage: string;
	gameBoardClickMode = GameBoardClickMode;
	/** From settings.visualOptions; default off so esgame's look is unchanged. */
	highlightFocusedBoard = false;
	@HostBinding('class.neutral-scores') neutralScoreColors = false;
	/** From settings.autoOpenInstructions; true unless the dataset turns it off. */
	autoOpenInstructions = true;
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
		if (o && o.levelNumber <= 2 && !this.readOnly && this.autoOpenInstructions
			&& this.helpShownForLevel !== o.levelNumber) {
			this.helpShownForLevel = o.levelNumber;
			this.openHelp();
		}
	}));

	constructor(gameService: GameService, configService: ConfigService, private scoreService: ScoreService, private translateService: TranslateService) {
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
			this.autoOpenInstructions = o?.autoOpenInstructions ?? true;
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
