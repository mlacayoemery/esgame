import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Field } from '../shared/models/field';
import { FieldType } from '../shared/models/field-type';
import { GameBoard } from '../shared/models/game-board';
import { GameBoardType } from '../shared/models/game-board-type';
import { Level } from '../shared/models/level';
import { ProductionType } from '../shared/models/production-type';

@Injectable({
  providedIn: 'root'
})
export class GameService {
	private currentLevel = new BehaviorSubject<Level | null>(null);
	currentLevelObs = this.currentLevel.asObservable();

  constructor() {
	this.initialiseGameBoards();
  }

  initialiseGameBoards() {
	// This code can be replaced as soon as it is possible to load data from the API
	let level1 = new Level();

	let fieldTypeEmpty = new FieldType("#FFF", "empty");
	let fieldTypeWater = new FieldType("#F00", "water");
	let fields = [
		...Array(12).map(_ => new Field(fieldTypeEmpty, 50)),
		...Array(2).map(_ => new Field(fieldTypeWater, 50)),
		...Array(14).map(_ => new Field(fieldTypeEmpty, 50)),
		...Array(10).map(_ => new Field(fieldTypeEmpty, 50)),
		...Array(4).map(_ => new Field(fieldTypeWater, 50)),
		...Array(14).map(_ => new Field(fieldTypeEmpty, 50)),
		...Array(8).map(_ => new Field(fieldTypeEmpty, 50)),
		...Array(8).map(_ => new Field(fieldTypeWater, 50)),
		...Array(12).map(_ => new Field(fieldTypeEmpty, 50)),
	]
	let gameBoard = new GameBoard(GameBoardType.DrawingMap, fields, 28);
	
	level1.gameBoards.push(gameBoard);
	level1.levelNumber = 1;

	this.currentLevel.next(level1);
  }
}
