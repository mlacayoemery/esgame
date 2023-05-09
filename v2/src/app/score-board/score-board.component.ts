import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit } from '@angular/core';
import { GameService } from '../services/game.service';
import { ScoreEntry, ScoreService } from '../services/score.service';

@Component({
  selector: 'tro-score-board',
  templateUrl: './score-board.component.html',
  styleUrls: ['./score-board.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
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

	@Input() set isStatic(value: any) {
		if (value === false) this._isStatic = false;
		else this._isStatic = true;
	}

	constructor(
		private gameService: GameService,
		private cdRef: ChangeDetectorRef,
		private scoreService: ScoreService
	) {}

	ngOnInit() {
		if (this._isStatic == false) {
			this.gameService.currentLevelObs.subscribe(level => {
				this._scores = this.scoreService.createEmptyScoreEntry(level);
				this.cdRef.markForCheck();
			});
	
			this.gameService.selectedFieldsObs.subscribe(fields => {
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
