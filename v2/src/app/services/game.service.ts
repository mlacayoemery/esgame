import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { GameBoard } from '../shared/models/game-board';
import { GameBoardType } from '../shared/models/game-board-type';
import { Level } from '../shared/models/level';
import { V1GameBoard } from '../shared/helpers/v1-gameboard';
import { Settings } from '../shared/models/settings';
import { ProductionType } from '../shared/models/production-type';

@Injectable({
	providedIn: 'root'
})
export class GameService {
	private currentLevel = new BehaviorSubject<Level | null>(null);
	private highlightFields = new BehaviorSubject<number | null>(null);
	private settings = new BehaviorSubject<Settings>(new Settings());
	private productionTypes = new BehaviorSubject<ProductionType[]>([]);
	private selectedProductionType = new BehaviorSubject<ProductionType | null>(null);

	highlightFieldObs = this.highlightFields.asObservable();
	currentLevelObs = this.currentLevel.asObservable();
	settingsObs = this.settings.asObservable();
	productionTypesObs = this.productionTypes.asObservable();
	selectedProductionTypeObs = this.selectedProductionType.asObservable();

	constructor() {
		this.initialiseGameBoards();
	}

	highlightOnOtherFields(id: any) {
		this.highlightFields.next(id);
	}

	removeHighlight() {
		this.highlightFields.next(null);
	}

	setSelectedProductionType(productionType: ProductionType) {
		this.selectedProductionType.next(productionType);
	}

	initialiseGameBoards() {
		// This code can be replaced as soon as it is possible to load data from the API
		let level1 = new Level();

		// let fieldTypeEmpty = new FieldType("#FFF", "EMPTY");
		// let fieldTypeWater = new FieldType("#00F", "CONFIGURED");
		// let fields = [
		// 	...Array(12).fill(new Field(fieldTypeEmpty, 50)),
		// 	...Array(2).fill(new Field(fieldTypeWater, 50)),
		// 	...Array(14).fill(new Field(fieldTypeEmpty, 50)),
		// 	...Array(10).fill(new Field(fieldTypeEmpty, 50)),
		// 	...Array(4).fill(new Field(fieldTypeWater, 50)),
		// 	...Array(14).fill(new Field(fieldTypeEmpty, 50)),
		// 	...Array(8).fill(new Field(fieldTypeEmpty, 50)),
		// 	...Array(8).fill(new Field(fieldTypeWater, 50)),
		// 	...Array(12).fill(new Field(fieldTypeEmpty, 50)),
		// ];
		let gameBoard = new GameBoard(GameBoardType.DrawingMap, new V1GameBoard().getAgricultureFromTxt());

		level1.gameBoards.push(gameBoard);
		level1.levelNumber = 1;

		this.productionTypes.value.push(new ProductionType("#FFF", gameBoard, "Ackerbau", "http://esgame.unige.ch/images/corn.png"));
		this.productionTypes.value.push(new ProductionType("#FFF", gameBoard, "Viehzucht", "http://esgame.unige.ch/images/cow.png"));
		this.productionTypes.next(this.productionTypes.value);

		this.currentLevel.next(level1);
	}
}
