import { Component } from '@angular/core';
import { GameService } from '../services/game.service';
import { GameBoard } from '../shared/models/game-board';
import { GameBoardType } from '../shared/models/game-board-type';
import { Level } from '../shared/models/level';
import { ProductionType } from '../shared/models/production-type';

@Component({
  selector: 'tro-level',
  templateUrl: './level.component.html',
  styleUrls: ['./level.component.scss']
})
export class LevelComponent {
	selectedProductionType: ProductionType;
	focusedGameBoard: GameBoard;
	levelNumber: number;

	constructor(private gameService: GameService) {
		this.gameService.currentLevelObs.subscribe(level => {
			this.setLevel(level);
		});
	}

	setLevel(level: Level | null) {
		if (level) {
			this.focusedGameBoard = level.gameBoards.filter(o => o.gameBoardType == GameBoardType.DrawingMap)[0];
			this.levelNumber = level.levelNumber;
		}
	}

	nextLevel() {}

	changeGameboard() {}
}
