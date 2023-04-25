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

	constructor(private gameService: GameService)
	{
		this.scores.push(
			{ name: 'Ackerland', score: 1225 },
			{ name: 'Weideland', score: 2500 },
			{ name: 'Wasserqualität', score: -300 },
			{ name: 'Wasserverfügbarkeit', score: -800 },
			{ name: 'Luftqualität', score: -270 },
			{ name: 'Lebensraumqualität', score: -150 },
		)
	}
}
