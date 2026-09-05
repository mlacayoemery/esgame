import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, Input, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GameService } from '../services/game.service';
import { PIECE_CELLS, ScoreEntry, ScoreService } from '../services/score.service';
import { TranslateService } from '@ngx-translate/core';

@Component({
    selector: 'tro-score-board',
    templateUrl: './score-board.component.html',
    styleUrls: ['./score-board.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class ScoreBoardComponent implements OnInit {
	private _isStatic = false;
	private _scores: ScoreEntry[] = [];
	totalScore: number = 0;
	@Input() set scores(value: ScoreEntry[] | undefined) {
		if (value) {
			this._scores = value;
			this.calculateTotalScore();
		}
	}
	get scores() {
		return this._scores;
	}

	// Used as a bare attribute in the template (<tro-score-board isStatic>), which Angular passes
	// as the empty string — hence `!== false` rather than a truthiness check.
	@Input() set isStatic(value: any) {
		this._isStatic = value !== false;
	}

	private destroyRef = inject(DestroyRef);
	/**
	 * The current level, kept for its boards' LEGENDS — the percentage each row shows is measured
	 * against the map's own top class, which only the legend knows.
	 */
	private _level: any = null;

	/** Whether this deployment wants the per-conversion columns. */
	get byConversion(): boolean {
		return !!this.gameService.settingsValue?.scoreByConversion;
	}

	/**
	 * A score as a share of what that map could hold: PIECE_CELLS cells at the map's highest class,
	 * read from its own legend rather than written down here.
	 *
	 * Absolute, because a consequence is recorded as a cost and stored negated — the share is of
	 * the magnitude either way. Empty when the map has no legend to measure against, so a row
	 * whose scale is unknown says nothing rather than saying zero.
	 */
	private percentOf(id: string, score: number): string {
		const legend = this._level?.gameBoards?.find((b: any) => b.id == id)?.legend?.elements;
		const top = legend?.length ? legend[legend.length - 1].forValue : 0;
		const ceiling = PIECE_CELLS * top;
		if (!ceiling) return '';
		// One decimal: several of these rows land within a point of each other, and whole numbers
		// made distinct scores read as the same share.
		return `${((100 * Math.abs(score)) / ceiling).toFixed(1)}%`;
	}

	get groupedScores() {
		const grouped =  this._scores?.reduce(
			(entryMap, e) => entryMap.set(this.translateService.instant("map_name_" + e.id) as string, [...entryMap.get(this.translateService.instant("map_name_" + e.id))||[], e]),
			new Map<string, ScoreEntry[]>()
		);

		return Array.from(grouped).map((a) => ({ name: a[0], score: a[1].reduce((a, b) => a + b.score, 0)}));
	}

	/**
	 * The rows, split into one column per production type.
	 *
	 * Each column leads with what that conversion GAINS — its suitability map — and is followed by
	 * what it costs, the consequence maps the game data assigns to it. Grouped by production type
	 * rather than by map name, so Carbon appears under arable and again under livestock instead of
	 * being summed into a single row that cannot say which conversion incurred it.
	 *
	 * A map named by no production type, or named by several, falls into a trailing column of its
	 * own: the data allows both and dropping such a row would lose score that is really there.
	 */
	get scoreColumns(): { name: string, rows: { name: string, score: number, percent: string }[] }[] {
		const settings = this.gameService.settingsValue;
		const name = (id: string) => this.translateService.instant('map_name_' + id) as string;
		const mapOf = (id: string) => settings?.maps?.find(m => m.id == id);

		const columns: { name: string, rows: { name: string, score: number, percent: string }[] }[] = [];
		const placed = new Set<string>();

		(settings?.productionTypes ?? []).forEach(type => {
			const rows = this._scores
				.filter(e => mapOf(e.id)?.productionTypes?.length === 1
					&& mapOf(e.id)!.productionTypes[0] === type.id)
				.map(e => { placed.add(e.id); return { name: name(e.id), score: e.score, percent: this.percentOf(e.id, e.score) }; });
			if (rows.length) columns.push({ name: name(String(type.id)), rows });
		});

		const rest = this._scores.filter(e => !placed.has(e.id))
			.map(e => ({ name: name(e.id), score: e.score, percent: this.percentOf(e.id, e.score) }));
		if (rest.length) columns.push({ name: '', rows: rest });
		return columns;
	}

	constructor(
		private gameService: GameService,
		private cdRef: ChangeDetectorRef,
		private scoreService: ScoreService,
		private translateService: TranslateService
	) {}

	ngOnInit() {
		// Unconditional: even a board handed its scores as an input needs the level's legends to
		// state each row as a percentage.
		this.gameService.currentLevelObs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(level => {
			this._level = level;
			this.cdRef.markForCheck();
		});

		if (!this._isStatic) {
			this.gameService.currentLevelObs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(level => {
				this._scores = this.scoreService.createEmptyScoreEntry(level);
				this.cdRef.markForCheck();
			});

			this.gameService.selectedFieldsObs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(fields => {
				this.scoreService.calculateScore(this._scores, fields);
				this.calculateTotalScore();
				this.cdRef.markForCheck();
			});
		}
	}

	private calculateTotalScore() {
		this.totalScore = this._scores.reduce((a, b) => a + b.score, 0);
	}
}
