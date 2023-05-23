import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, debounce, forkJoin, interval, merge } from 'rxjs';
import { GameBoard } from '../shared/models/game-board';
import { GameBoardType } from '../shared/models/game-board-type';
import { Level } from '../shared/models/level';
import { Settings } from '../shared/models/settings';
import { ProductionType } from '../shared/models/production-type';
import { HighlightField, HighlightSide, SelectedField } from '../shared/models/field';
import { TiffService } from './tiff.service';
import { DefaultGradients } from '../shared/helpers/gradiants';
import { ScoreEntry, ScoreService } from './score.service';

@Injectable({
	providedIn: 'root'
})
export class GameService {
	private currentLevel = new BehaviorSubject<Level | null>(null);
	private highlightFields = new BehaviorSubject<HighlightField[]>([]);
	private selectedFields = new BehaviorSubject<SelectedField[]>([]);
	private currentlySelectedField = new BehaviorSubject<SelectedField | null>(null);
	private settings = new BehaviorSubject<Settings>(new Settings());
	private productionTypes = new BehaviorSubject<ProductionType[]>([]);
	private selectedProductionType = new BehaviorSubject<ProductionType | null>(null);
	private focusedGameBoard = new BehaviorSubject<GameBoard | null>(null);
	private helpWindow = new BehaviorSubject<boolean>(false);
	private levels: Level[] = [];

	highlightFieldObs = this.highlightFields.asObservable();
	currentLevelObs = this.currentLevel.asObservable();
	settingsObs = this.settings.asObservable();
	productionTypesObs = this.productionTypes.asObservable();
	selectedProductionTypeObs = this.selectedProductionType.asObservable();
	selectedFieldsObs = this.selectedFields.asObservable();
	focusedGameBoardObs = this.focusedGameBoard.asObservable();
	currentlySelectedFieldObs = this.currentlySelectedField.asObservable();
	helpWindowObs = this.helpWindow.asObservable();

	constructor(
		private tiffService: TiffService,
		private scoreService: ScoreService
	) {
		this.initialiseGameBoards();
	}

	highlightOnOtherFields(id: any) {
		let ids = this.getAssociatedFields(id);
		this.currentlySelectedField.next(new SelectedField(ids, this.selectedProductionType.value!));
		
		if (!this.canFieldBePlaced(ids)) {
			this.removeHighlight();
			return;
		}

		if (this.isIdSelected(id)) {
			this.removeHighlight();
			return;
		}

		this.highlightFields.next(ids);
	}

	isIdSelected(id: number) {
		return this.selectedFields.value.some(o => o.fields.some(p => p.id == id));
	}

	removeHighlight() {
		this.highlightFields.next([]);
		this.currentlySelectedField.next(null);
	}

	setSelectedProductionType(productionType: ProductionType) {
		this.selectedProductionType.next(productionType);
	}

	selectField(id: number) {
		let fields = this.getAssociatedFields(id);

		if (!this.canFieldBePlaced(fields)) {
			this.removeHighlight();
			return;
		}

		if (this.selectedProductionType.value != null) {
			let selectedField = new SelectedField(fields, this.selectedProductionType.value);
			this.selectedFields.next([...this.selectedFields.value, selectedField]);
		}
	}

	deselectField(id: number) {
		this.selectedFields.next(this.selectedFields.value.filter(o => o.fields.some(p => p.id == id) == false));
	}

	selectGameBoard(boardData: GameBoard) {
		this.focusedGameBoard.next(boardData);
	}

	prepareRound2() {
		var level2 = new Level();
		this.levels.push(level2);

		var level1Score = this.scoreService.createEmptyScoreEntry(this.currentLevel.value);
		this.scoreService.calculateScore(level1Score, this.selectedFields.value);
		level2.previousRoundScore = level1Score;

		combineLatest([
			this.tiffService.getGameBoard("/assets/images/esgame_img_ag_carbon.tif", DefaultGradients.Yellow, GameBoardType.ConsequenceMap, "Kohlenstoff"),
			this.tiffService.getGameBoard("/assets/images/esgame_img_ag_habitat.tif", DefaultGradients.Purple, GameBoardType.ConsequenceMap, "Lebensraum"),
			this.tiffService.getGameBoard("/assets/images/esgame_img_ag_water.tif", DefaultGradients.Blue, GameBoardType.ConsequenceMap, "Wasser"),
			this.tiffService.getGameBoard("/assets/images/esgame_img_ag_hunt.tif", DefaultGradients.Red, GameBoardType.ConsequenceMap, "Jagd"),
			this.tiffService.getGameBoard("/assets/images/esgame_img_ranch_carbon.tif", DefaultGradients.Yellow, GameBoardType.ConsequenceMap, "Kohlenstoff"),
			this.tiffService.getGameBoard("/assets/images/esgame_img_ranch_habitat.tif", DefaultGradients.Purple, GameBoardType.ConsequenceMap, "Lebensraum"),
			this.tiffService.getGameBoard("/assets/images/esgame_img_ranch_water.tif", DefaultGradients.Blue, GameBoardType.ConsequenceMap, "Wasser"),
			this.tiffService.getGameBoard("/assets/images/esgame_img_ranch_hunt.tif", DefaultGradients.Red, GameBoardType.ConsequenceMap, "Jagd"),
			this.tiffService.getGameBoard("/assets/images/zonal_raster.tif", DefaultGradients.Blue, GameBoardType.DrawingMap, "Zonen", true),
			this.tiffService.getGameBoard("/assets/images/consequence_test.tif", DefaultGradients.Green, GameBoardType.DrawingMap, "Zonen", true)
		]).subscribe((gameBoards) => {
			level2.gameBoards.push(...this.currentLevel.value!.gameBoards);
			level2.gameBoards.push(...gameBoards);
			level2.levelNumber = 2;

			// TODO: Nicht über Array
			this.productionTypes.value[0].consequenceMaps.push(...gameBoards.slice(0, 4));
			this.productionTypes.value[1].consequenceMaps.push(...gameBoards.slice(4, 8));

			this.selectedFields.value.forEach(o => o.updateScore());

			this.currentLevel.next(level2);
			this.selectedFields.next(this.selectedFields.value);
		});
	}

