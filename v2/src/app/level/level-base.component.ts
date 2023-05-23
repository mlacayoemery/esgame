import { ChangeDetectionStrategy, Component, HostBinding, Input } from '@angular/core';
import { GameService } from '../services/game.service';
import { GameBoardClickMode } from '../shared/models/game-board';
import { ProductionType } from '../shared/models/production-type';
import { filter, map } from 'rxjs';
import { GameBoardType } from '../shared/models/game-board-type';

@Component({
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export abstract class LevelBaseComponent {
	selectedProductionType = this.gameService.selectedProductionTypeObs;
	focusedGameBoard = this.gameService.focusedGameBoardObs.pipe(filter(o => o != null));
	productionTypes: ProductionType[];
	clickMode = GameBoardClickMode;

	level? = this.gameService.currentLevelObs;
	drawingBoard = this.gameService.currentLevelObs.pipe(map(o => o?.gameBoards), map(o => o?.find(p => p.gameBoardType == GameBoardType.DrawingMap)));
	suitabilityBoards = this.gameService.currentLevelObs.pipe(
		map(o => o?.gameBoards), 
		map(o => o?.filter(p => p.gameBoardType == GameBoardType.SuitabilityMap))
	);
	consequenceBoards = this.selectedProductionType.pipe(map(o => o?.consequenceMaps)); //this.gameService.currentLevelObs.pipe(map(o => o?.gameBoards), map(o => o?.filter(p => p.gameBoardType == GameBoardType.ConsequenceMap)));

	constructor(private gameService: GameService) {
		this.gameService.productionTypesObs.subscribe(productionTypes => {
			this.productionTypes = productionTypes;
		});
		
		this.gameService.selectedProductionTypeObs.subscribe(productionType => {
			if (productionType) this.gameService.selectGameBoard(productionType.suitabilityMap);
		})
	}

	nextLevel() {
		this.level?.subscribe(level => {
			if (level?.levelNumber == 1) {
				this.gameService.prepareRound2();
			}
		});
	}

	openHelp() {
		this.gameService.openHelp();
	}
}
