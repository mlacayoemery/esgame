import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from './config.service';

describe('ConfigService', () => {
	let service: ConfigService;
	let http: HttpTestingController;

	beforeEach(() => {
		TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
		service = TestBed.inject(ConfigService);
		http = TestBed.inject(HttpTestingController);
	});
	afterEach(() => http.verify());

	it('merges config.json over the built-in defaults on load()', async () => {
		const done = service.load();
		http.expectOne('assets/config.json').flush({ calcUrl: 'http://x', defaultMode: 'dynamic' });
		await done;
		expect(service.appConfig.calcUrl).toBe('http://x');
		expect(service.appConfig.defaultMode).toBe('dynamic');
		expect(service.appConfig.staticDataUrl).toBe('assets/dataStaticGridRect.json'); // default kept
	});

	it('falls back to defaults when config.json is absent', async () => {
		const done = service.load();
		http.expectOne('assets/config.json').error(new ProgressEvent('error'));
		await done;
		expect(service.appConfig.defaultMode).toBe('static');
		expect(service.appConfig.calcUrl).toBeUndefined();
	});

	it('getGameData() overrides the data file calcUrl when config defines one (incl. empty)', async () => {
		const loaded = service.load();
		http.expectOne('assets/config.json').flush({ calcUrl: '' });
		await loaded;

		const data = firstValueFrom(service.getGameData('dynamic'));
		http.expectOne('assets/data.json').flush({ calcUrl: 'http://baked:8000', foo: 1 });
		expect((await data).calcUrl).toBe(''); // forced client-side
		expect((await data).foo).toBe(1);
	});
});

// assets/config.json IS the deployment mechanism — one image retargeted by mounting a file over
// it. So the difference between "there is no config here" and "the config is broken" matters a
// great deal, and load() collapsed both into a silent fallback to defaults.
//
// The dangerous case is not a 404. It is a config.json that is served but unusable: a typo'd
// mount, a 500, or a server answering every path with index.html. The app then boots pointing at
// a different backend than intended, and says nothing at all.
describe('ConfigService load() failure reporting', () => {
	let service: ConfigService;
	let http: HttpTestingController;
	let errors: string[];
	let originalError: typeof console.error;

	beforeEach(() => {
		TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
		service = TestBed.inject(ConfigService);
		http = TestBed.inject(HttpTestingController);
		errors = [];
		originalError = console.error;
		console.error = (...a: any[]) => errors.push(a.map(String).join(' '));
	});
	afterEach(() => { console.error = originalError; http.verify(); });

	it('is quiet when config.json is simply absent — that is a supported deployment', async () => {
		const done = service.load();
		http.expectOne('assets/config.json').flush('', { status: 404, statusText: 'Not Found' });
		await done;

		expect(service.appConfig.defaultMode).toBe('static');
		expect(errors).toEqual([]);
	});

	it('says so when the server fails, and still boots', async () => {
		const done = service.load();
		http.expectOne('assets/config.json').flush('', { status: 500, statusText: 'Server Error' });
		await done;

		// Booting on defaults is right — refusing to start would be worse. Being silent is not.
		expect(service.appConfig.defaultMode).toBe('static');
		expect(errors.join(' ')).toContain('assets/config.json');
		expect(errors.join(' ')).toContain('500');
	});

	// The SPA-fallback case: 200, but the body is index.html. This one was worse than silent —
	// the string was spread CHARACTER BY CHARACTER into the config, so Object.keys() came back
	// as "0", "1", "2", … and nothing anywhere objected.
	it('says so when config.json is served but is not a JSON object', async () => {
		const done = service.load();
		http.expectOne('assets/config.json').flush('<!doctype html><html></html>',
			{ status: 200, statusText: 'OK' });
		await done;

		expect(service.appConfig.defaultMode).toBe('static');
		expect(errors.join(' ')).toContain('assets/config.json');
		// The config must be the defaults, not the defaults plus 28 numbered properties.
		expect(Object.keys(service.appConfig)).toEqual(['staticDataUrl', 'dynamicDataUrl', 'defaultMode']);
	});

	for (const [name, body] of [['an array', []], ['null', null], ['a number', 7]] as const) {
		it(`says so when config.json contains ${name}`, async () => {
			const done = service.load();
			http.expectOne('assets/config.json').flush(body as any, { status: 200, statusText: 'OK' });
			await done;

			expect(service.appConfig.defaultMode).toBe('static');
			expect(errors.join(' ')).toContain('assets/config.json');
		});
	}
});

// The game data IS the game — the maps, the production types, the board dimensions. A data file
// served as index.html used to spread character by character into Settings, exactly as
// config.json did, and produced a board with nothing on it and no explanation.
describe('ConfigService getGameData() shape', () => {
	let service: ConfigService;
	let http: HttpTestingController;

	beforeEach(async () => {
		TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
		service = TestBed.inject(ConfigService);
		http = TestBed.inject(HttpTestingController);
		const loaded = service.load();
		http.expectOne('assets/config.json').flush({});
		await loaded;
	});
	afterEach(() => http.verify());

	it('passes a real settings object through', async () => {
		const p = firstValueFrom(service.getGameData('dynamic'));
		http.expectOne('assets/data.json').flush({ minSelected: 1, maps: [] });
		await expect(p).resolves.toMatchObject({ minSelected: 1 });
	});

	for (const [name, body] of [
		['index.html', '<!doctype html><html></html>'],
		['an array', []],
		['null', null],
	] as const) {
		it(`rejects ${name} rather than building a board from it`, async () => {
			const p = firstValueFrom(service.getGameData('dynamic'));
			http.expectOne('assets/data.json').flush(body as any, { status: 200, statusText: 'OK' });

			const err = await p.then(() => null, (e: Error) => e);
			expect(err).toBeInstanceOf(Error);
			expect(err!.message).toContain('assets/data.json');
		});
	}
});
