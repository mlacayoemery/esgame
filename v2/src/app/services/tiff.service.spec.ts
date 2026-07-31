import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { TiffService } from './tiff.service';

// Every raster the board renders goes through here, including the coverage URLs the calculator
// returns. When one of those cannot be served, what the player and the console get should say
// so — not a decoding error from three layers down.
describe('TiffService raster fetching', () => {
	let service: TiffService;
	let originalFetch: typeof fetch;

	beforeEach(() => {
		TestBed.configureTestingModule({});
		service = TestBed.inject(TiffService);
		originalFetch = globalThis.fetch;
	});
	afterEach(() => { globalThis.fetch = originalFetch; });

	// The real shape of this failure, taken from docs/verification-status.rst: a missing raster
	// 404s with an HTML body, fetch RESOLVES (it only rejects on network errors), .blob() is
	// happy, and geotiff.js reads "<!" as the byte order.
	it('reports the HTTP status when a raster cannot be fetched', async () => {
		globalThis.fetch = (async () => new Response('<!doctype html><html>Not Found</html>',
			{ status: 404, statusText: 'Not Found', headers: { 'Content-Type': 'text/html' } })) as any;

		const err = await firstValueFrom(service.getTiffSvgDataUrl('/assets/images/missing.tif', 0, 1))
			.then(() => null, (e: Error) => e);

		expect(err).toBeInstanceOf(Error);
		// Must name the status and the URL. "Invalid byte order value" tells you nothing about
		// which raster is missing, or that anything was missing at all.
		expect(err!.message).toContain('404');
		expect(err!.message).toContain('missing.tif');
	});

	it('says so when the server returns something that is not a GeoTIFF', async () => {
		// A 200 that is not a raster — what the e2e test server used to do for every path, and
		// what a misconfigured SPA fallback still does.
		globalThis.fetch = (async () => new Response('<!doctype html><html>index</html>',
			{ status: 200, headers: { 'Content-Type': 'text/html' } })) as any;

		const err = await firstValueFrom(service.getTiffSvgDataUrl('/assets/images/index-instead.tif', 0, 1))
			.then(() => null, (e: Error) => e);

		expect(err).toBeInstanceOf(Error);
		expect(err!.message).toContain('index-instead.tif');
	});
});

// The guard must not reject files the decoder can actually read. It checks the byte order and
// the version word, and BigTIFF (43) is as valid as TIFF (42) as far as geotiff.js is concerned.
describe('TiffService raster header acceptance', () => {
	let service: TiffService;
	let originalFetch: typeof fetch;

	beforeEach(() => {
		TestBed.configureTestingModule({});
		service = TestBed.inject(TiffService);
		originalFetch = globalThis.fetch;
	});
	afterEach(() => { globalThis.fetch = originalFetch; });

	// Header only — geotiff.js will fail later on the truncated body, and it should, but with a
	// decoding error rather than this guard's message. That is the distinction being tested.
	const header = (bytes: number[]) => (async () =>
		new Response(new Uint8Array(bytes), { status: 200 })) as any;

	const accepted = [
		['little-endian TIFF (II 42)', [0x49, 0x49, 0x2a, 0x00]],
		['big-endian TIFF (MM 42)', [0x4d, 0x4d, 0x00, 0x2a]],
		['little-endian BigTIFF (II 43)', [0x49, 0x49, 0x2b, 0x00]],
		['big-endian BigTIFF (MM 43)', [0x4d, 0x4d, 0x00, 0x2b]],
	] as const;

	for (const [name, bytes] of accepted) {
		it(`lets ${name} through to the decoder`, async () => {
			globalThis.fetch = header([...bytes]);
			const err = await firstValueFrom(service.getTiffSvgDataUrl('/x.tif', 0, 1))
				.then(() => null, (e: Error) => e);
			// It still fails — the body is four bytes — but not with the not-a-GeoTIFF message.
			expect(err?.message ?? '').not.toContain('not a GeoTIFF');
		});
	}

	it('rejects a plausible-looking header with the wrong version word', async () => {
		globalThis.fetch = header([0x49, 0x49, 0x2c, 0x00]);
		const err = await firstValueFrom(service.getTiffSvgDataUrl('/x.tif', 0, 1))
			.then(() => null, (e: Error) => e);
		expect(err!.message).toContain('not a GeoTIFF');
	});
});

// The grid board and the overlay board use geotiff's own fetcher rather than fetch(), because
// they read the file in ranges instead of pulling it whole. Its failure message is
// "Error fetching data." — no status, no URL, and identical for every raster on the board.
describe('TiffService range-fetched rasters', () => {
	let service: TiffService;
	let originalFetch: typeof fetch;

	beforeEach(() => {
		TestBed.configureTestingModule({});
		service = TestBed.inject(TiffService);
		originalFetch = globalThis.fetch;
		globalThis.fetch = (async () => new Response('<!doctype html>',
			{ status: 404, statusText: 'Not Found' })) as any;
	});
	afterEach(() => { globalThis.fetch = originalFetch; });

	it('names the raster when the grid board cannot be read', async () => {
		const err = await firstValueFrom(service.getTiffData('/assets/missing-grid.tif'))
			.then(() => null, (e: Error) => e);
		expect(err!.message).toContain('missing-grid.tif');
	});

	it('names the raster when the overlay board cannot be read', async () => {
		const err = await firstValueFrom(service.getTiffSvgData('/assets/missing-overlay.tif'))
			.then(() => null, (e: Error) => e);
		expect(err!.message).toContain('missing-overlay.tif');
	});
});
