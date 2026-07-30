import { test, expect } from '@playwright/test';

// A full round through the dynamic game, in a browser, with no backend.
//
// The unit specs cover prepareNextLevel directly; these cover the wiring around it that unit
// tests cannot reach — that a click actually builds a payload, that the payload has the shape
// tools/R expects, and that the URLs coming back are really fetched and really decoded into a
// board. Every one of those is a place the game has broken silently before.
//
// The calculator is a route intercept rather than a running container, and its coverage URLs
// point at the app's OWN consequence TIFFs. That matters: a stub returning an unfetchable URL
// would let getSvgGameBoard fail while the test still passed on the score assertions alone.
// These are real GeoTIFFs served over the same byte-range-capable server the other e2e uses,
// so if the board renders, the decode genuinely happened.

const CALC_URL = '/fake-calc';

// ids 11/22/33/44/55 are the dynamic game's Consequence maps; -1 is the spider plot.
const calcResponse = (round: number) => ({
	results: [
		// Real GeoTIFFs that exist in the build. data.json's own Consequence_*_Clip.tif do NOT
		// exist in this repository — see the note at the bottom of this file.
		{ name: `HH_${round}.tif`, id: '11', score: 0.11 * round, url: `/assets/images/esgame_img_ag_carbon.tif?round=${round}` },
		{ name: `NP_${round}.tif`, id: '22', score: 0.22 * round, url: `/assets/images/esgame_img_ag_habitat.tif?round=${round}` },
		{ name: `WE_${round}.tif`, id: '33', score: 0.33 * round, url: `/assets/images/esgame_img_ag_hunt.tif?round=${round}` },
		{ name: `WA_${round}.tif`, id: '44', score: 0.44 * round, url: `/assets/images/esgame_img_ag_water.tif?round=${round}` },
		{ name: `HC_${round}.tif`, id: '55', score: 0.55 * round, url: `/assets/images/esgame_img_ranch_carbon.tif?round=${round}` },
		{ name: `Spider_${round}.png`, id: '-1', score: 0, url: `/assets/images/agropark.png?round=${round}` }
	]
});

// Serves the dynamic game with a calculator configured. config.json ships calcUrl:"" so that a
// default build has no backend; without this the Next Level button takes the offline branch.
async function useDynamicGameWithCalculator(page: any, posted: any[], coverageRequests: string[]) {
	await page.route('**/assets/config.json', async (route: any) => {
		await route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify({
				staticDataUrl: 'assets/dataGridExample.json',
				dynamicDataUrl: 'assets/data.json',
				calcUrl: CALC_URL,
				defaultMode: 'dynamic'
			})
		});
	});

	let round = 0;
	await page.route(`**${CALC_URL}`, async (route: any) => {
		round += 1;
		posted.push(route.request().postDataJSON());
		await route.fulfill({ contentType: 'application/json', body: JSON.stringify(calcResponse(round)) });
	});

	// Record what the board actually went and fetched, so "it used the returned URLs" is an
	// observation rather than an inference.
	page.on('request', (r: any) => {
		if (r.url().includes('round=')) coverageRequests.push(r.url());
	});
}

// The instructions dialog auto-opens on every level up to 2 and its backdrop swallows clicks,
// so it has to be dismissed before and after each submission — not just once at the start.
async function dismissHelp(page: any) {
	// It opens asynchronously, after the level observable emits — checking for it immediately
	// finds nothing, and it then opens on top of whatever the test clicks next. So wait for it.
	const backdrop = page.locator('tro-help .backdrop.--open');
	try {
		await backdrop.waitFor({ state: 'visible', timeout: 4_000 });
	} catch {
		return;   // not every transition opens it
	}
	await page.locator('tro-help .backdrop.--open .icon-close').first().click({ force: true });
	await expect(backdrop).toHaveCount(0, { timeout: 10_000 });
}

// minSelected is 1%, so a handful of hexagons is enough to submit.
//
// `offset` matters: a field already carrying a production type is refused by the placement rules,
// so a second round that clicks the same indices places nothing at all. Rounds must touch
// different hexagons, which is what a player does anyway.
async function placeFields(page: any, count: number, offset = 0) {
	await dismissHelp(page);
	await page.locator('tro-production-type-button').first().click();
	const fields = page.locator('tro-svg-game-board.main-board path[troSvgField]');
	await expect.poll(() => fields.count(), { timeout: 60_000 }).toBeGreaterThan(offset + count * 3);
	for (let i = 0; i < count; i++) {
		await fields.nth(offset + i * 3).click({ force: true });
	}
}

