import { ConfiguratorComponent } from './configurator.component';
// Pulled in so the compiler has the component's NgModule scope; its template uses
// routerLink, the translate pipe and Material directives that ConfiguratorModule supplies.
import './configurator.module';

// The configurator builds the reactive form that produces a game configuration, and
// imports one back from a file. It was the largest untested unit in the app, and a bug
// in the import path silently loses whatever a teacher had built.
//
// The component only touches TranslateService.getLangs(), so it is instantiated plainly
// (same style as score.service.spec.ts) rather than through TestBed.
const translateStub = (langs: string[] = ['en', 'de']): any => ({ getLangs: () => langs });
const newComponent = (langs?: string[]) => new ConfiguratorComponent(translateStub(langs));

describe('ConfiguratorComponent form scaffolding', () => {
	it('creates one control per registered language for every translatable field', () => {
		const c = newComponent(['en', 'de', 'nl']);

		for (const field of ['title', 'basicInstructions', 'advancedInstructions']) {
			expect(Object.keys(c.formGroup.get(field)!.value).sort()).toEqual(['de', 'en', 'nl']);
		}
	});

	it('copes with no languages registered', () => {
		const c = newComponent([]);

		expect(c.formGroup.get('title')!.value).toEqual({});
	});
});

describe('ConfiguratorComponent map mode', () => {
	// mapMode is wired to toggleMapMode through valueChanges, so setting the control is
	// what a user does and is what these assert against.
	it('defaults to svg, with the grid-only fields disabled', () => {
		const c = newComponent();

		expect(c.formGroup.get('mapMode')!.value).toBe('svg');
		expect(c.formGroup.get('elementSize')!.disabled).toBe(true);
		expect(c.formGroup.get('gameBoardRows')!.disabled).toBe(true);
		expect(c.formGroup.get('gameBoardColumns')!.disabled).toBe(true);
		// svg scores through a backend, so calcUrl and the value range are live
		expect(c.formGroup.get('calcUrl')!.enabled).toBe(true);
		expect(c.formGroup.get('minValue')!.enabled).toBe(true);
		expect(c.formGroup.get('maxValue')!.enabled).toBe(true);
		expect(c.formGroup.get('infiniteLevels')!.value).toBe(true);
	});

	it('switching to grid flips which fields are live and resets their values', () => {
		const c = newComponent();

		c.formGroup.get('mapMode')!.setValue('grid');

		expect(c.formGroup.get('elementSize')!.enabled).toBe(true);
		expect(c.formGroup.get('gameBoardRows')!.enabled).toBe(true);
		expect(c.formGroup.get('gameBoardColumns')!.enabled).toBe(true);
		// grid scores client-side, so there is no backend and no configurable range
		expect(c.formGroup.get('calcUrl')!.disabled).toBe(true);
		expect(c.formGroup.get('minSelected')!.disabled).toBe(true);
		expect(c.formGroup.get('minSelected')!.value).toBe(0);
		expect(c.formGroup.get('minValue')!.value).toBe(0);
		expect(c.formGroup.get('maxValue')!.value).toBe(100);
		expect(c.formGroup.get('infiniteLevels')!.value).toBe(false);
	});

	it('switching back to svg restores the svg field set', () => {
		const c = newComponent();

		c.formGroup.get('mapMode')!.setValue('grid');
		c.formGroup.get('mapMode')!.setValue('svg');

		expect(c.formGroup.get('elementSize')!.disabled).toBe(true);
		expect(c.formGroup.get('elementSize')!.value).toBe(1);
		expect(c.formGroup.get('calcUrl')!.enabled).toBe(true);
		expect(c.formGroup.get('infiniteLevels')!.value).toBe(true);
	});
});

describe('ConfiguratorComponent collections', () => {
	it('numbers maps and production types as it adds them', () => {
		const c = newComponent();

		c.addMap();
		c.addMap();
		c.addProductionType();
		c.addProductionType();

		expect(c.maps.controls.map(m => m.get('id')!.value)).toEqual([10, 20]);
		expect(c.productionTypes.controls.map(p => p.get('id')!.value)).toEqual([11, 22]);
	});

	it('removes a map by index', () => {
		const c = newComponent();
		c.addMap();
		c.addMap();

		c.removeMap(0);

		expect(c.maps.length).toBe(1);
		expect(c.maps.controls[0].get('id')!.value).toBe(20);
	});

	it('removes a production type by index', () => {
		const c = newComponent();
		c.addProductionType();
		c.addProductionType();

		c.removeProductionType(0);

		expect(c.productionTypes.length).toBe(1);
		expect(c.productionTypes.controls[0].get('id')!.value).toBe(22);
	});

	it('enables customColorId only while a map uses the custom gradient', () => {
		const c = newComponent();
		c.addMap();
		const map = c.maps.controls[0];

		expect(map.get('customColorId')!.disabled).toBe(true);

		map.get('gradient')!.setValue('custom');
		expect(map.get('customColorId')!.enabled).toBe(true);

		map.get('gradient')!.setValue('blue');
		expect(map.get('customColorId')!.disabled).toBe(true);
	});

	it('gives a new colour set one colour, or none when asked for an empty one', () => {
		const c = newComponent();

		c.addCustomColors();
		expect(c.getColorsArray(c.customColors.controls[0]).length).toBe(1);

		c.addCustomColors(true);
		expect(c.getColorsArray(c.customColors.controls[1]).length).toBe(0);
	});

	it('adds and removes individual colours within a set', () => {
		const c = newComponent();
		c.addCustomColors();
		const set = c.customColors.controls[0];

		c.addColor(set);
		c.addColor(set);
		expect(c.getColorsArray(set).length).toBe(3);

		c.removeColor(set, 1);
		expect(c.getColorsArray(set).length).toBe(2);

		c.removeColorSet(0);
		expect(c.customColors.length).toBe(0);
	});

	it('gives every colour set a distinct id', () => {
		const c = newComponent();

		c.addCustomColors();
		c.addCustomColors();

		const ids = c.customColors.controls.map(s => s.get('id')!.value);
		expect(ids[0]).toBeTruthy();
		expect(ids[0]).not.toBe(ids[1]);
	});
});

