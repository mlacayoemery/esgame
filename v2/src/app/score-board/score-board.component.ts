import { Component } from '@angular/core';
import { GameService } from '../services/game.service';

@Component({
  selector: 'tro-score-board',
  templateUrl: './score-board.component.html',
  styleUrls: ['./score-board.component.scss']
})
export class ScoreBoardComponent {
	totalScore: number = 2170;
	scores: { name: string, score: number }[] = [];

	constructor(private gameService: GameService) {

		this.gameService.productionTypesObs.subscribe(productionTypes => {
			productionTypes.forEach(productionType => {
				this.scores.push(
					{ name: productionType.name, score: 0 }
				);
			})
		});

		this.gameService.selectedFieldsObs.subscribe(selectedFields => {
			this.scores.forEach(score => {
				score.score = selectedFields.filter(o => o.productionType.name == score.name).reduce((a, b) => {
					return a + b.score;
				}, 0);
			});
			this.totalScore = this.scores.reduce((a, b) => a + b.score, 0);
		});
	}
}
