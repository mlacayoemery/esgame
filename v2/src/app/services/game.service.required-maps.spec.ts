import { firstValueFrom, of } from 'rxjs';
import { GameService } from './game.service';

// "One image, any deployment" is the point of this app: a site supplies its own data.json. So a
// data.json that omits a map the code requires is a configuration mistake someone will make, and
// what they get told about it is the whole experience of getting it wrong.
//
// initialiseSVGMode does:
//
//   const drawingMap = settings.maps.find(o => o.gameBoardType == DrawingMap)!;
//   ...getOverlayGameBoard(drawingMap.id, drawingMap.urlToData, ...)
//
// The `!` is a lie when the map is absent, and the next line reads a property of undefined.

const translateStub: any = { getLangs: () => [], setTranslation: () => { } };
const scoreStub: any = { createEmptyScoreEntry: () => [], calculateScore: () => { } };
const tiffStub: any = {
	getOverlayGameBoard: (id: any, url: string, t: any) => of({ id, gameBoardType: t, urlToData: url }),
	getSvgBackground: () => of({ id: 'bg' }),
	getSvgGameBoard: (id: any, url: string, t: any) => of({ id, gameBoardType: t, urlToData: url }),
	getGridGameBoard: (id: any, url: string, t: any) => of({ id, gameBoardType: t, urlToData: url }),
};

const base = {
	title: { en: 'T' }, mapMode: 'svg', elementSize: 1,
	gameBoardColumns: 4, gameBoardRows: 4,
	productionTypes: [],
	customColors: [{ id: 'cc', colors: [{ number: 0, color: '#000' }] }],
	maps: [
		{ id: '-3', gameBoardType: 'Drawing', urlToData: 'drawing.tif', productionTypes: [] },
		{ id: '-2', gameBoardType: 'Background', urlToData: 'bg.tif', customColorId: 'cc', productionTypes: [] },
	],
};

const withMaps = (maps: any[]) => ({ ...base, maps });

describe('GameService required maps', () => {
	let alerts: string[];
	let errors: string[];
	beforeEach(() => {
		alerts = []; errors = [];
		vi.spyOn(window, 'alert').mockImplementation((m?: any) => { alerts.push(String(m)); });
		vi.spyOn(console, 'error').mockImplementation((...a: any[]) => { errors.push(a.map(String).join(' ')); });
	});
	afterEach(() => vi.restoreAllMocks());

	const make = (data: any) => {
		const service = new GameService(tiffStub, scoreStub, translateStub, {} as any);
		service.loadSettings(JSON.parse(JSON.stringify(data)));
		return service;
	};

	it('starts normally when both required maps are present', () => {
		const service = make(base);

		service.initialiseSVGMode();

		expect(alerts).toEqual([]);
	});

	for (const [missing, maps] of [
		['Drawing', base.maps.filter(m => m.gameBoardType !== 'Drawing')],
		['Background', base.maps.filter(m => m.gameBoardType !== 'Background')],
	] as const) {
		it(`names the missing ${missing} map instead of throwing on undefined`, async () => {
			const service = make(withMaps([...maps]));

			service.initialiseSVGMode();

			// The message has to name the map type. "Cannot read properties of undefined
			// (reading 'urlToData')" does not tell a deployer what to add to data.json.
			expect(errors.join(' ')).toContain(missing);
			expect(alerts.length).toBeGreaterThan(0);
			// And it must not leave the spinner up over a board that will never arrive.
			await expect(firstValueFrom(service.loadingIndicatorObs).then(a => a.length > 0))
				.resolves.toBe(false);
		});
	}
});
