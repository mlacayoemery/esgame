import { firstValueFrom, of } from 'rxjs';
import { GameService } from './game.service';
import { GameBoardType } from '../shared/models/game-board-type';
import { CalculationResult } from '../shared/models/calculation-result';

// Multi-round behaviour of the dynamic (SVG) game.
//
// This is the path a real game takes after the first submission and it had no coverage at all:
// the calculator's response is consumed by prepareNextLevel, which writes the returned WCS URLs
// back into the map settings and re-fetches each one as a GeoTIFF for the board. Everything here
// drives the real method; only the two collaborators that would do I/O are faked.
//
// Why it matters that it is *multi*-round: `settings.maps` is mutated in place, so round 2 has to
// overwrite round 1's urlToData. If it did not, the board would keep re-rendering the first
// round's consequence maps for the rest of the game while the scores moved — which looks like a
// working game.

const translateStub: any = { getLangs: () => [], setTranslation: () => { } };

// Records every URL the board was asked to fetch, so a test can assert on what was requested
// rather than on internal state.
const fetched: string[] = [];
const tiffStub: any = {
	getOverlayGameBoard: (id: any, url: string, gameBoardType: any) => of({ id, gameBoardType, urlToData: url }),
	getSvgBackground: () => of({ id: 'bg' }),
	getSvgGameBoard: (id: any, url: string, gameBoardType: any) => {
		fetched.push(url);
		return of({ id, gameBoardType, urlToData: url });
	}
};
const scoreStub: any = {
	createEmptyScoreEntry: () => [],
	calculateScore: () => { }
};

const settingsData = {
	title: { en: 'T' },
	mapMode: 'svg',
	elementSize: 1,
	gameBoardColumns: 4,
	gameBoardRows: 4,
	productionTypes: [],
	customColors: [{ id: 'cc', colors: [{ number: 0, color: '#000000' }, { number: 1, color: '#ffffff' }] }],
	maps: [
		// gameBoardType is the STRING the config file uses; Settings converts it to the enum.
		{ id: '-3', gameBoardType: 'Drawing', urlToData: 'drawing.tif', productionTypes: [] },
		{ id: '-2', gameBoardType: 'Background', urlToData: 'bg.tif', customColorId: 'cc', productionTypes: [] },
		{ id: '11', gameBoardType: 'Consequence', urlToData: 'stale-11.tif', productionTypes: [] },
		{ id: '22', gameBoardType: 'Consequence', urlToData: 'stale-22.tif', productionTypes: [] }
	]
};

// Shaped exactly like what tools/R returns: string ids, a spider plot at id "-1".
const resultFor = (round: number, scores: Record<string, number> = { '11': 0.13, '22': 0.17 }): CalculationResult => ({
	results: [
		{ name: `HH_r${round}.tif`, id: '11', score: scores['11'], url: `http://gs/wcs?coverageId=ws_round${round}:HH` },
		{ name: `NP_r${round}.tif`, id: '22', score: scores['22'], url: `http://gs/wcs?coverageId=ws_round${round}:NP` },
		{ name: `Spider_r${round}.png`, id: '-1', score: undefined as any, url: `http://calc/images/Spider_r${round}.png` }
	]
});

const newService = () => {
	const service = new GameService(tiffStub, scoreStub, translateStub, {} as any);
	service.loadSettings(settingsData);
	service.initialiseSVGMode();
	return service;
};

const currentLevel = (service: GameService) => firstValueFrom(service.currentLevelObs);

