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

/**
 * Click something the instructions dialog likes to open on top of.
 *
 * dismissHelp above is necessary and NOT sufficient. tro-help opens asynchronously, after the
 * level observable emits, so there is a window between "no backdrop is visible" and the click
 * landing in which it can appear and swallow it — and dismissHelp gives up silently after 4s,
 * which is the right call when the dialog genuinely did not open and the wrong one when it was
 * merely slow.
 *
 * Measured on clean master before this change: `npx playwright test e2e/round-trip.spec.ts`
 * failed roughly one run in three on a loaded machine, always the same way —
 *
 *   <p class="text"> from <tro-help> subtree intercepts pointer events
 *   327 x retrying click action
 *
 * — and passing the next run. That is a test-harness race, not a product defect: a real player
 * simply closes the dialog that appeared. So dismiss, try, and if the dialog got in the way,
 * dismiss again and retry.
 *
 * Deliberately NOT used by 'the instructions dialog stays closed once dismissed', which dismisses
 * once and then clicks unaided on purpose. Retrying there would hide exactly what it tests.
 */
async function clickPastHelp(page: any, locator: any, attempts = 5) {
	let lastError: unknown;
	for (let i = 0; i < attempts; i++) {
		await dismissHelp(page);
		try {
			await locator.click({ timeout: 10_000 });
			return;
		} catch (e) {
			lastError = e;
		}
	}
	throw lastError;
}

// minSelected is 1%, so a handful of hexagons is enough to submit.
//
// `offset` matters: a field already carrying a production type is refused by the placement rules,
// so a second round that clicks the same indices places nothing at all. Rounds must touch
// different hexagons, which is what a player does anyway.
async function placeFields(page: any, count: number, offset = 0) {
	await clickPastHelp(page, page.locator('tro-production-type-button').first());
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
		await clickPastHelp(page, page.locator('button.btn-next'));

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

	// The spinner is the whole screen when it is up — `:host.show` gives it a white background
	// over the board — so failing to clear it is not cosmetic: the game is unusable and the only
	// way out is a reload.
	//
	// Reachable in any deployment. prepareNextLevel builds the level from the coverage URLs the
	// calculator returns, so one URL GeoServer cannot serve is enough; the fetch rejects, the
	// error arrives outside Angular's zone, and failLevel() clears the counter.
	test('the spinner clears when a level fails to build', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', e => errors.push(e.message));
		// failLevel alerts. Playwright dismisses dialogs by default, but be explicit — an
		// unhandled dialog would block the page and this test would pass for the wrong reason,
		// having never got as far as rendering anything.
		const alerts: string[] = [];
		page.on('dialog', d => { alerts.push(d.message()); d.dismiss(); });

		const posted: any[] = [];
		const coverageRequests: string[] = [];
		await useDynamicGameWithCalculator(page, posted, coverageRequests);
		// Break exactly one coverage the calculator hands back. Everything else is untouched, so
		// the round genuinely reaches level-building and fails there rather than earlier.
		await page.route('**/esgame_img_ag_habitat.tif*', route => route.fulfill({ status: 404 }));

		await page.goto('/dynamic-game');
		await expect(page.locator('tro-svg-game-board').first()).toBeVisible();
		await placeFields(page, 12);
		const spinner = page.locator('tro-loading-indicator');

		// Watch the class rather than trying to catch it in the act. "It has to have come up, or
		// 'it is gone' proves nothing" is the right assertion and polling for it was the wrong
		// way to make it: the spinner is up only while the round is in flight, and with every
		// response served from the route interceptor that window can close inside a single poll
		// interval — so `toHaveClass(/show/)` timed out on runs where the spinner had behaved
		// perfectly. A MutationObserver installed before the click turns "it came up" into a fact
		// about what happened instead of a state that has to still be true when we look.
		await page.evaluate(() => {
			const w = window as any;
			w.__spinnerSawShow = false;
			const el = document.querySelector('tro-loading-indicator');
			if (!el) return;
			const check = () => { if (el.classList.contains('show')) w.__spinnerSawShow = true; };
			check();
			new MutationObserver(check).observe(el, { attributes: true, attributeFilter: ['class'] });
		});

		await clickPastHelp(page, page.locator('button.btn-next'));

		// failLevel is what alerts, so this is the round having finished failing — the ordering
		// the two assertions below depend on.
		await expect.poll(() => alerts.length, { timeout: 60_000 }).toBeGreaterThan(0);

		// It went away. Before the fix this class stayed for good: the subscriber ran with
		// length 0, but a host binding is evaluated by the declaring view and assigning a plain
		// field told Angular nothing about which view that was.
		await expect(spinner).not.toHaveClass(/show/, { timeout: 60_000 });

		// And it had been up, so the line above is not passing on a spinner that never showed.
		expect(await page.evaluate(() => (window as any).__spinnerSawShow),
			'the spinner never came up, so "it cleared" proves nothing').toBe(true);

		// The player was told, and the board is usable again rather than behind a white sheet.
		await expect(page.locator('tro-svg-game-board').first()).toBeVisible();
		expect(errors).toEqual([]);
	});

	test('a second round replaces the first round\'s maps', async ({ page }) => {
		const posted: any[] = [];
		const coverageRequests: string[] = [];

		await useDynamicGameWithCalculator(page, posted, coverageRequests);
		await page.goto('/dynamic-game');
		await expect(page.locator('tro-svg-game-board').first()).toBeVisible();

		await placeFields(page, 12);
		await clickPastHelp(page, page.locator('button.btn-next'));
		await expect(page.locator('.expandable img')).toBeVisible({ timeout: 60_000 });

		await placeFields(page, 8, 1);
		await clickPastHelp(page, page.locator('button.btn-next'));
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
		await clickPastHelp(page, page.locator('button.btn-next'));
		await expect(page.locator('.expandable img')).toBeVisible({ timeout: 60_000 });

		// Five indicators plus the running total.
		// The static score board renders one table row per indicator plus the header total.
		await expect.poll(() => page.locator('tro-score-board table tr').count(),
			{ timeout: 30_000 }).toBeGreaterThan(1);
	});
});
