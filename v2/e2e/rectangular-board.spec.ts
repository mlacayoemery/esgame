import { test, expect } from '@playwright/test';

// The rectangular board, in a browser.
//
// #232 added a second board and #235 made it deployable, and until now the only evidence either
// worked was that someone looked at a screenshot. That is exactly the kind of check this
// repository keeps finding it does not have: the board is DATA, so every way of getting it wrong
// produces a page that renders, scores, and is silently the other board — or no board at all.
//
// The one assertion that catches all of those is the unit COUNT. It comes from the raster:
// tiffToSvgPaths() emits one path per distinct value, so 529 fields means New_rectangles.tif was
// fetched, decoded, and vectorised into the regions it actually contains. A mismatched dataset,
// a truncated raster, an SPA fallback serving index.html, or a config that quietly fell back to
// the hexagonal board all give a different number.
//
// The board is selected the way a deployment selects it — config.json's dynamicDataUrl — so this
// exercises the same switch that DYNAMIC_DATA_URL flips in the cluster.

import { useDynamicGameWithCalculator, clickPastHelp, placeFields } from './dynamic-game';

// From the rasters themselves:
//   New_hexagons.tif    465 units   (tools/R/make-base-raster.R reports it)
//   New_rectangles.tif  529 units   (tools/R/make-rect-board.R reports it)
// Both cover the same 65,826 farmland cells; only the partition differs.
const HEXAGONAL_UNITS = 465;
const RECTANGULAR_UNITS = 529;

// THE BOARD DRAWS ONE MORE PATH THAN IT HAS UNITS, and that is not an off-by-one here.
// tiffToSvgPaths() emits one path per DISTINCT RASTER VALUE, and writeRaster(NAflag = -9999) puts
// -9999 in every cell outside the board — so the nodata region is a value like any other and gets
// a path. getSvgGameBoard() then builds a Field for it with `editable: path.id != data.nodata`,
// i.e. it is rendered and cannot be played. Measured: 530 paths for 529 rectangular units, and the
// same +1 is why round-trip.spec.ts calls the hexagonal board "466-hexagon".
//
// Asserted as unit count + 1 rather than as a bare 530, so a future change that stops emitting the
// nodata path fails here with an arithmetic that says what happened instead of a number that has
// to be re-derived.
const NODATA_PATH = 1;
const pathsFor = (units: number) => units + NODATA_PATH;

const fieldsOf = (page: any) => page.locator('tro-svg-game-board.main-board path[troSvgField]');

test.describe('the rectangular board', () => {
	// Serial and generous, for the same reason round-trip.spec.ts is: each test decodes a
	// half-megapixel raster into several hundred SVG paths, and running these concurrently
	// exhausts the browser rather than failing an assertion.
	test.describe.configure({ mode: 'serial', timeout: 180_000 });

	test('renders every rectangular unit and nothing else', async ({ page }) => {
		const posted: any[] = [];
		const coverage: string[] = [];
		const errors: string[] = [];
		page.on('pageerror', e => errors.push(e.message));

		await useDynamicGameWithCalculator(page, posted, coverage, 'assets/dataRect.json');
		await page.goto('/dynamic-game');
		await expect(page.locator('tro-svg-game-board').first()).toBeVisible();

		await expect.poll(() => fieldsOf(page).count(), { timeout: 120_000 })
			.toBe(pathsFor(RECTANGULAR_UNITS));
		expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([]);
	});

	test('is a different board from the hexagonal one', async ({ page }) => {
		// The guard that matters. Every assertion above would still pass if dynamicDataUrl were
		// ignored and both datasets rendered the hexagonal board — which is precisely what a
		// deployment misconfiguration looks like, and what config.json interception would mask if
		// the app ever stopped reading it.
		await useDynamicGameWithCalculator(page, [], [], 'assets/data.json');
		await page.goto('/dynamic-game');
		await expect(page.locator('tro-svg-game-board').first()).toBeVisible();

		await expect.poll(() => fieldsOf(page).count(), { timeout: 120_000 })
			.toBe(pathsFor(HEXAGONAL_UNITS));
		expect(RECTANGULAR_UNITS).not.toBe(HEXAGONAL_UNITS);
	});

	test('submits rectangular ids, in the id space the rectangular raster uses', async ({ page }) => {
		const posted: any[] = [];
		const coverage: string[] = [];

		await useDynamicGameWithCalculator(page, posted, coverage, 'assets/dataRect.json');
		await page.goto('/dynamic-game');
		await expect(page.locator('tro-svg-game-board').first()).toBeVisible();

		await placeFields(page, 12);
		await clickPastHelp(page, page.locator('button.btn-next'));

		await expect.poll(() => posted.length, { timeout: 120_000 }).toBeGreaterThan(0);
		const allocation = posted[0].allocation as { id: number, lulc: number }[];
		expect(allocation.length).toBeGreaterThan(0);

		// Board ids are hundreds — that is what keeps them clear of the land-use codes 2..8 that
		// share the mosaic, and the defect tools/R/make-base-raster.R exists to prevent. The
		// rectangular board has 529 of them, so the largest possible id is 52,900.
		for (const { id } of allocation) {
			expect(id % 100, `id ${id} is not a multiple of 100`).toBe(0);
			expect(id).toBeGreaterThanOrEqual(100);
			expect(id).toBeLessThanOrEqual(RECTANGULAR_UNITS * 100);
		}
	});
});
