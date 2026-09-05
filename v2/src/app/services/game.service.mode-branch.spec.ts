import { of } from 'rxjs';
import { GameService } from './game.service';
import { GameBoardType } from '../shared/models/game-board-type';

// Which mode talks to a backend, and which does not.
//
// goToNextLevel used to branch on `calcUrl` alone, which made the BACKEND the mode switch. The
// docs say the opposite — "Static: calcUrl is empty, so GameService.goToNextLevel never makes a
// request" (docs/static-vs-dynamic.rst) — but nothing enforced the emptiness that sentence assumes.
//
// config.json carries calcUrl and defaultMode as independent keys and docker-entrypoint.sh injects
// them independently, so "static mode with a calculator configured" is a state a deployment can
// reach by setting one env var and not the other. v2/docker-compose.dynamic.yml reached it, and on
// 2026-09-02 round 2 of the CLIENT-SIDE grid game POSTed to the R calculator, got 404 from a path
// it does not serve, and showed "Something went wrong, please try again later" — on a game whose
// every number was already in the browser.
//
// The GRID branch of prepareNextLevel never reads the CalculationResult. So that POST could only
// ever cost the round; it could not improve it.

const translateStub: any = { getLangs: () => [], setTranslation: () => { } };
const scoreStub: any = { createEmptyScoreEntry: () => [], calculateScore: () => { } };

const gridData = {
	title: { en: 'T' },
	mapMode: 'grid',
	elementSize: 1,
	gameBoardColumns: 4,
	gameBoardRows: 4,
	// A backend IS configured. That is the whole point: the game must ignore it in GRID mode.
	calcUrl: 'http://calculator.example/esgame',
	productionTypes: [{ id: '10', name: { en: 'Arable' }, fieldColor: '#fff', urlToIcon: 'i.png', maxElements: 4 }],
	maps: [
		{ id: '2', name: { en: 'Arable' }, gameBoardType: 'Suitability', gradient: 'green', urlToData: 'ag.tif', productionTypes: ['10'] },
		{ id: '4', name: { en: 'Carbon' }, gameBoardType: 'Consequence', gradient: 'yellow', urlToData: 'ag_carbon.tif', productionTypes: ['10'] }
	],
	customColors: []
};

const svgData = {
	title: { en: 'T' },
	mapMode: 'svg',
	elementSize: 1,
	gameBoardColumns: 4,
	gameBoardRows: 4,
	calcUrl: 'http://calculator.example/esgame',
	productionTypes: [],
	customColors: [{ id: 'cc', colors: [{ number: 0, color: '#000000' }, { number: 1, color: '#ffffff' }] }],
	maps: [
		{ id: '-3', gameBoardType: 'Drawing', urlToData: 'drawing.tif', productionTypes: [] },
		{ id: '-2', gameBoardType: 'Background', urlToData: 'bg.tif', customColorId: 'cc', productionTypes: [] },
		{ id: '11', gameBoardType: 'Consequence', urlToData: 'c11.tif', productionTypes: [] }
	]
};

const tiffStub: any = {
	getGridGameBoard: (id: any, url: string, _g: any, t: any) =>
		of({ id, gameBoardType: t, urlToData: url, fields: [] }),
	getOverlayGameBoard: (id: any, url: string, t: any) => of({ id, gameBoardType: t, urlToData: url }),
	getSvgBackground: () => of({ id: 'bg' }),
	getSvgGameBoard: (id: any, url: string, t: any) => of({ id, gameBoardType: t, urlToData: url })
};

/** Records every POST rather than stubbing one away, so "it did not call the backend" is observed. */
const makeApiStub = () => {
	const posts: { url: string, body: any }[] = [];
	return {
		posts,
		stub: {
			postRequest: (url: string, body: any) => {
				posts.push({ url, body });
				return of({ results: [{ name: 'HH.tif', id: '11', score: 50, url: 'http://gs/wcs?c=HH' }] });
			}
		} as any
	};
};

