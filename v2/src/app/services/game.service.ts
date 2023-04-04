import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Field } from '../shared/models/field';
import { FieldType } from '../shared/models/field-type';
import { GameBoard } from '../shared/models/game-board';
import { GameBoardType } from '../shared/models/game-board-type';
import { Level } from '../shared/models/level';
import { V1GameBoard } from '../shared/helpers/v1-gameboard';

@Injectable({
  providedIn: 'root'
})
export class GameService {
	private currentLevel = new BehaviorSubject<Level | null>(null);
	private highlightFields = new BehaviorSubject<number | null>(null);

	highlightFieldObs = this.highlightFields.asObservable();
	currentLevelObs = this.currentLevel.asObservable();

  constructor() {
	this.initialiseGameBoards();
  }

  	highlightOnOtherFields(id: any) {
		this.highlightFields.next(id);
	}

	removeHighlight() {
		this.highlightFields.next(null);
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
	let gameBoard = new GameBoard(GameBoardType.DrawingMap, new V1GameBoard().getAgricultureFromTxt(), 28);
	
	level1.gameBoards.push(gameBoard);
	level1.levelNumber = 1;

	this.currentLevel.next(level1);
  }
}
