import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { GameBoard } from '../shared/models/game-board';
import { GameBoardType } from '../shared/models/game-board-type';
import { Level } from '../shared/models/level';
import { V1GameBoard } from '../shared/helpers/v1-gameboard';
import { Settings } from '../shared/models/settings';
import { ProductionType } from '../shared/models/production-type';
import { HighlightField, HighlightSide, SelectedField } from '../shared/models/field';
import { TiffService } from './tiff.service';

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

	highlightFieldObs = this.highlightFields.asObservable();
	currentLevelObs = this.currentLevel.asObservable();
	settingsObs = this.settings.asObservable();
	productionTypesObs = this.productionTypes.asObservable();
	selectedProductionTypeObs = this.selectedProductionType.asObservable();
	selectedFieldsObs = this.selectedFields.asObservable();

	constructor(private tiffService: TiffService) {
		this.initialiseGameBoards();
	}

	highlightOnOtherFields(id: any) {
		let ids = this.getAssociatedFields(id);
		// let elementSize = this.settings.value.elementSize;
		// if (elementSize == 1) {
		// 	this.highlightFields.next([{id, side: HighlightSide.ALLSIDES}]);
		// 	return;
		// }

		// let ids: HighlightField[] = [];

		// let columns = this.settings.value.gameBoardColumns;
		// if (columns - (id % columns) < elementSize) {
		// 	id = id - (id % columns) + columns - elementSize;
		// }

		// let rows = this.settings.value.gameBoardRows;
		// if (id >= (columns * rows - (elementSize - 1) * columns)) {
		// 	id = (columns * (rows - elementSize) + (id % columns));
		// }

		// for (let i = id; i < (id + elementSize); i++) {
		// 	let sidesX: HighlightSide[] = [];
		// 	if (i == id) sidesX.push(HighlightSide.LEFT);
		// 	if (i == id + elementSize - 1) sidesX.push(HighlightSide.RIGHT);
		// 	for (let j = 0; j < elementSize; j++) {
		// 		let sidesY = [...sidesX];
		// 		if (j == 0) sidesY.push(HighlightSide.TOP);
		// 		if (j == elementSize - 1) sidesY.push(HighlightSide.BOTTOM);
		// 		ids.push({id: i + (j * columns), side: this.getSide(sidesY)});
		// 	}
		// }

		this.highlightFields.next(ids);
	}

	removeHighlight() {
		this.highlightFields.next([]);
	}

	setSelectedProductionType(productionType: ProductionType) {
		this.selectedProductionType.next(productionType);
	}

	selectField(id: number) {
		let fields = this.getAssociatedFields(id).map(o => o.id);

		if (this.selectedProductionType.value != null) {
			let selectedField = new SelectedField(fields, this.selectedProductionType.value, this.selectedProductionType.value?.scoreMap.getScore(fields));
			this.selectedFields.next([...this.selectedFields.value, selectedField]);
		}
	}

	deselectField(id: number) {
		this.selectedFields.next(this.selectedFields.value.filter(o => o.ids.some(p => p == id) == false));
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
		let level1 = new Level();

		new V1GameBoard(this.tiffService).currentGameBoardObs.subscribe(val => {
			if (val != null) {
				let gameBoard = new GameBoard(GameBoardType.DrawingMap, val!);
				level1.gameBoards.push(gameBoard);
				level1.levelNumber = 1;

				this.productionTypes.value.push(new ProductionType("#FFF", gameBoard, "Ackerbau", "http://esgame.unige.ch/images/corn.png"));
				this.productionTypes.value.push(new ProductionType("#FFF", gameBoard, "Viehzucht", "http://esgame.unige.ch/images/cow.png"));
				this.productionTypes.next(this.productionTypes.value);

				this.currentLevel.next(level1);
			}
		})
	}
}
