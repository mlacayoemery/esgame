import { ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { GameService } from '../services/game.service';

@Component({
  selector: 'tro-score-board',
  templateUrl: './score-board.component.html',
  styleUrls: ['./score-board.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ScoreBoardComponent {
	totalScore: number = 0;
	scores: { name: string, score: number }[] = [];

	constructor(
		private gameService: GameService,
		private cdRef: ChangeDetectorRef
	) {
		this.gameService.currentLevelObs.subscribe(level => {
			this.scores = [];
			level?.gameBoards.forEach(gameBoard => {
				if (this.scores.some(o => o.name == gameBoard.name) == false) {
					this.scores.push(
						{ name: gameBoard.name, score: 0 }
					);
				}
			});
			this.cdRef.markForCheck();
		});

		this.gameService.selectedFieldsObs.subscribe(fields => {
			this.scores.forEach(score => {
				score.score = fields.reduce((a, b) => a + (b.scores.find(o => o.name == score.name)?.score ?? 0), 0)
			});
			this.totalScore = this.scores.reduce((a, b) => a + b.score, 0);
			this.cdRef.markForCheck();
		});
	}
}