	openHelp(close = false) { this.helpWindow.next(!close); }

	private canFieldBePlaced(associatedFields: HighlightField[] = []) {
		if (this.selectedProductionType.value?.maxElements == this.selectedFields.value.filter(o => o.productionType == this.selectedProductionType.value).length) return false;
		return !(this.selectedFields.value.some(o => o.fields.some(p => associatedFields.some(q => q.id == p.id))));
	}

	private getAssociatedFields(id: number): HighlightField[] {
		let elementSize = this.settings.value.elementSize;
		if (elementSize == 1) {
			return [{ id, side: HighlightSide.ALLSIDES }];
		}

		let ids: HighlightField[] = [];

		let columns = this.settings.value.gameBoardColumns;
		if (columns - (id % columns) < elementSize) {
			id = id - (id % columns) + columns - elementSize;
		}

		let rows = this.settings.value.gameBoardRows;
		if (id >= (columns * rows - (elementSize - 1) * columns)) {
			id = (columns * (rows - elementSize) + (id % columns));
		}

		for (let i = id; i < (id + elementSize); i++) {
			let sidesX: HighlightSide[] = [];
			if (i == id) sidesX.push(HighlightSide.LEFT);
			if (i == id + elementSize - 1) sidesX.push(HighlightSide.RIGHT);
			for (let j = 0; j < elementSize; j++) {
				let sidesY = [...sidesX];
				if (j == 0) sidesY.push(HighlightSide.TOP);
				if (j == elementSize - 1) sidesY.push(HighlightSide.BOTTOM);
				ids.push({ id: i + (j * columns), side: this.getSide(sidesY) });
			}
		}

		return ids;
	}

	private getSide(sides: HighlightSide[]) {
		if (sides.some(o => o == HighlightSide.TOP)) {
			if (sides.some(o => o == HighlightSide.LEFT)) return HighlightSide.TOPLEFT;
			if (sides.some(o => o == HighlightSide.RIGHT)) return HighlightSide.TOPRIGHT;
			return HighlightSide.TOP;
		}

		if (sides.some(o => o == HighlightSide.BOTTOM)) {
			if (sides.some(o => o == HighlightSide.LEFT)) return HighlightSide.BOTTOMLEFT;
			if (sides.some(o => o == HighlightSide.RIGHT)) return HighlightSide.BOTTOMRIGHT;
			return HighlightSide.BOTTOM;
		}

		if (sides.length == 0) return HighlightSide.NONE;

		return sides[0];
	}

	initialiseGameBoards() {
		// This code can be replaced as soon as it is possible to load data from the API
		let level = new Level();
		this.levels.push(level);
		
		combineLatest([
			this.tiffService.getGameBoard("/assets/images/esgame_img_ag.tif", DefaultGradients.Green, GameBoardType.SuitabilityMap, "Ackerland"), 
			this.tiffService.getGameBoard("/assets/images/esgame_img_ranch.tif", DefaultGradients.Orange, GameBoardType.SuitabilityMap, "Viehzucht")
		]).subscribe(([gameBoard, gameBoard2]) => {
			level.gameBoards.push(gameBoard);
			level.gameBoards.push(gameBoard2);
			level.levelNumber = 1;

			this.productionTypes.value.push(new ProductionType("#FFF", gameBoard, "Ackerland", "http://esgame.unige.ch/images/corn.png"));
			this.productionTypes.value.push(new ProductionType("#FFF", gameBoard2, "Viehzucht", "http://esgame.unige.ch/images/cow.png"));
			this.productionTypes.next(this.productionTypes.value);
			this.selectedProductionType.next(this.productionTypes.value[0]);

			this.currentLevel.next(level);
			this.focusedGameBoard.next(gameBoard);
		});

	}
}
