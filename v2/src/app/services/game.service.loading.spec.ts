import { firstValueFrom, of, throwError } from 'rxjs';
import { GameService } from './game.service';
import { GameBoardType } from '../shared/models/game-board-type';
import { CalculationResult } from '../shared/models/calculation-result';

// The loading indicator is a push/pop counter: loading() pushes, loading(false) pops, and the
// spinner shows while the array is non-empty. prepareNextLevel pushes on entry and pops in the
// subscribe body — so anything that makes the observable error instead of emit left the counter
// pushed and the spinner up forever, over a board still showing the previous level.
//
// That is not hypothetical: the dynamic game's five consequence rasters are not in the build, so
// in offline dynamic mode every round hit exactly this. Observed in a browser before the fix —
// spinner visible, level still 1, no error shown, nothing dismissable.

const translateStub: any = { getLangs: () => [], setTranslation: () => { } };
const scoreStub: any = { createEmptyScoreEntry: () => [], calculateScore: () => { } };

const settingsData = {
	title: { en: 'T' },
	mapMode: 'svg',
	elementSize: 1,
	gameBoardColumns: 4,
	gameBoardRows: 4,
	productionTypes: [],
	customColors: [{ id: 'cc', colors: [{ number: 0, color: '#000000' }, { number: 1, color: '#ffffff' }] }],
	maps: [
		{ id: '-3', gameBoardType: 'Drawing', urlToData: 'drawing.tif', productionTypes: [] },
		{ id: '-2', gameBoardType: 'Background', urlToData: 'bg.tif', customColorId: 'cc', productionTypes: [] },
		{ id: '11', gameBoardType: 'Consequence', urlToData: 'c11.tif', productionTypes: [] }
	]
};

const result: CalculationResult = {
	results: [
		{ name: 'HH.tif', id: '11', score: 0.1, url: 'http://gs/wcs?coverageId=ws:HH' },
		{ name: 'S.png', id: '-1', score: 0, url: 'http://calc/images/S.png' }
	]
};

// getSvgGameBoard is what fetches and decodes a consequence raster — the call that 404s.
const makeService = (opts: { failBoard?: boolean, failBackground?: boolean, failInit?: boolean } = {}) => {
	// initialiseSVGMode fetches the background too, so failing it outright would break startup
	// rather than the round. Succeed once (init), fail afterwards — unless failInit is set, which
	// is how the startup path itself gets tested.
	let backgroundCalls = 0;
	const tiffStub: any = {
		getOverlayGameBoard: (id: any, url: string, t: any) => of({ id, gameBoardType: t, urlToData: url }),
		getSvgBackground: () => {
			backgroundCalls += 1;
			const fail = opts.failInit || (opts.failBackground && backgroundCalls > 1);
			return fail ? throwError(() => new Error('404 background')) : of({ id: 'bg' });
		},
		getSvgGameBoard: (id: any, url: string, t: any) => opts.failBoard
			? throwError(() => new Error('404 consequence raster'))
			: of({ id, gameBoardType: t, urlToData: url })
	};
	const service = new GameService(tiffStub, scoreStub, translateStub, {} as any);
	service.loadSettings(JSON.parse(JSON.stringify(settingsData)));
	service.initialiseSVGMode();
	return service;
};

const isLoading = (service: GameService) =>
	firstValueFrom(service.loadingIndicatorObs).then(a => a.length > 0);

describe('GameService loading indicator', () => {
	// alert() is not implemented in jsdom and would log an error per call.
	let alertSpy: any;
	beforeEach(() => {
		alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => { });
		vi.spyOn(console, 'error').mockImplementation(() => { });
	});
	afterEach(() => vi.restoreAllMocks());

	it('stops loading once a level is built', async () => {
		const service = makeService();

		service.prepareNextLevel(result, 40);

		expect(await isLoading(service)).toBe(false);
	});

	it('stops loading when a consequence raster fails to load', async () => {
		const service = makeService({ failBoard: true });

		service.prepareNextLevel(result, 40);

		expect(await isLoading(service)).toBe(false);
	});

	it('stops loading when the background fails to load', async () => {
		const service = makeService({ failBackground: true });

		service.prepareNextLevel(result, 40);

		expect(await isLoading(service)).toBe(false);
	});

	it('tells the player something went wrong rather than failing silently', async () => {
		const service = makeService({ failBoard: true });

		service.prepareNextLevel(result, 40);

		expect(alertSpy).toHaveBeenCalled();
	});

	it('does not advance the level when building it failed', async () => {
		const service = makeService({ failBoard: true });
		const before = (await firstValueFrom(service.currentLevelObs))!.levelNumber;

		service.prepareNextLevel(result, 40);

		expect((await firstValueFrom(service.currentLevelObs))!.levelNumber).toBe(before);
	});

	// Same defect, earlier: initialiseSVGMode/initialiseGridMode also push the counter and pop it
	// only in the subscribe body, so a raster missing at STARTUP left the spinner up over an empty
	// board — before the player had done anything at all.
	it('stops loading when the game fails to initialise', async () => {
		const service = makeService({ failInit: true });

		expect(await isLoading(service)).toBe(false);
		expect(alertSpy).toHaveBeenCalled();
	});

	it('leaves no residual loading after several failed rounds', async () => {
		const service = makeService({ failBoard: true });

		service.prepareNextLevel(result, 40);
		service.prepareNextLevel(result, 50);
		service.prepareNextLevel(result, 60);

		expect(await isLoading(service)).toBe(false);
	});
});
