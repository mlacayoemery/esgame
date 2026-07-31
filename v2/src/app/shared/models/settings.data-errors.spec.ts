import { Settings } from './settings';

// Every deployment writes its own data.json by hand, so a field being absent is an ordinary
// mistake. What it used to produce was "Cannot read properties of undefined (reading 'map')" —
// which names neither the field nor the file, and is identical for six different omissions.

const translateStub = (langs: string[] = ['en']): any => ({
	getLangs: () => langs,
	setTranslation: () => { },
});

const full = () => ({
	title: { en: 'T' }, mapMode: 'svg', elementSize: 1, gameBoardColumns: 4, gameBoardRows: 4,
	basicInstructions: { en: 'b' }, advancedInstructions: { en: 'a' },
	productionTypes: [{ id: 1, name: { en: 'A' }, fieldColor: '#f00', urlToIcon: '', maxElements: 0 }],
	customColors: [],
	maps: [{ id: 'm', name: { en: 'M' }, gameBoardType: 'Suitability', urlToData: 'x.tif', productionTypes: [1] }],
});

const without = (path: string) => {
	const d: any = full();
	if (path === 'maps[0].productionTypes') delete d.maps[0].productionTypes;
	else delete d[path];
	return d;
};

describe('Settings with a required field missing', () => {
	// The control. Everything below has to be the difference the omission makes.
	it('accepts a complete data file', () => {
		expect(() => new Settings(translateStub(), full())).not.toThrow();
	});

	for (const [field, expected] of [
		['productionTypes', 'productionTypes'],
		['maps', 'maps'],
		['maps[0].productionTypes', 'maps[0] (id "m").productionTypes'],
	] as const) {
		it(`names ${field}`, () => {
			expect(() => new Settings(translateStub(), without(field)))
				.toThrowError(new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
		});
	}

	it('reports every missing field at once, not just the first', () => {
		const d: any = full();
		delete d.productionTypes;
		delete d.maps;

		expect(() => new Settings(translateStub(), d)).toThrowError(/productionTypes.*maps|maps.*productionTypes/s);
	});
});

// Missing TEXT is a different matter: a label with no translation is a blank label, not a dead
// game. These used to take the whole app down with the same opaque message.
describe('Settings with missing text', () => {
	let errors: string[];
	beforeEach(() => {
		errors = [];
		vi.spyOn(console, 'error').mockImplementation((...a: any[]) => { errors.push(a.map(String).join(' ')); });
	});
	afterEach(() => vi.restoreAllMocks());

	for (const field of ['title', 'basicInstructions', 'advancedInstructions']) {
		it(`renders without ${field} and says the label is blank`, () => {
			const d: any = full();
			delete d[field];

			expect(() => new Settings(translateStub(), d)).not.toThrow();
			expect(errors.join(' ')).toContain(field);
		});
	}

	it('names a map whose own name is missing', () => {
		const d: any = full();
		delete d.maps[0].name;

		expect(() => new Settings(translateStub(), d)).not.toThrow();
		expect(errors.join(' ')).toContain('maps["m"].name');
	});

	it('says nothing when every label is present', () => {
		new Settings(translateStub(), full());

		expect(errors).toEqual([]);
	});
});
