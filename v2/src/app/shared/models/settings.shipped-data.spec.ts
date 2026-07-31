import { Settings } from './settings';
import dataJson from '../../../assets/data.json';
import dataGridExampleJson from '../../../assets/dataGridExample.json';

// The guards added on 2026-07-31 all report problems in a deployment's data file. Nothing loaded
// THIS repository's own data files through them — so the first one to fire did so on a correct
// configuration, and only because I happened to open the running game and read the console:
//
//   The game data asks for gradient "custom", which does not exist. Falling back to blue.
//
// "custom" is the marker a map uses to say its colours come from customColorId. A guard that
// cries wolf on the shipped data is worse than no guard: it teaches people to ignore the ones
// that matter.

const translateStub = (langs: string[] = ['en']): any => ({
	getLangs: () => langs,
	setTranslation: () => { },
});

// Imported rather than hand-copied, so this tracks the real files.

const dataFiles: [string, any][] = [
	['data.json', dataJson],
	['dataGridExample.json', dataGridExampleJson],
];

describe('the data files shipped in this repository', () => {
	let errors: string[];
	beforeEach(() => {
		errors = [];
		vi.spyOn(console, 'error').mockImplementation((...a: any[]) => { errors.push(a.map(String).join(' ')); });
	});
	afterEach(() => vi.restoreAllMocks());

	for (const [name, data] of dataFiles) {
		it(`${name} loads without a single complaint`, () => {
			expect(() => new Settings(translateStub(), JSON.parse(JSON.stringify(data)))).not.toThrow();
			expect(errors).toEqual([]);
		});

		it(`${name} keeps every map's gradient marker intact`, () => {
			const s = new Settings(translateStub(), JSON.parse(JSON.stringify(data)));

			// A map written `custom` must stay `custom` — defaulting it to a real gradient would
			// make a custom-coloured map look like it asked for one.
			data.maps.forEach((m: any, i: number) => {
				if (m.gradient) expect(s.maps[i].gradient).toBe(m.gradient);
			});
		});
	}
});
