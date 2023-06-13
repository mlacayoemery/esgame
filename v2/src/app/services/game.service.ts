import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, tap, timeout } from 'rxjs';
import { GameBoard } from '../shared/models/game-board';
import { GameBoardType } from '../shared/models/game-board-type';
import { Level } from '../shared/models/level';
import { Settings } from '../shared/models/settings';
import { ProductionType } from '../shared/models/production-type';
import { HighlightField, HighlightSide, SelectedField } from '../shared/models/field';
import { TiffService } from './tiff.service';
import { CustomColors, DefaultGradients } from '../shared/helpers/gradients';
import { ScoreService } from './score.service';

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
	private loadingIndicator = new BehaviorSubject<boolean[]>([]);
	private levels: Level[] = [];

	highlightFieldObs = this.highlightFields.asObservable();
	currentLevelObs = this.currentLevel.asObservable();
	settingsObs = this.settings.asObservable();
	productionTypesObs = this.productionTypes.asObservable();
	selectedProductionTypeObs = this.selectedProductionType.asObservable();
	selectedFieldsObs = this.selectedFields.asObservable().pipe(
		tap(o => {
			if (this.currentLevel.value) {
				this.currentLevel.value.selectedFields = o;
			}
			return o;
		})
	);
	focusedGameBoardObs = this.focusedGameBoard.asObservable();
	currentlySelectedFieldObs = this.currentlySelectedField.asObservable();
	helpWindowObs = this.helpWindow.asObservable();
	loadingIndicatorObs = this.loadingIndicator.asObservable();

	constructor(
		private tiffService: TiffService,
		private scoreService: ScoreService
	) {}

	highlightOnOtherFields(id: any) {
		let ids = this.getAssociatedFields(id);
		this.currentlySelectedField.next(new SelectedField(ids, this.selectedProductionType.value!));
		if (!this.canFieldBePlaced(ids) || this.isIdSelected(id)) {
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

	goToNextLevel() {
		var currentHighest = this.levels[this.levels.length - 1];

		if (currentHighest == this.currentLevel.value) {
			this.prepareLevel2();
		} else {
			var lvl = this.levels.find(o => o.levelNumber == (this.currentLevel.value!.levelNumber + 1))!;
			this.currentLevel.next(lvl);
			this.selectedFields.next(lvl.selectedFields);
		}
	}

	goToPreviousLevel() {
		this.loading();
		var currentLowest = this.levels[0];

		if (currentLowest != this.currentLevel.value) {
			var lvl = this.levels.find(o => o.levelNumber == this.currentLevel.value!.levelNumber - 1)!;
			this.currentLevel.next(lvl);
			this.selectedFields.next(lvl.selectedFields);
			this.loading(false);
		}
	}

	prepareLevel2() {
		this.loading();
		var level2 = new Level();
		level2.showConsequenceMaps = true;
		this.levels.push(level2);

		// var level1Score = this.scoreService.createEmptyScoreEntry(this.currentLevel.value);
		// this.scoreService.calculateScore(level1Score, this.selectedFields.value);
		this.currentLevel.value!.isReadOnly = true;
		this.currentLevel.value!.selectedFields = this.selectedFields.value.map(o => {
			return Object.assign({}, o);
		});

		if (this.settings.value.mode == 'GRID') {
			combineLatest([
				this.tiffService.getGridGameBoard("/assets/images/esgame_img_ag_carbon.tif", DefaultGradients.Yellow, GameBoardType.ConsequenceMap, "Kohlenstoff"),
				this.tiffService.getGridGameBoard("/assets/images/esgame_img_ag_habitat.tif", DefaultGradients.Purple, GameBoardType.ConsequenceMap, "Lebensraum"),
				this.tiffService.getGridGameBoard("/assets/images/esgame_img_ag_water.tif", DefaultGradients.Blue, GameBoardType.ConsequenceMap, "Wasser"),
				this.tiffService.getGridGameBoard("/assets/images/esgame_img_ag_hunt.tif", DefaultGradients.Red, GameBoardType.ConsequenceMap, "Jagd"),
				this.tiffService.getGridGameBoard("/assets/images/esgame_img_ranch_carbon.tif", DefaultGradients.Yellow, GameBoardType.ConsequenceMap, "Kohlenstoff"),
				this.tiffService.getGridGameBoard("/assets/images/esgame_img_ranch_habitat.tif", DefaultGradients.Purple, GameBoardType.ConsequenceMap, "Lebensraum"),
				this.tiffService.getGridGameBoard("/assets/images/esgame_img_ranch_water.tif", DefaultGradients.Blue, GameBoardType.ConsequenceMap, "Wasser"),
				this.tiffService.getGridGameBoard("/assets/images/esgame_img_ranch_hunt.tif", DefaultGradients.Red, GameBoardType.ConsequenceMap, "Jagd"),
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
				this.loading(false);
			});
		} else if (this.settings.value.mode == 'SVG') {
			combineLatest([
				this.tiffService.getSvgGameBoard("/assets/images/Consequence_1_air_quality.tif", GameBoardType.ConsequenceMap, "Air Quality", DefaultGradients.Green),
				this.tiffService.getSvgGameBoard("/assets/images/Consequence_2_water_quality.tif", GameBoardType.ConsequenceMap, "Water Quality", DefaultGradients.Green),
				this.tiffService.getSvgGameBoard("/assets/images/Consequence_3_water_availability.tif", GameBoardType.ConsequenceMap, "Water Availability", DefaultGradients.Green),
				this.tiffService.getSvgGameBoard("/assets/images/Consequence_4_habitat_fragmentation.tif", GameBoardType.ConsequenceMap, "Habitat Fragmentation", DefaultGradients.Green),
			]).subscribe((gameBoards) => {
				const overlay = this.currentLevel.value!.gameBoards.find(o => o.gameBoardType == GameBoardType.DrawingMap)!;
				gameBoards.forEach(o => o.fields = overlay.fields);

				level2.gameBoards.push(...this.currentLevel.value!.gameBoards);
				level2.gameBoards.push(...gameBoards);
				level2.levelNumber = 2;
				
				this.productionTypes.value[0].consequenceMaps.push(...gameBoards);
				this.productionTypes.value[1].consequenceMaps.push(...gameBoards);
				
				this.selectedFields.value.forEach(o => o.updateScore());

				this.currentLevel.next(level2);
				this.selectedFields.next(this.selectedFields.value);
				this.loading(false);
			});
		}
	}

	initialiseSVGMode() {
		this.settings.value.mode = 'SVG';
		var level = new Level();
		this.levels.push(level);
		this.settings.value.imageMode = false;
		this.loading();
		var customColors = new CustomColors();
		customColors.set(2, "a8a800");
		customColors.set(3, "73b2ff");
		customColors.set(4, "70a800");
		customColors.set(5, "CCCCCC");
		customColors.set(6, "00734c");
		customColors.set(7, "828282");
		customColors.set(8, "98e600");
		customColors.set(15, "e69800");

		combineLatest([
			this.tiffService.getSvgGameBoard("/assets/images/hexagon_raster.tif", GameBoardType.DrawingMap, "Zonen", DefaultGradients.Blue),
			this.tiffService.getSvgGameBoard("/assets/images/suit_arable_ext_zone.tif", GameBoardType.SuitabilityMap, "Extensive Arable Land", DefaultGradients.Green),
			this.tiffService.getSvgGameBoard("/assets/images/suit_arable_int_zone.tif", GameBoardType.SuitabilityMap, "Intensive Arable Land", DefaultGradients.Blue),
			this.tiffService.getSvgGameBoard("/assets/images/suit_livestock_ext_zone.tif", GameBoardType.SuitabilityMap, "Extensive Livestock Land", DefaultGradients.Purple),
			this.tiffService.getSvgGameBoard("/assets/images/suit_livestock_int_zone.tif", GameBoardType.SuitabilityMap, "Intensive Livestock Land", DefaultGradients.Red),
			this.tiffService.getSvgGameBoard("/assets/images/land_use_only_raster.tif", GameBoardType.SuitabilityMap, "Intensive Livestock Land", undefined, customColors),
		]).subscribe((gameBoards) => {
			const overlay = gameBoards.find(o => o.gameBoardType == GameBoardType.DrawingMap)!;
			gameBoards.forEach(o => o.fields = overlay.fields);


			this.productionTypes.value.push(new ProductionType("#f8cbad", gameBoards[1], "Extensives Ackerland"));
			this.productionTypes.value.push(new ProductionType("#843c0c", gameBoards[2], "Intensives Ackerland"));
			this.productionTypes.value.push(new ProductionType("#fbe5d6", gameBoards[3], "Extensive Viehzucht"));
			this.productionTypes.value.push(new ProductionType("#c55a11", gameBoards[4], "Intensive Viehzucht"));
			setTimeout(() => {
				this.selectedProductionType.next(this.productionTypes.value[0]);
			});

			level.gameBoards.push(...gameBoards);
			level.levelNumber = 1;

			this.currentLevel.next(level);
			this.focusedGameBoard.next(gameBoards.find(o => o.gameBoardType == GameBoardType.DrawingMap)!);
			this.loading(false);
		});

	}

	initialiseGridMode() {
		this.settings.value.mode = 'GRID';
		this.loading();
		let level = new Level();
		this.levels.push(level);
		this.settings.value.imageMode = true;
		
		combineLatest([
			this.tiffService.getGridGameBoard("./assets/images/esgame_img_ag.tif", DefaultGradients.Green, GameBoardType.SuitabilityMap, "Ackerland"), 
			this.tiffService.getGridGameBoard("./assets/images/esgame_img_ranch.tif", DefaultGradients.Orange, GameBoardType.SuitabilityMap, "Viehzucht")
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
			this.loading(false);
		});

	}

	openHelp(close = false) { this.helpWindow.next(!close); }

	loading(show = true) { 
		if (show) {
			this.loadingIndicator.value.push(true);
		} else {
			this.loadingIndicator.value.pop();
		}
		this.loadingIndicator.next(this.loadingIndicator.value);
	}


	resetGame() {
		this.currentLevel.next(null);
		this.highlightFields.next([]);
		this.selectedFields.next([]);
		this.currentlySelectedField.next(null);
		this.productionTypes.next([]);
		this.selectedProductionType.next(null);
		this.focusedGameBoard.next(null);
		this.levels = [];
	}

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
}
