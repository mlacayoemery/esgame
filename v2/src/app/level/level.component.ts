import { Component, HostBinding, Input } from '@angular/core';
import { GameService } from '../services/game.service';
import { GameBoardClickMode } from '../shared/models/game-board';
import { Level } from '../shared/models/level';
import { ProductionType } from '../shared/models/production-type';
import { filter, map } from 'rxjs';
import { GameBoardType } from '../shared/models/game-board-type';

@Component({
  selector: 'tro-level',
  templateUrl: './level.component.html',
  styleUrls: ['./level.component.scss']
})
export class LevelComponent {
	selectedProductionType = this.gameService.selectedProductionTypeObs;
	focusedGameBoard = this.gameService.focusedGameBoardObs.pipe(filter(o => o != null));
	productionTypes: ProductionType[];
	clickMode = GameBoardClickMode;

	@HostBinding('class.layout2')
	private _layout2 = false;
	level? = this.gameService.currentLevelObs;
	boards = this.gameService.currentLevelObs.pipe(map(o => o?.gameBoards));
	suitabilityBoards = this.gameService.currentLevelObs.pipe(map(o => o?.gameBoards), map(o => o?.filter(p => p.gameBoardType == GameBoardType.SuitabilityMap)));
	consequenceBoards = this.gameService.currentLevelObs.pipe(map(o => o?.gameBoards), map(o => o?.filter(p => p.gameBoardType == GameBoardType.ConsequenceMap)));

	@Input() set isLayout2(layout: any) {
		if (layout === false) this._layout2 = false;
		else this._layout2 = true;
	}

	get isLayout2() { return this._layout2; }

	constructor(private gameService: GameService) {
		// this.gameService.currentLevelObs.subscribe(level => {
		// 	this.setLevel(level);
		// });
		this.gameService.productionTypesObs.subscribe(productionTypes => {
			this.productionTypes = productionTypes;
		});
	}

	// setLevel(level: Level | null) {
	// 	if (level) {
	// 		// this.focusedGameBoard = level.gameBoards.filter(o => o.gameBoardType == GameBoardType.DrawingMap)[0];
	// 		this.level = level;
	// 	}
	// }

	nextLevel() {}

	changeGameboard() {}
}
