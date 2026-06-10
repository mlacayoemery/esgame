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
		expect(service.appConfig.staticDataUrl).toBe('assets/dataGridExample.json'); // default kept
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
