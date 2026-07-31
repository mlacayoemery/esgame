import { firstValueFrom, of } from 'rxjs';
import { GameService } from './game.service';
import { CalculationResult } from '../shared/models/calculation-result';

// A deployment writes its own data.json, and the ids inside it are cross-references: a map's
// `productionTypes` lists ids that must exist in the top-level `productionTypes`. Nothing checks
// that, and the place it is dereferenced asserts non-null:
//
//   currentPt.find(c => c.id == ptId)!.consequenceMaps.push(map)
//
// So an id that does not exist is a crash — not at load, but later, when the player navigates
// between levels. The board is already on screen and working by then.

const translateStub: any = { getLangs: () => [], setTranslation: () => { } };
const scoreStub: any = { createEmptyScoreEntry: () => [], calculateScore: () => { } };
const tiffStub: any = {
	getOverlayGameBoard: (id: any, url: string, t: any) => of({ id, gameBoardType: t, urlToData: url, fields: [] }),
	getSvgBackground: () => of('data:'),
	getSvgGameBoard: (id: any, url: string, t: any) => of({ id, gameBoardType: t, urlToData: url, fields: [] }),
};

const settingsWith = (consequenceProductionTypes: number[]) => ({
	title: { en: 'T' }, mapMode: 'svg', elementSize: 1,
	gameBoardColumns: 4, gameBoardRows: 4, infiniteLevels: true,
	productionTypes: [{ id: 1, name: { en: 'A' }, fieldColor: '#f00', urlToIcon: '', maxElements: 0 }],
	customColors: [{ id: 'cc', colors: [{ number: 0, color: '#000000' }] }],
	maps: [
		{ id: '-3', gameBoardType: 'Drawing', urlToData: 'drawing.tif', productionTypes: [] },
		{ id: '-2', gameBoardType: 'Background', urlToData: 'bg.tif', customColorId: 'cc', productionTypes: [] },
		{ id: '11', gameBoardType: 'Consequence', urlToData: 'c11.tif', productionTypes: consequenceProductionTypes },
	],
});

const resultFor = (round: number): CalculationResult => ({
	results: [
		{ name: `HH_r${round}.tif`, id: '11', score: 0.1, url: `http://gs/wcs?coverageId=ws_round${round}:HH` },
		{ name: `S_r${round}.png`, id: '-1', score: undefined as any, url: `http://calc/S_r${round}.png` }
	]
});

describe('GameService with a map referencing an unknown production type', () => {
	let alerts: string[];
	let errors: string[];
	beforeEach(() => {
		alerts = []; errors = [];
		vi.spyOn(window, 'alert').mockImplementation((m?: any) => { alerts.push(String(m)); });
		vi.spyOn(console, 'error').mockImplementation((...a: any[]) => { errors.push(a.map(String).join(' ')); });
	});
	afterEach(() => vi.restoreAllMocks());

	const twoLevels = (ptIds: number[]) => {
		const service = new GameService(tiffStub, scoreStub, translateStub, {} as any);
		service.loadSettings(JSON.parse(JSON.stringify(settingsWith(ptIds))));
		service.initialiseSVGMode();
		service.prepareNextLevel(resultFor(1), 40);   // level 2 exists and is current
		return service;
	};

	// The control. Everything below must be the difference the bad id makes, not the harness.
	it('navigates back and forth normally when the ids all resolve', async () => {
		const service = twoLevels([1]);

		service.goToPreviousLevel();
		service.goToNextLevel();

		expect(errors).toEqual([]);
		expect((await firstValueFrom(service.currentLevelObs))!.levelNumber).toBe(2);
	});

	it('does not crash navigating to the previous level', () => {
		const service = twoLevels([99]);

		expect(() => service.goToPreviousLevel()).not.toThrow();
	});

	it('does not crash navigating forward again', () => {
		const service = twoLevels([99]);
		service.goToPreviousLevel();

		expect(() => service.goToNextLevel()).not.toThrow();
	});

	// Going back alone does not reach it: level 1 has no consequence boards, so the loop body
	// never runs. It is stepping back and then FORWARD that rebuilds level 2's lists, which is
	// why this hid — the crash needed two navigations, not one.
	it('says which id is unresolved rather than failing silently', () => {
		const service = twoLevels([99]);

		service.goToPreviousLevel();
		service.goToNextLevel();

		expect(errors.join(' ')).toContain('99');
		expect(errors.join(' ')).toContain('does not define');
	});

	it('names a board whose id is not in the game data at all', () => {
		const service = twoLevels([1]);
		// The other assertion in that helper: a level showing a board id `maps` does not contain.
		(service as any).settings.value.maps = (service as any).settings.value.maps
			.filter((m: any) => m.id !== '11');

		service.goToPreviousLevel();
		service.goToNextLevel();

		expect(errors.join(' ')).toContain('no map with id "11"');
	});
});