describe('GameService multi-round (SVG)', () => {
	let service: GameService;

	beforeEach(() => {
		fetched.length = 0;
		// loadSettings takes the object by reference and prepareNextLevel mutates map.urlToData,
		// so each test needs its own copy or round 1 of one test leaks into the next.
		service = new GameService(tiffStub, scoreStub, translateStub, {} as any);
		service.loadSettings(JSON.parse(JSON.stringify(settingsData)));
		service.initialiseSVGMode();
	});

	it('fetches the coverage URLs the calculator returned', async () => {
		service.prepareNextLevel(resultFor(1), 40);

		expect(fetched).toContain('http://gs/wcs?coverageId=ws_round1:HH');
		expect(fetched).toContain('http://gs/wcs?coverageId=ws_round1:NP');
	});

	it('never re-fetches the placeholder URLs from settings', async () => {
		service.prepareNextLevel(resultFor(1), 40);

		expect(fetched).not.toContain('stale-11.tif');
		expect(fetched).not.toContain('stale-22.tif');
	});

	it('uses round 2 URLs in round 2, not round 1 (settings.maps is mutated in place)', async () => {
		service.prepareNextLevel(resultFor(1), 40);
		fetched.length = 0;

		service.prepareNextLevel(resultFor(2), 55);

		expect(fetched).toContain('http://gs/wcs?coverageId=ws_round2:HH');
		expect(fetched).not.toContain('http://gs/wcs?coverageId=ws_round1:HH');
	});

	it('advances the level number on every round', async () => {
		const start = (await currentLevel(service))!.levelNumber;

		service.prepareNextLevel(resultFor(1), 40);
		const afterFirst = (await currentLevel(service))!.levelNumber;
		service.prepareNextLevel(resultFor(2), 55);
		const afterSecond = (await currentLevel(service))!.levelNumber;

		expect(afterFirst).toBe(start + 1);
		expect(afterSecond).toBe(start + 2);
	});

	it('freezes the previous level so an earlier round cannot be edited', async () => {
		const first = (await currentLevel(service))!;

		service.prepareNextLevel(resultFor(1), 40);

		expect(first.isReadOnly).toBe(true);
		expect((await currentLevel(service))!.isReadOnly).toBe(false);
	});

	it('carries the running score plus one entry per indicator', async () => {
		service.prepareNextLevel(resultFor(1), 40);

		const scores = (await currentLevel(service))!.scores;
		expect(scores.find(s => s.id === 'all')!.score).toBe(40);
		expect(scores.map(s => s.id).sort()).toEqual(['11', '22', 'all']);
	});

	it('keeps each round\'s own score rather than reusing the first', async () => {
		service.prepareNextLevel(resultFor(1), 40);
		const firstAll = (await currentLevel(service))!.scores.find(s => s.id === 'all')!.score;

		service.prepareNextLevel(resultFor(2), 55);
		const secondAll = (await currentLevel(service))!.scores.find(s => s.id === 'all')!.score;

		expect(firstAll).toBe(40);
		expect(secondAll).toBe(55);
	});

	it('takes the spider plot from the id -1 result', async () => {
		service.prepareNextLevel(resultFor(2), 55);

		expect((await currentLevel(service))!.scoreImage).toBe('http://calc/images/Spider_r2.png');
	});

	it('does not leave a consequence board from the previous round on the new level', async () => {
		service.prepareNextLevel(resultFor(1), 40);
		service.prepareNextLevel(resultFor(2), 55);

		const boards = (await currentLevel(service))!.gameBoards
			.filter(b => b.gameBoardType == GameBoardType.ConsequenceMap);
		// Two consequence maps are configured; carrying the previous level's over would double them.
		expect(boards.length).toBe(2);
	});

	// The calculator returns NaN for every indicator when the allocation misses the base raster
	// (see docs/reference/calculator.rst). The frontend coerces that to 0 — so a round the model
	// could not score at all is presented as a real score, and nothing distinguishes it from a
	// genuine zero. This pins the current behaviour so it changes deliberately, not by accident.
	it('shows NaN scores as zero rather than surfacing them', async () => {
		service.prepareNextLevel(resultFor(1, { '11': NaN, '22': NaN }), 40);

		const scores = (await currentLevel(service))!.scores;
		// toBeCloseTo, not toBe: the coerced 0 is then negated by -(score * 100), giving -0,
		// and Object.is(-0, 0) is false. The sign is asserted separately below.
		expect(scores.find(s => s.id === '11')!.score).toBeCloseTo(0);
		expect(scores.find(s => s.id === '22')!.score).toBeCloseTo(0);
		expect(scores.every(s => !isNaN(s.score))).toBe(true);
	});

	it('produces negative zero for an unscored indicator', async () => {
		// Worth knowing rather than worth fixing here: -0 formats as "-0" in some number
		// formatters, so an unscoreable round can surface to the player as a minus sign.
		service.prepareNextLevel(resultFor(1, { '11': NaN, '22': NaN }), 40);

		const score = (await currentLevel(service))!.scores.find(s => s.id === '11')!.score;
		expect(Object.is(score, -0)).toBe(true);
	});
});
