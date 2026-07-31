import { firstValueFrom, of } from 'rxjs';
import { GameService } from './game.service';

// Each production type is drawn against the suitability map that lists its id. Which map that is
// came from a doubly-asserted lookup, so a production type no map lists was a crash — inside a
// subscribe, where rxjs rethrows asynchronously. Nothing caught it, the caller saw no error, and
// the loop stopped where it was: that production type and EVERY ONE AFTER IT vanished from the
// palette, with a working-looking board.

const translateStub: any = { getLangs: () => [], setTranslation: () => { } };
const scoreStub: any = { createEmptyScoreEntry: () => [], calculateScore: () => { } };
const tiffStub: any = {
	getOverlayGameBoard: (id: any, u: string, t: any) => of({ id, gameBoardType: t, urlToData: u, fields: [] }),
	getSvgBackground: () => of('data:'),
	getSvgGameBoard: (id: any, u: string, t: any) => of({ id, gameBoardType: t, urlToData: u, fields: [] }),
};

const settings = (suitabilityMaps: { id: string, productionTypes: number[] }[]) => ({
	title: { en: 'T' }, mapMode: 'svg', elementSize: 1, gameBoardColumns: 4, gameBoardRows: 4,
	productionTypes: [1, 2, 3].map(id => ({
		id, name: { en: `pt${id}` }, fieldColor: '#ff0000', urlToIcon: '', maxElements: 0
	})),
	customColors: [{ id: 'cc', colors: [{ number: 0, color: '#000000' }] }],
	maps: [
		{ id: '-3', gameBoardType: 'Drawing', urlToData: 'd.tif', productionTypes: [] },
		{ id: '-2', gameBoardType: 'Background', urlToData: 'b.tif', customColorId: 'cc', productionTypes: [] },
		...suitabilityMaps.map(m => ({ ...m, gameBoardType: 'Suitability', urlToData: `${m.id}.tif` })),
	],
});

describe('GameService production types without a suitability map', () => {
	let errors: string[];
	beforeEach(() => {
		errors = [];
		vi.spyOn(window, 'alert').mockImplementation(() => { });
		vi.spyOn(console, 'error').mockImplementation((...a: any[]) => { errors.push(a.map(String).join(' ')); });
	});
	afterEach(() => vi.restoreAllMocks());

	const start = (maps: { id: string, productionTypes: number[] }[]) => {
		const service = new GameService(tiffStub, scoreStub, translateStub, {} as any);
		service.loadSettings(JSON.parse(JSON.stringify(settings(maps))));
		service.initialiseSVGMode();
		return service;
	};

	// The control: with every id covered, all three must appear. Everything below is the
	// difference the missing map makes, not the harness dropping types on its own.
	it('creates every production type when each is listed by a map', async () => {
		const service = start([{ id: 's1', productionTypes: [1, 2, 3] }]);

		expect((await firstValueFrom(service.productionTypesObs)).map(p => p.id)).toEqual([1, 2, 3]);
		expect(errors).toEqual([]);
	});

	// The regression. Type 2 is listed by nothing; 1 and 3 are fine. Before the fix the loop
	// stopped at 2 and 3 was lost with it.
	it('keeps the production types that do have a map', async () => {
		const service = start([{ id: 's1', productionTypes: [1] }, { id: 's3', productionTypes: [3] }]);

		expect((await firstValueFrom(service.productionTypesObs)).map(p => p.id)).toEqual([1, 3]);
	});

	it('says which production type was left out, and why', async () => {
		const service = start([{ id: 's1', productionTypes: [1] }, { id: 's3', productionTypes: [3] }]);
		await firstValueFrom(service.productionTypesObs);

		expect(errors.join(' ')).toContain('Production type 2');
		expect(errors.join(' ')).toContain('SuitabilityMap');
	});
});
