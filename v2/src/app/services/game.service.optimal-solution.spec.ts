import { of, throwError } from 'rxjs';
import { GameService } from './game.service';

// Loading the recorded best board.
//
// The answer file is produced by tools/optimizer/optimize.py and pinned by its own tests, so what
// is worth guarding here is the OTHER half: that the game applies it the way a player's clicks
// would, replaces rather than adds, and survives every way the file can be wrong — because it is
// fetched at runtime from a URL the deployment names, and nothing checks it belongs to this board.

const translateStub: any = { getLangs: () => [], setTranslation: () => { } };
const scoreStub: any = { createEmptyScoreEntry: () => [], calculateScore: () => { } };

const tiffStub: any = {
	getGridGameBoard: (id: any, url: string, _g: any, t: any) =>
		of({ id, gameBoardType: t, urlToData: url, fields: [], getScore: () => 0 }),
};

const data = (extra: any = {}) => JSON.parse(JSON.stringify({
	title: { en: 'T' },
	mapMode: 'grid',
	elementSize: 2,
	gameBoardColumns: 28,
	gameBoardRows: 29,
	calcUrl: '',
	optimalSolutionUrl: './assets/optimal.json',
	productionTypes: [
		{ id: '10', name: { en: 'Arable' }, fieldColor: '#fff', urlToIcon: 'corn.png', maxElements: 4 },
		{ id: '20', name: { en: 'Livestock' }, fieldColor: '#f80', urlToIcon: 'cow.png', maxElements: 4 },
	],
	maps: [
		{ id: '2', name: { en: 'Arable' }, gameBoardType: 'Suitability', gradient: 'green', urlToData: 'ag.tif', productionTypes: ['10'] },
		{ id: '3', name: { en: 'Livestock' }, gameBoardType: 'Suitability', gradient: 'orange', urlToData: 'ranch.tif', productionTypes: ['20'] },
	],
	customColors: [],
	...extra,
}));

/** Answers one GET, and records what was asked for. */
const makeApi = (response: any, fail = false) => {
	const gets: string[] = [];
	return {
		gets,
		stub: {
			getRequest: (url: string) => {
				gets.push(url);
				return fail ? throwError(() => new Error('404')) : of(response);
			},
			postRequest: () => of({}),
		} as any,
	};
};

const answer = {
	rounds: {
		'1': { score: 100, pieces: [{ productionType: '10', id: 73 }, { productionType: '20', id: 236 }] },
	},
};

function build(api: any, extra: any = {}) {
	const service = new GameService(tiffStub, scoreStub, translateStub, api);
	service.loadSettings(data(extra));
	service.initialiseGridMode();
	return service;
}

describe('loading the recorded optimal answer', () => {
	let warnings: string[], errors: string[];
	beforeEach(() => {
		warnings = []; errors = [];
		vi.spyOn(console, 'warn').mockImplementation((...a: any[]) => { warnings.push(a.join(' ')); });
		vi.spyOn(console, 'error').mockImplementation((...a: any[]) => { errors.push(a.join(' ')); });
	});

	it('places every recorded piece, as a footprint rather than a single cell', () => {
		const api = makeApi(answer);
		const service = build(api.stub);

		service.loadOptimalSolution();

		let fields: any[] = [];
		service.selectedFieldsObs.subscribe(f => fields = f);
		expect(api.gets).toEqual(['./assets/optimal.json']);
		expect(fields.length).toBe(2);
		// elementSize 2 on a 28-wide board: the anchor and its three neighbours.
		expect(fields[0].fields.map((f: any) => f.id)).toEqual([73, 101, 74, 102]);
		expect(fields.map((f: any) => String(f.productionType.id))).toEqual(['10', '20']);
	});

	it('replaces the board rather than adding to it', () => {
		// Adding would exceed maxElements and leave a mixture of two boards. Placing a piece first
		// and checking the count afterwards is what tells the two apart.
		const api = makeApi(answer);
		const service = build(api.stub);
		service.setSelectedProductionType((service as any).productionTypes.value[0]);
		service.selectField(500);

		let fields: any[] = [];
		service.selectedFieldsObs.subscribe(f => fields = f);
		expect(fields.length, 'the hand-placed piece').toBe(1);

		service.loadOptimalSolution();
		expect(fields.length).toBe(2);
		expect(fields.some((f: any) => f.fields.some((c: any) => c.id == 500)),
			'the hand-placed piece must be gone, not kept alongside').toBe(false);
	});

	it('does nothing at all when the deployment configures no answer', () => {
		const api = makeApi(answer);
		const service = build(api.stub, { optimalSolutionUrl: undefined });

		service.loadOptimalSolution();

		expect(api.gets, 'nothing to fetch, so nothing fetched').toEqual([]);
	});

	it('leaves the board alone, and says so, when the round has no recorded answer', () => {
		const api = makeApi({ rounds: { '2': answer.rounds['1'] } });
		const service = build(api.stub);

		let fields: any[] = [];
		service.selectedFieldsObs.subscribe(f => fields = f);
		service.loadOptimalSolution();

		expect(fields.length).toBe(0);
		expect(warnings.join(' ')).toContain('round 1');
	});

	it('skips a piece naming a production type this game does not define', () => {
		const api = makeApi({
			rounds: { '1': { score: 0, pieces: [{ productionType: '99', id: 73 }, { productionType: '10', id: 100 }] } },
		});
		const service = build(api.stub);

		let fields: any[] = [];
		service.selectedFieldsObs.subscribe(f => fields = f);
		service.loadOptimalSolution();

		expect(fields.length, 'the piece it could resolve still lands').toBe(1);
		expect(errors.join(' ')).toContain('"99"');
	});

	it('survives an answer file that is missing or unreadable', () => {
		const api = makeApi(null, true);
		const service = build(api.stub);

		let fields: any[] = [];
		service.selectedFieldsObs.subscribe(f => fields = f);
		expect(() => service.loadOptimalSolution()).not.toThrow();

		expect(fields.length).toBe(0);
		expect(errors.join(' ')).toContain('./assets/optimal.json');
	});
});
