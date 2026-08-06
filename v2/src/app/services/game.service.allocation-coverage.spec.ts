import { of } from 'rxjs';
import { GameService } from './game.service';
import { CalculationResult } from '../shared/models/calculation-result';

// The round scores, and the scores may have nothing to do with what the player did.
//
// raster::reclassify() ignores any id that is not in the base raster — no warning, no error — so
// an allocation in the wrong id space comes back 200, with a full set of consequence maps and five
// finite scores that are IDENTICAL every round. The raster committed to this repository is exactly
// that case against the real board: 4 ids in common out of 465, i.e. 1%.
//
// tools/R has measured this since 2026-07-31 and only logged it, which reaches whoever reads the
// container's stdout — not the person running the workshop. The calculator now returns the numbers
// and these specs cover what the game does with them.

const settingsData = {
	title: { en: 'T' },
	mapMode: 'svg',
	elementSize: 1,
	gameBoardColumns: 4,
	gameBoardRows: 4,
	calcUrl: 'http://calc.example/esgame',
	productionTypes: [],
	customColors: [{ id: 'cc', colors: [{ number: 0, color: '#000000' }, { number: 1, color: '#ffffff' }] }],
	maps: [
		{ id: '-3', gameBoardType: 'Drawing', urlToData: 'drawing.tif', productionTypes: [] },
		{ id: '-2', gameBoardType: 'Background', urlToData: 'bg.tif', customColorId: 'cc', productionTypes: [] },
		{ id: '11', gameBoardType: 'Consequence', urlToData: 'c11.tif', productionTypes: [] }
	]
};

const resultsOnly = [
	{ name: 'HH.tif', id: '11', score: 0.1, url: 'http://gs/wcs?coverageId=ws:HH' },
	{ name: 'S.png', id: '-1', score: 0, url: 'http://calc/images/S.png' }
];

const translateStub: any = { getLangs: () => [], setTranslation: () => { } };
const scoreStub: any = { createEmptyScoreEntry: () => [], calculateScore: () => { } };

/** A service wired to a calculator that answers with `response`, ready to play a round. */
const makeService = (response: CalculationResult) => {
	const tiffStub: any = {
		getOverlayGameBoard: (id: any, url: string, t: any) => of({ id, gameBoardType: t, urlToData: url }),
		getSvgBackground: () => of({ id: 'bg' }),
		getSvgGameBoard: (id: any, url: string, t: any) => of({ id, gameBoardType: t, urlToData: url })
	};
	const apiStub: any = { postRequest: () => of(response) };
	const service = new GameService(tiffStub, scoreStub, translateStub, apiStub);
	service.loadSettings(JSON.parse(JSON.stringify(settingsData)));
	service.initialiseSVGMode();
	return service;
};

describe('GameService allocation coverage', () => {
	let alertSpy: any;
	beforeEach(() => {
		// alert() is not implemented in jsdom and would log an error per call.
		alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => { });
		vi.spyOn(console, 'error').mockImplementation(() => { });
	});
	afterEach(() => vi.restoreAllMocks());

	it('warns when most of the allocation never reached the model', () => {
		// The real committed-raster case: 4 of 465.
		const service = makeService({
			results: resultsOnly,
			allocationCoverage: { allocated: 465, matched: 4, fraction: 4 / 465 }
		});

		service.goToNextLevel();

		expect(alertSpy).toHaveBeenCalledTimes(1);
	});

	it('says how much was ignored, rather than that something went wrong', () => {
		const service = makeService({
			results: resultsOnly,
			allocationCoverage: { allocated: 465, matched: 4, fraction: 4 / 465 }
		});

		service.goToNextLevel();

		// The numbers are the whole point — a generic "something went wrong" would send someone
		// looking at the network tab instead of at which base map the backend mounted.
		const message = alertSpy.mock.calls[0][0] as string;
		expect(message).toContain('1%');
		expect(message).toContain('4 of 465');
	});

	it('stays silent when the calculator does not report coverage', () => {
		// Only esgame's own tools/R sends the field; places carries its own calculation.r. Absent
		// must mean "not reported", never "nothing matched" — this is the assertion that stops a
		// quiet backend being accused of ignoring the round.
		const service = makeService({ results: resultsOnly });

		service.goToNextLevel();

		expect(alertSpy).not.toHaveBeenCalled();
	});

	it('stays silent on a round the model really used', () => {
		const service = makeService({
			results: resultsOnly,
			allocationCoverage: { allocated: 455, matched: 455, fraction: 1 }
		});

		service.goToNextLevel();

		expect(alertSpy).not.toHaveBeenCalled();
	});

	it('warns once per game, not once per round', () => {
		// It is a deployment mismatch, not a per-round event: it cannot change between rounds, and
		// repeating it every time is how people learn to dismiss a dialog without reading it.
		const service = makeService({
			results: resultsOnly,
			allocationCoverage: { allocated: 465, matched: 4, fraction: 4 / 465 }
		});

		service.goToNextLevel();
		service.goToNextLevel();
		service.goToNextLevel();

		expect(alertSpy).toHaveBeenCalledTimes(1);
	});

	it('owes the warning again after a new game is loaded', () => {
		const service = makeService({
			results: resultsOnly,
			allocationCoverage: { allocated: 465, matched: 4, fraction: 4 / 465 }
		});
		service.goToNextLevel();
		expect(alertSpy).toHaveBeenCalledTimes(1);

		// A new game may be a new backend, so a still-set flag would hide a real mismatch.
		service.loadSettings(JSON.parse(JSON.stringify(settingsData)));
		service.initialiseSVGMode();
		service.goToNextLevel();

		expect(alertSpy).toHaveBeenCalledTimes(2);
	});

	it('does not treat a malformed fraction as a failed round', () => {
		// jsonlite can hand back a string, and NaN >= 0.5 is false — which would have made every
		// round from a backend with a broken diagnostic look like an ignored one.
		const service = makeService({
			results: resultsOnly,
			allocationCoverage: { allocated: 465, matched: 4, fraction: NaN }
		});

		service.goToNextLevel();

		expect(alertSpy).not.toHaveBeenCalled();
	});
});
