import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, switchMap, tap } from 'rxjs';
import { GameBoard } from '../shared/models/game-board';
import { GameBoardType } from '../shared/models/game-board-type';
import { Level } from '../shared/models/level';
import { Settings } from '../shared/models/settings';
import { ProductionType } from '../shared/models/production-type';
import { HighlightField, HighlightSide, SelectedField } from '../shared/models/field';
import { TiffService } from './tiff.service';
import { CustomColors, DefaultGradients } from '../shared/helpers/gradients';
import { ScoreService } from './score.service';
import { TranslateService } from '@ngx-translate/core';

@Injectable({
	providedIn: 'root'
})
export class GameService {
	private currentLevel = new BehaviorSubject<Level | null>(null);
	private highlightFields = new BehaviorSubject<HighlightField[]>([]);
	private selectedFields = new BehaviorSubject<SelectedField[]>([]);
	private currentlySelectedField = new BehaviorSubject<SelectedField | null>(null);
	private settings = new BehaviorSubject<Settings>(new Settings(this.translateService));
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
		private scoreService: ScoreService,
		private translateService: TranslateService
	) { }

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
		var results = this.selectedFields.value.map((o) => ({ id: o.fields[0].id, lulc: o.productionType.id }));
		//TODO: send result if needed
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
		var level = new Level();
		level.showConsequenceMaps = true;
		this.levels.push(level);

		this.currentLevel.value!.isReadOnly = true;
		this.currentLevel.value!.selectedFields = this.selectedFields.value.map(o => {
			return Object.assign({}, o);
		});

		if (this.settings.value.mode == 'GRID') {
			combineLatest([
				this.tiffService.getGridGameBoard("/assets/images/esgame_img_ag_carbon.tif", DefaultGradients.Yellow, GameBoardType.ConsequenceMap),
				this.tiffService.getGridGameBoard("/assets/images/esgame_img_ag_habitat.tif", DefaultGradients.Purple, GameBoardType.ConsequenceMap),
				this.tiffService.getGridGameBoard("/assets/images/esgame_img_ag_water.tif", DefaultGradients.Blue, GameBoardType.ConsequenceMap),
				this.tiffService.getGridGameBoard("/assets/images/esgame_img_ag_hunt.tif", DefaultGradients.Red, GameBoardType.ConsequenceMap),
				this.tiffService.getGridGameBoard("/assets/images/esgame_img_ranch_carbon.tif", DefaultGradients.Yellow, GameBoardType.ConsequenceMap),
				this.tiffService.getGridGameBoard("/assets/images/esgame_img_ranch_habitat.tif", DefaultGradients.Purple, GameBoardType.ConsequenceMap),
				this.tiffService.getGridGameBoard("/assets/images/esgame_img_ranch_water.tif", DefaultGradients.Blue, GameBoardType.ConsequenceMap),
				this.tiffService.getGridGameBoard("/assets/images/esgame_img_ranch_hunt.tif", DefaultGradients.Red, GameBoardType.ConsequenceMap),
			]).subscribe((gameBoards) => {
				level.gameBoards.push(...this.currentLevel.value!.gameBoards);
				level.gameBoards.push(...gameBoards);
				level.levelNumber = 2;

				// TODO: Nicht über Array
				this.productionTypes.value[0].consequenceMaps.push(...gameBoards.slice(0, 4));
				this.productionTypes.value[1].consequenceMaps.push(...gameBoards.slice(4, 8));

				this.selectedFields.value.forEach(o => o.updateScore());

				this.currentLevel.next(level);
				this.selectedFields.next(this.selectedFields.value);
				this.loading(false);
			});
		} else if (this.settings.value.mode == 'SVG') {
			const settings = this.settings.value;


			const previousLevel = this.currentLevel.value!;

			const overlay = this.currentLevel.value!.gameBoards.find(o => o.gameBoardType == GameBoardType.DrawingMap)!;
			const backgroundMap = settings.maps.find(o => o.gameBoardType == GameBoardType.BackgroundMap)!;

			var customColors = new CustomColors();
			customColors.set(2, "a8a800");
			customColors.set(3, "73b2ff");
			customColors.set(4, "70a800");
			customColors.set(5, "CCCCCC");
			customColors.set(6, "00734c");
			customColors.set(7, "828282");
			customColors.set(8, "98e600");
			customColors.set(15, "00000000");

			let settingsLevel = settings.levels.at(this.currentLevel.value!.levelNumber);
			if (settingsLevel == undefined) {
				settingsLevel = settings.levels[settings.levels.length - 1];
			}
			const otherMaps = settings.maps.filter(
				m =>m.id in settingsLevel!.maps &&  
					(m.gameBoardType == GameBoardType.SuitabilityMap || m.gameBoardType == GameBoardType.ConsequenceMap) &&
					!previousLevel.gameBoards.map(o => o.id).includes(m.id));

			level.gameBoards.push(...previousLevel.gameBoards);
			level.levelNumber = previousLevel.levelNumber + 1;

			combineLatest([
				this.tiffService.getSvgBackground(backgroundMap.urlToData, customColors),
				...otherMaps.map(m => { return this.getSvg(m, overlay) })]).subscribe(([background, ...gameBoards]) => {
					gameBoards.forEach(o => {
						o.background2 = background;
					});

					level.gameBoards.push(...gameBoards);
					level.showConsequenceMaps = true;
					this.productionTypes.value.forEach(c => c.consequenceMaps.push(...gameBoards.filter(c => c.gameBoardType == GameBoardType.ConsequenceMap)));

					this.selectedFields.value.forEach(o => o.updateScore());

					this.currentLevel.next(level);
					this.selectedFields.next(this.selectedFields.value);
					this.loading(false);
				});
		}
	}

	getSvg = (m: any, overlay: GameBoard) => this.tiffService.getSvgGameBoard(m.id, m.urlToData, m.gameBoardType, m.gradient, overlay);

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
		customColors.set(15, "00000000");

		const settings = this.settings.value;
		const currentLevel = settings.levels[0];
		const drawingMap = settings.maps.find(o => o.gameBoardType == GameBoardType.DrawingMap)!;
		const backgroundMap = settings.maps.find(o => o.gameBoardType == GameBoardType.BackgroundMap)!;
		const otherMaps = settings.maps.filter(m => m.id in currentLevel.maps && (m.gameBoardType == GameBoardType.SuitabilityMap || m.gameBoardType == GameBoardType.ConsequenceMap));

		this.tiffService.getOverlayGameBoard(drawingMap.id, drawingMap.urlToData, GameBoardType.DrawingMap).pipe(
			switchMap(overlay => {
				level.gameBoards.push(overlay);
				return combineLatest(
					[	this.tiffService.getSvgBackground(backgroundMap.urlToData, customColors),
						...otherMaps.map(m => { return this.getSvg(m, overlay) }),]
				);
			})
		).subscribe(([background, ...gameBoards]) => {

			gameBoards.forEach(o => {
				o.background2 = background;
			});

			for (let i = 0; i < settings.productionTypes.length; i++) {
				const current = settings.productionTypes[i];
				const gameBoard = gameBoards.find(g => g.id == otherMaps.find(m => m.linkedToProductionTypes.includes(current.id))!.id)!;
				const productionType = new ProductionType(i * 10 + 10, current.fieldColor, gameBoard, current.image, current.maxElements);
				this.productionTypes.value.push(productionType);
			}

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
			this.tiffService.getGridGameBoard("./assets/images/esgame_img_ag.tif", DefaultGradients.Green, GameBoardType.SuitabilityMap),
			this.tiffService.getGridGameBoard("./assets/images/esgame_img_ranch.tif", DefaultGradients.Orange, GameBoardType.SuitabilityMap)
		]).subscribe(([gameBoard, gameBoard2]) => {
			level.gameBoards.push(gameBoard);
			level.gameBoards.push(gameBoard2);
			level.levelNumber = 1;

			this.productionTypes.value.push(new ProductionType(10, "#FFF", gameBoard, "http://esgame.unige.ch/images/corn.png"));
			this.productionTypes.value.push(new ProductionType(20, "#FFF", gameBoard2, "http://esgame.unige.ch/images/cow.png"));
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
