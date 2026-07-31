import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { LevelBaseComponent } from './level-base.component';
import { GameBoardType } from '../shared/models/game-board-type';

// LevelBaseComponent is the shared half of both game modes — grid and svg both extend it — so
// its observables decide what appears on either side of the board in every deployment. It is
// abstract, hence the throwaway subclass; everything else is the real class.

class TestLevel extends LevelBaseComponent {
	constructor(gameService: any) { super(gameService); }
}

const board = (id: string, gameBoardType: GameBoardType) => ({ id, gameBoardType }) as any;

const setup = () => {
	const level = new BehaviorSubject<any>(null);
	const selectedProductionType = new BehaviorSubject<any>(null);
	const focusedGameBoard = new BehaviorSubject<any>(null);
	const productionTypes = new BehaviorSubject<any[]>([]);
	const selectedBoards: any[] = [];
	const calls: string[] = [];
	const gameStub: any = {
		currentLevelObs: level,
		selectedProductionTypeObs: selectedProductionType,
		focusedGameBoardObs: focusedGameBoard,
		productionTypesObs: productionTypes,
		selectGameBoard: (b: any) => selectedBoards.push(b),
		goToNextLevel: () => calls.push('next'),
		goToPreviousLevel: () => calls.push('prev'),
		openHelp: () => calls.push('help')
	};
	return {
		level, selectedProductionType, focusedGameBoard, productionTypes, selectedBoards, calls,
		// LevelBaseComponent's constructor now uses takeUntilDestroyed, which needs a context.
		make: () => TestBed.runInInjectionContext(() => new TestLevel(gameStub))
	};
};

describe('LevelBaseComponent', () => {

	describe('readOnly', () => {
		it('is false before a level exists', async () => {
			const { level, make } = setup();
			const c = make();

			await firstValueFrom(c.level);

			expect(c.readOnly).toBe(false);
			expect(level.value).toBeNull();
		});

		// Previous levels are frozen once a round is submitted; this is what stops a player
		// editing history.
		it('follows the level it is given', async () => {
			const { level, make } = setup();
			const c = make();

			level.next({ isReadOnly: true, gameBoards: [] });
			await firstValueFrom(c.level);
			expect(c.readOnly).toBe(true);

			level.next({ isReadOnly: false, gameBoards: [] });
			await firstValueFrom(c.level);
			expect(c.readOnly).toBe(false);
		});
	});

	describe('leftGameBoards', () => {
		it('shows only the suitability maps', async () => {
			const { level, make } = setup();
			const c = make();
			level.next({
				gameBoards: [
					board('s1', GameBoardType.SuitabilityMap),
					board('c1', GameBoardType.ConsequenceMap),
					board('d', GameBoardType.DrawingMap),
					board('s2', GameBoardType.SuitabilityMap)
				]
			});

			expect((await firstValueFrom(c.leftGameBoards))!.map((b: any) => b.id)).toEqual(['s1', 's2']);
		});

		it('is undefined before a level exists', async () => {
			const c = setup().make();

			expect(await firstValueFrom(c.leftGameBoards)).toBeUndefined();
		});
	});

	describe('rightGameBoards', () => {
		// Consequence maps are hidden until a round has been played — showConsequenceMaps is the
		// flag prepareNextLevel sets. Without it the player would see the answer before choosing.
		it('is empty while the level hides consequence maps', async () => {
			const { level, selectedProductionType, make } = setup();
			const c = make();
			selectedProductionType.next({ consequenceMaps: [board('c1', GameBoardType.ConsequenceMap)] });
			level.next({ showConsequenceMaps: false, gameBoards: [] });

			expect(await firstValueFrom(c.rightGameBoards)).toEqual([]);
		});

		it('shows the selected type\'s consequence maps once the level reveals them', async () => {
			const { level, selectedProductionType, make } = setup();
			const c = make();
			selectedProductionType.next({ consequenceMaps: [board('c1', GameBoardType.ConsequenceMap)] });
			level.next({ showConsequenceMaps: true, gameBoards: [] });

			expect((await firstValueFrom(c.rightGameBoards))!.map((b: any) => b.id)).toEqual(['c1']);
		});

		it('is empty when no production type is selected', async () => {
			const { level, make } = setup();
			const c = make();
			level.next({ showConsequenceMaps: true, gameBoards: [] });

			expect(await firstValueFrom(c.rightGameBoards)).toBeUndefined();
		});
	});

	describe('focusedGameBoard', () => {
		it('skips the initial null rather than emitting it', async () => {
			const { focusedGameBoard, make } = setup();
			const c = make();
			const seen: any[] = [];
			c.focusedGameBoard.subscribe(b => seen.push(b));

			focusedGameBoard.next(board('b1', GameBoardType.SuitabilityMap));

			expect(seen.map(b => b.id)).toEqual(['b1']);
		});
	});

	describe('wiring', () => {
		// Picking a production type focuses its suitability map, so the main board shows what the
		// choice is being judged against.
		it('focuses the suitability map of the chosen production type', () => {
			const { selectedProductionType, selectedBoards, make } = setup();
			make();
			const suitabilityMap = board('s1', GameBoardType.SuitabilityMap);

			selectedProductionType.next({ suitabilityMap, consequenceMaps: [] });

			expect(selectedBoards).toEqual([suitabilityMap]);
		});

		it('does not focus anything when the selection is cleared', () => {
			const { selectedProductionType, selectedBoards, make } = setup();
			make();

			selectedProductionType.next(null);

			expect(selectedBoards).toEqual([]);
		});

		it('tracks the available production types', () => {
			const { productionTypes, make } = setup();
			const c = make();
			const types = [{ id: 1 }, { id: 2 }] as any;

			productionTypes.next(types);

			expect(c.productionTypes).toBe(types);
		});

		it('delegates the level controls to the service', () => {
			const { calls, make } = setup();
			const c = make();

			c.nextLevel();
			c.prevLevel();
			c.openHelp();

			expect(calls).toEqual(['next', 'prev', 'help']);
		});
	});
});