describe('ConfiguratorComponent import', () => {
	// Reads a File the way the template does. FileReader.onload is async and there is no
	// hook to await, so the caller supplies the condition that means the import landed.
	const importInto = (c: ConfiguratorComponent, value: unknown, done: () => boolean) => {
		const file = new File([JSON.stringify(value)], 'configuration.json', { type: 'application/json' });
		c.onFileSelected({ target: { files: [file] } } as unknown as Event);
		return new Promise<void>((resolve, reject) => {
			const started = Date.now();
			const tick = () => {
				if (done()) return resolve();
				if (Date.now() - started > 5000) return reject(new Error('import did not complete'));
				setTimeout(tick, 10);
			};
			tick();
		});
	};

	it('rebuilds the maps, production types and colour sets an exported file describes', async () => {
		const source = newComponent();
		source.formGroup.get('mapMode')!.setValue('grid');
		source.addMap();
		source.addMap();
		source.addProductionType();
		source.addCustomColors();
		source.formGroup.get('gameBoardColumns')!.setValue(12);
		source.formGroup.get('title')!.patchValue({ en: 'My Game' });
		const exported = source.formGroup.getRawValue();

		// A fresh configurator starts with all three collections empty.
		const target = newComponent();
		expect([target.maps.length, target.productionTypes.length, target.customColors.length]).toEqual([0, 0, 0]);

		await importInto(target, exported, () => target.maps.length === 2);

		expect(target.maps.length).toBe(2);
		expect(target.productionTypes.length).toBe(1);
		expect(target.customColors.length).toBe(1);
		expect(target.formGroup.get('gameBoardColumns')!.value).toBe(12);
		expect(target.formGroup.get('title')!.value.en).toBe('My Game');
	});

	it('imports a config with no collections without throwing', async () => {
		const c = newComponent();

		await importInto(c, { mapMode: 'svg', gameBoardColumns: 5 },
			() => c.formGroup.get('gameBoardColumns')!.value === 5);

		expect(c.formGroup.get('gameBoardColumns')!.value).toBe(5);
	});
});

describe('ConfiguratorComponent formatLabel', () => {
	it('renders slider values as a percentage', () => {
		const c = newComponent();

		expect(c.formatLabel(0)).toBe('0%');
		expect(c.formatLabel(50)).toBe('50%');
	});
});

// ImportConfigComponent already learned this lesson and carries a comment about it: JSON.parse
// inside FileReader.onload throws ASYNCHRONOUSLY, so no caller can catch it, and picking the
// wrong file looks exactly like picking no file at all. The same fix was never applied here.
describe('ConfiguratorComponent import of a file that is not a configuration', () => {
	// Bypasses the JSON.stringify in the helper above — the point is a body that is not JSON.
	const importRaw = (c: ConfiguratorComponent, body: string) => {
		const file = new File([body], 'configuration.json', { type: 'application/json' });
		c.onFileSelected({ target: { files: [file] } } as unknown as Event);
		return new Promise<void>(resolve => setTimeout(resolve, 250));
	};

	let alerts: string[];
	let errors: string[];
	let originalAlert: typeof window.alert;
	let originalError: typeof console.error;
	let unhandled: string[];

	beforeEach(() => {
		alerts = []; errors = []; unhandled = [];
		originalAlert = window.alert;
		originalError = console.error;
		window.alert = (m?: any) => { alerts.push(String(m)); };
		console.error = (...a: any[]) => errors.push(a.map(String).join(' '));
	});
	afterEach(() => { window.alert = originalAlert; console.error = originalError; });

	it('tells the user when the file is not JSON at all', async () => {
		const c = newComponent();

		await importRaw(c, '<!doctype html><html>not a configuration</html>');

		expect(alerts.length).toBeGreaterThan(0);
		expect(errors.length).toBeGreaterThan(0);
	});

	it('tells the user when the file is JSON but not a configuration object', async () => {
		const c = newComponent();

		// Parses cleanly, so a try/catch around JSON.parse alone would not notice.
		await importRaw(c, '[1, 2, 3]');

		expect(alerts.length).toBeGreaterThan(0);
	});

	it('still imports a real configuration', async () => {
		const c = newComponent();

		await importRaw(c, JSON.stringify({ maps: [], productionTypes: [], customColors: [] }));

		expect(alerts).toEqual([]);
	});
});