test.describe('dynamic game round trip', () => {
	// Serial: each test loads a 466-hexagon board and decodes five GeoTIFFs, and running three
	// of those concurrently crashed the browser ("Protocol error … session closed") rather than
	// failing an assertion. The specs share no state; this is purely about resource use.
	// 60s (the project default) is not enough for two rounds: each one decodes five GeoTIFFs on
	// top of a 466-hexagon board, and the two-round test spends ~40s in legitimate waiting.
	test.describe.configure({ mode: 'serial', timeout: 180_000 });

	test('submits an allocation and renders what comes back', async ({ page }) => {
		const posted: any[] = [];
		const coverageRequests: string[] = [];
		const errors: string[] = [];
		page.on('pageerror', e => errors.push(e.message));

		await useDynamicGameWithCalculator(page, posted, coverageRequests);
		await page.goto('/dynamic-game');
		await expect(page.locator('tro-svg-game-board').first()).toBeVisible();

		await placeFields(page, 12);
		await dismissHelp(page);
		await page.locator('button.btn-next').click();

		// The response is consumed: the spider plot only renders when a result carried id -1.
		await expect(page.locator('.expandable img')).toBeVisible({ timeout: 60_000 });

		// The payload is the shape the R calculator parses into a reclassify matrix.
		expect(posted).toHaveLength(1);
		const body = posted[0];
		expect(Array.isArray(body.allocation)).toBe(true);
		expect(body.allocation.length).toBeGreaterThan(400);
		expect(body.allocation[0]).toHaveProperty('id');
		expect(body.allocation[0]).toHaveProperty('lulc');
		expect(body).toHaveProperty('round');
		expect(body).toHaveProperty('game_id');

		// Every allocated id must be a number; jsonlite turns this array into a 2-column matrix,
		// and a string id there produces "comparison of these types is not implemented" and a 500.
		expect(body.allocation.every((a: any) => typeof a.id === 'number')).toBe(true);

		// The board fetched the URLs the calculator returned, not the ones in data.json.
		expect(coverageRequests.some(u => u.includes('esgame_img_ag_carbon.tif?round=1'))).toBe(true);
		expect(errors).toEqual([]);
	});

	test('a second round replaces the first round\'s maps', async ({ page }) => {
		const posted: any[] = [];
		const coverageRequests: string[] = [];

		await useDynamicGameWithCalculator(page, posted, coverageRequests);
		await page.goto('/dynamic-game');
		await expect(page.locator('tro-svg-game-board').first()).toBeVisible();

		await placeFields(page, 12);
		await dismissHelp(page);
		await page.locator('button.btn-next').click();
		await expect(page.locator('.expandable img')).toBeVisible({ timeout: 60_000 });

		await placeFields(page, 8, 1);
		await dismissHelp(page);
		await page.locator('button.btn-next').click();
		// The plot src carries the round, so waiting on it proves round 2 was consumed rather
		// than the round-1 image simply still being on screen.
		await expect(page.locator('.expandable img')).toHaveAttribute('src', /round=2/, { timeout: 60_000 });

		expect(posted).toHaveLength(2);
		expect(posted[1].round).not.toBe(posted[0].round);
		// settings.maps is mutated in place, so a bug here re-renders round 1 forever.
		expect(coverageRequests.some(u => u.includes('round=2'))).toBe(true);
	});

	// Regression: the instructions dialog used to re-open itself a few seconds after being
	// closed. `level` is consumed by seven `| async` pipes and the auto-open lived in a tap, so
	// it ran once per subscriber; the null->level-1 transition then opened it a second time,
	// on top of whatever the player had just clicked. Caught while writing these tests.
	test('the instructions dialog stays closed once dismissed', async ({ page }) => {
		const posted: any[] = [];
		const coverageRequests: string[] = [];
		await useDynamicGameWithCalculator(page, posted, coverageRequests);
		await page.goto('/dynamic-game');
		await expect(page.locator('tro-svg-game-board').first()).toBeVisible();

		const backdrop = page.locator('tro-help .backdrop.--open');
		await backdrop.waitFor({ state: 'visible', timeout: 30_000 });
		await page.locator('tro-help .icon-close').first().click({ force: true });
		await expect(backdrop).toHaveCount(0);

		// It reopened when the board finished decoding, which is well inside this window.
		await page.waitForTimeout(8_000);
		await expect(backdrop).toHaveCount(0);

		// And the board is genuinely clickable rather than covered by an invisible backdrop.
		await page.locator('tro-production-type-button').first().click({ timeout: 10_000 });
	});

	test('the score board shows the returned indicators', async ({ page }) => {
		const posted: any[] = [];
		const coverageRequests: string[] = [];

		await useDynamicGameWithCalculator(page, posted, coverageRequests);
		await page.goto('/dynamic-game');
		await expect(page.locator('tro-svg-game-board').first()).toBeVisible();

		await placeFields(page, 12);
		await dismissHelp(page);
		await page.locator('button.btn-next').click();
		await expect(page.locator('.expandable img')).toBeVisible({ timeout: 60_000 });

		// Five indicators plus the running total.
		// The static score board renders one table row per indicator plus the header total.
		await expect.poll(() => page.locator('tro-score-board table tr').count(),
			{ timeout: 30_000 }).toBeGreaterThan(1);
	});
});
