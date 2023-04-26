import { Component, HostBinding, Input } from '@angular/core';
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
	selectedProductionType = this.gameService.selectedProductionTypeObs;
	focusedGameBoard: GameBoard;
	levelNumber: number;
	productionTypes: ProductionType[];

	@HostBinding('class.layout2')
	private _layout2 = false;

	@Input() set isLayout2(layout: any) {
		if (layout === false) this._layout2 = false;
		else this._layout2 = true;
	}

	get isLayout2() { return this._layout2; }

	constructor(private gameService: GameService) {
		this.gameService.currentLevelObs.subscribe(level => {
			this.setLevel(level);
		});
		this.gameService.productionTypesObs.subscribe(productionTypes => {
			this.productionTypes = productionTypes;
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