describe('which mode calls the calculation backend', () => {
	let alerts: string[];
	beforeEach(() => {
		// The failure paths use alert(); a real one would hang the runner.
		alerts = [];
		vi.spyOn(window, 'alert').mockImplementation((m?: any) => { alerts.push(String(m)); });
	});

	it('does not POST from the grid game, even with calcUrl configured', () => {
		const api = makeApiStub();
		const service = new GameService(tiffStub, scoreStub, translateStub, api.stub);
		service.loadSettings(JSON.parse(JSON.stringify(gridData)));
		service.initialiseGridMode();

		service.goToNextLevel();

		expect(api.posts.length,
			'the client-side grid game must not depend on a backend it never reads').toBe(0);
	});

	it('still advances the grid game to the next level', () => {
		// The other half of the assertion above: not calling the backend must not mean not
		// advancing. A round that quietly does nothing would satisfy "no POST" too.
		const api = makeApiStub();
		const service = new GameService(tiffStub, scoreStub, translateStub, api.stub);
		service.loadSettings(JSON.parse(JSON.stringify(gridData)));
		service.initialiseGridMode();

		let level: any = null;
		service.currentLevelObs.subscribe(l => level = l);
		expect(level.levelNumber).toBe(1);

		service.goToNextLevel();

		expect(level.levelNumber, 'round 2 must be reachable offline').toBe(2);
		// And it is a real level 2: the consequence board is what round 2 reveals.
		expect(level.gameBoards.some((b: any) => b.gameBoardType == GameBoardType.ConsequenceMap),
			'level 2 shows the consequence maps').toBe(true);
	});

	it('does POST from the dynamic game', () => {
		// Guards the fix from over-reaching: SVG mode is where the backend IS the scoring.
		const api = makeApiStub();
		const service = new GameService(tiffStub, scoreStub, translateStub, api.stub);
		service.loadSettings(JSON.parse(JSON.stringify(svgData)));
		service.initialiseSVGMode();

		service.goToNextLevel();

		expect(api.posts.length, 'the dynamic game scores on the backend').toBe(1);
		expect(api.posts[0].url).toBe('http://calculator.example/esgame');
	});

	it('posts to calcUrl exactly as configured, appending no path of its own', () => {
		// Why the deployment's calcUrl must carry the calculator's route: nothing here adds one.
		// The two calculators in this repository serve different paths on purpose (tools/R serves
		// /esgame, the FastAPI example serves "/"), so the app cannot know one to append.
		const api = makeApiStub();
		const data = { ...JSON.parse(JSON.stringify(svgData)), calcUrl: 'http://calculator.example' };
		const service = new GameService(tiffStub, scoreStub, translateStub, api.stub);
		service.loadSettings(data);
		service.initialiseSVGMode();

		service.goToNextLevel();

		expect(api.posts[0].url).toBe('http://calculator.example');
	});

	it('tells the player when the dynamic game has no backend configured', () => {
		const api = makeApiStub();
		const data = { ...JSON.parse(JSON.stringify(svgData)), calcUrl: '' };
		const service = new GameService(tiffStub, scoreStub, translateStub, api.stub);
		service.loadSettings(data);
		service.initialiseSVGMode();

		service.goToNextLevel();

		expect(api.posts.length).toBe(0);
		expect(alerts).toEqual(['This game needs a calculation backend, and none is configured.']);
	});
});

// ---------------------------------------------------------------------------------------------
// The other half of the axis: a GRID game that IS scored by a calculator.
//
// Unit selection and type of data are independent characteristics (docs/static-vs-dynamic.rst),
// and until 2026-09-05 the grid + dynamic combination did not exist -- goToNextLevel POSTed only
// in SVG mode, and the GRID branch of prepareNextLevel never read a CalculationResult. These pin
// the new behaviour AND the reason it is opt-in: the tests above must keep passing unchanged, so
// a dataset that says nothing still cannot be turned into a backend game by a stray env var.

const gridDynamicData = {
	...gridData,
	// The dataset asks for it. Without this line the game is the one the tests above describe.
	backendScored: true,
};

/** Answers with the id of THIS dataset's consequence map, as a real calculator must. */
const makeMatchingApiStub = (score = 0.5) => {
	const posts: { url: string, body: any }[] = [];
	return {
		posts,
		stub: {
			postRequest: (url: string, body: any) => {
				posts.push({ url, body });
				return of({ results: [{ name: 'carbon.tif', id: '4', score, url: 'http://gs/wcs?c=carbon_round2' }] });
			}
		} as any
	};
};

