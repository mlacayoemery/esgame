import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, forkJoin, merge } from 'rxjs';
import { GameBoard } from '../shared/models/game-board';
import { GameBoardType } from '../shared/models/game-board-type';
import { Level } from '../shared/models/level';
import { V1GameBoard } from '../shared/helpers/v1-gameboard';
import { Settings } from '../shared/models/settings';
import { ProductionType } from '../shared/models/production-type';
import { HighlightField, HighlightSide, SelectedField } from '../shared/models/field';
import { TiffService } from './tiff.service';
import { DefaultGradients } from '../shared/helpers/gradiants';

@Injectable({
	providedIn: 'root'
})
export class GameService {
	private currentLevel = new BehaviorSubject<Level | null>(null);
	private highlightFields = new BehaviorSubject<HighlightField[]>([]);
	private selectedFields = new BehaviorSubject<SelectedField[]>([]);
	private settings = new BehaviorSubject<Settings>(new Settings());
	private productionTypes = new BehaviorSubject<ProductionType[]>([]);
	private selectedProductionType = new BehaviorSubject<ProductionType | null>(null);
	private focusedGameBoard = new BehaviorSubject<GameBoard | null>(null);

	highlightFieldObs = this.highlightFields.asObservable();
	currentLevelObs = this.currentLevel.asObservable();
	settingsObs = this.settings.asObservable();
	productionTypesObs = this.productionTypes.asObservable();
	selectedProductionTypeObs = this.selectedProductionType.asObservable();
	selectedFieldsObs = this.selectedFields.asObservable();
	focusedGameBoardObs = this.focusedGameBoard.asObservable();

	constructor(private tiffService: TiffService) {
		this.initialiseGameBoards();
	}

	highlightOnOtherFields(id: any) {
		if (!this.canFieldBePlaced(id)) {
			this.removeHighlight();
			return;
		}

		if (this.isIdSelected(id)) {
			this.removeHighlight();
			return;
		}

		let ids = this.getAssociatedFields(id);

		this.highlightFields.next(ids);
	}

	isIdSelected(id: number) {
		return this.selectedFields.value.some(o => o.fields.some(p => p.id == id));
	}

	removeHighlight() {
		this.highlightFields.next([]);
	}

	setSelectedProductionType(productionType: ProductionType) {
		this.selectedProductionType.next(productionType);
	}

	selectField(id: number) {
		let fields = this.getAssociatedFields(id);

		if (!this.canFieldBePlaced(undefined, fields)) {
			this.removeHighlight();
			return;
		}

		if (this.selectedProductionType.value != null) {
			let selectedField = new SelectedField(fields, this.selectedProductionType.value, this.selectedProductionType.value?.scoreMap.getScore(fields.map(o => o.id)));
			this.selectedFields.next([...this.selectedFields.value, selectedField]);
		}
	}

	deselectField(id: number) {
		this.selectedFields.next(this.selectedFields.value.filter(o => o.fields.some(p => p.id == id) == false));
	}

	selectGameBoard(boardData: GameBoard) {
		this.focusedGameBoard.next(boardData);
	}

	private canFieldBePlaced(id: number = -1, associatedFields: HighlightField[] = []) {
		if (this.selectedProductionType.value?.maxElements == this.selectedFields.value.filter(o => o.productionType == this.selectedProductionType.value).length) return false;
		if (id > -1) associatedFields = this.getAssociatedFields(id);
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
		let level2 = new Level();
		// var gameboard = new V1GameBoard(this.tiffService, "/assets/images/esgame_img_ag.tif", DefaultGradients.Green);
		// var gameboard2 = new V1GameBoard(this.tiffService, "/assets/images/esgame_img_ranch.tif", DefaultGradients.Orange);
		
		combineLatest([
			this.tiffService.getGameBoard("/assets/images/esgame_img_ag.tif", DefaultGradients.Green, GameBoardType.SuitabilityMap, "Ackerland"), 
			this.tiffService.getGameBoard("/assets/images/esgame_img_ranch.tif", DefaultGradients.Orange, GameBoardType.SuitabilityMap, "Viehzucht")
		]).subscribe(([gameBoard, gameBoard2]) => {
			level2.gameBoards.push(gameBoard);
				level2.gameBoards.push(gameBoard2);
				level2.levelNumber = 1;

				this.productionTypes.value.push(new ProductionType("#FFF", gameBoard, "Ackerbau", "http://esgame.unige.ch/images/corn.png"));
				this.productionTypes.value.push(new ProductionType("#FFF", gameBoard, "Viehzucht", "http://esgame.unige.ch/images/cow.png"));
				this.productionTypes.next(this.productionTypes.value);

				this.currentLevel.next(level2);
				this.focusedGameBoard.next(gameBoard);
		});

		// combineLatest([gameboard.currentGameBoardObs, gameboard.legendObs, gameboard2.currentGameBoardObs, gameboard2.legendObs]).subscribe(results => {
		// 	var data = results[0];
		// 	var legend = results[1];
		// 	var data2 = results[2];
		// 	var legend2 = results[3];
		// 	if (data && legend) {
		// 		let gameBoard = new GameBoard(GameBoardType.SuitabilityMap, data!, legend!);
		// 		let gameBoard2 = new GameBoard(GameBoardType.SuitabilityMap, data2!, legend2!);
		// 		level2.gameBoards.push(gameBoard);
		// 		level2.gameBoards.push(gameBoard2);
		// 		level2.levelNumber = 1;
		// 		console.log(data, data2);

		// 		this.productionTypes.value.push(new ProductionType("#FFF", gameBoard, "Ackerbau", "http://esgame.unige.ch/images/corn.png"));
		// 		this.productionTypes.value.push(new ProductionType("#FFF", gameBoard, "Viehzucht", "http://esgame.unige.ch/images/cow.png"));
		// 		this.productionTypes.next(this.productionTypes.value);

		// 		this.currentLevel.next(level2);
		// 		this.focusedGameBoard.next(gameBoard);
		// 	}
		// });

		// gameboard.loadFile();
		// gameboard2.loadFile();
	}
}