describe('a raster-grid game scored by a calculator', () => {
	beforeEach(() => { vi.spyOn(window, 'alert').mockImplementation(() => { }); });

	it('POSTs when the dataset asks for it', () => {
		const api = makeMatchingApiStub();
		const service = new GameService(tiffStub, scoreStub, translateStub, api.stub);
		service.loadSettings(JSON.parse(JSON.stringify(gridDynamicData)));
		service.initialiseGridMode();

		service.goToNextLevel();

		expect(api.posts.length, 'backendScored is what asks for the round to be scored').toBe(1);
		expect(api.posts[0].url).toBe('http://calculator.example/esgame');
		expect(Array.isArray(api.posts[0].body.allocation)).toBe(true);
		expect(api.posts[0].body.round).toBe(1);
	});

	it('builds round 2 from the raster the calculator returned, not from the one that shipped', () => {
		const api = makeMatchingApiStub();
		const service = new GameService(tiffStub, scoreStub, translateStub, api.stub);
		service.loadSettings(JSON.parse(JSON.stringify(gridDynamicData)));
		service.initialiseGridMode();

		let level: any = null;
		service.currentLevelObs.subscribe(l => level = l);
		service.goToNextLevel();

		const consequence = level.gameBoards.find((b: any) => b.gameBoardType == GameBoardType.ConsequenceMap);
		expect(consequence, 'round 2 shows the consequence map').toBeTruthy();
		expect(consequence.urlToData,
			'the whole point of a dynamic round: this raster is the round\'s output')
			.toBe('http://gs/wcs?c=carbon_round2');
	});

	it('records the calculator\'s scores for the score board and the chart', () => {
		const api = makeMatchingApiStub(0.5);
		const service = new GameService(tiffStub, scoreStub, translateStub, api.stub);
		service.loadSettings(JSON.parse(JSON.stringify(gridDynamicData)));
		service.initialiseGridMode();

		let level: any = null;
		service.currentLevelObs.subscribe(l => level = l);
		service.goToNextLevel();

		expect(level.indicatorScores).toEqual([{ id: '4', score: 0.5 }]);
		// Same convention as the SVG path, because it is the same method: costs are negative and
		// scaled by 100, with the round's own production total under the id "all".
		expect(level.scores.find((s: any) => s.id == '4').score).toBe(-50);
		expect(level.scores.some((s: any) => s.id == 'all')).toBe(true);
	});

	it('replaces the previous round\'s consequence boards rather than accumulating them', () => {
		// The bug the SVG branch already had to fix. A third round that kept round 2's boards
		// would show two Carbon maps, one of them stale, and the stale one would still be on the
		// production type.
		const api = makeMatchingApiStub();
		const service = new GameService(tiffStub, scoreStub, translateStub, api.stub);
		service.loadSettings(JSON.parse(JSON.stringify(gridDynamicData)));
		service.initialiseGridMode();

		let level: any = null;
		service.currentLevelObs.subscribe(l => level = l);
		service.goToNextLevel();
		service.goToNextLevel();

		expect(level.levelNumber).toBe(3);
		const consequences = level.gameBoards.filter((b: any) => b.gameBoardType == GameBoardType.ConsequenceMap);
		expect(consequences.length, 'one Carbon board, this round\'s').toBe(1);
	});

	it('leaves the score board live when the game scores itself as well', () => {
		// clientScored means the browser is already recomputing from selectedFields on every
		// click; freezing level.scores to the submitted round would stop that.
		const api = makeMatchingApiStub();
		const service = new GameService(tiffStub, scoreStub, translateStub, api.stub);
		service.loadSettings(JSON.parse(JSON.stringify({ ...gridDynamicData, clientScored: true })));
		service.initialiseGridMode();

		let level: any = null;
		service.currentLevelObs.subscribe(l => level = l);
		service.goToNextLevel();

		expect(api.posts.length, 'the maps still come from the calculator').toBe(1);
		expect(level.scores, 'but the numbers stay the browser\'s').toBeUndefined();
	});
});
