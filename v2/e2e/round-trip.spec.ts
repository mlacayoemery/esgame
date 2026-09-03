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

import { calcResponse, useDynamicGameWithCalculator, dismissHelp, clickPastHelp, placeFields }
	from './dynamic-game';

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

		// The response is consumed: the chart only renders once a round has been scored.
		const chart = page.locator('tro-spider-chart svg');
		await expect(chart).toBeVisible({ timeout: 60_000 });

		// Drawn from the scores, in a real browser — not a PNG fetched from the calculator.
		// Five axes, and the id -1 result must NOT have become a sixth.
		await expect(page.locator('tro-spider-chart .spider-chart__dot')).toHaveCount(5);
		await expect(page.locator('.expandable img')).toHaveCount(0);
		// The numbers on the chart are the ones the calculator returned.
		await expect(chart).toHaveAttribute('aria-label', /66%/);

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
		await expect(page.locator('tro-spider-chart svg')).toBeVisible({ timeout: 60_000 });

		await placeFields(page, 8, 1);
		await clickPastHelp(page, page.locator('button.btn-next'));
		// This used to wait on the plot's `src`, which carried ?round=N. There is no src now, so
		// it waits on a SCORE only round 2 produces — id 33 is 72+round, so 74 appears in round 2
		// and in no round-1 value (66/61/73/67/69). That proves round 2's numbers were consumed,
		// which the URL never did: a changed query string only proved a different file was asked
		// for.
		await expect(page.locator('tro-spider-chart svg'))
			.toHaveAttribute('aria-label', /74 of 100/, { timeout: 60_000 });

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

	// The consequence maps are published stretched to their own round, so the legend used to
	// print 0 and 100 on every one of them — true of the pixels, and a claim of comparability the
	// data does not support. This asserts what a player is actually told.
	test('the consequence legend says its scale is round-relative', async ({ page }) => {
		const posted: any[] = [];
		const coverageRequests: string[] = [];
		await useDynamicGameWithCalculator(page, posted, coverageRequests);
		await page.goto('/dynamic-game');
		await expect(page.locator('tro-svg-game-board').first()).toBeVisible();

		await placeFields(page, 12);
		await clickPastHelp(page, page.locator('button.btn-next'));
		await expect(page.locator('tro-spider-chart svg')).toBeVisible({ timeout: 60_000 });

		// `p.scope` is the round-relative marker, and it is the honest way to find these: the
		// first .is-gradient legend on the page is a SUITABILITY map, which shares this component
		// and must keep its numbers. Selecting `.first()` tested the wrong board and failed.
		const relative = page.locator('tro-legend-board:has(p.scope)');
		// Five consequence maps, one per indicator the calculator returns.
		await expect.poll(() => relative.count(), { timeout: 60_000 }).toBe(5);
		await expect(relative.first()).toContainText('within this round only');
		await expect(relative.first()).toContainText('low');
		await expect(relative.first()).toContainText('high');
		// The numbers that made the false claim are gone from them.
		await expect(relative.first()).not.toContainText('100');

		// AND THE SUITABILITY MAPS ARE UNTOUCHED. Without this the change could have relabelled
		// every gradient legend in the app — including the ones whose numbers come from the
		// dataset and do mean what they say — and this test would still have passed.
		const absolute = page.locator('tro-legend-board.is-gradient:not(:has(p.scope))');
		await expect.poll(() => absolute.count(), { timeout: 30_000 }).toBeGreaterThan(0);
		await expect(absolute.first()).toContainText('100');
	});

	// Round navigation is hidden where it cannot act, not shown greyed out. Asserted because a
	// preference with no check drifts back, and because the two level components disagreed about
	// this until 2026-08-14 — grid-level ignored `infiniteLevels` entirely.
	test('Previous Level is absent on round 1 and present on round 2', async ({ page }) => {
		const posted: any[] = [];
		const coverageRequests: string[] = [];
		await useDynamicGameWithCalculator(page, posted, coverageRequests);
		await page.goto('/dynamic-game');
		await expect(page.locator('tro-svg-game-board').first()).toBeVisible();

		const prev = page.locator('button.btn-prev');
		const next = page.locator('button.btn-next');

		// Round 1: nowhere to go back to, so the button is not rendered at all.
		await expect(prev).toHaveCount(0);
		// And the one that CAN act is there — otherwise this test would pass on an empty page.
		await expect(next).toBeVisible();

		await placeFields(page, 12);
		await clickPastHelp(page, next);
		await expect(page.locator('tro-spider-chart svg')).toBeVisible({ timeout: 60_000 });

		// Round 2: going back is now possible, so it appears.
		await expect(prev).toBeVisible({ timeout: 30_000 });
	});

	test('the score board shows the returned indicators', async ({ page }) => {
		const posted: any[] = [];
		const coverageRequests: string[] = [];

		await useDynamicGameWithCalculator(page, posted, coverageRequests);
		await page.goto('/dynamic-game');
		await expect(page.locator('tro-svg-game-board').first()).toBeVisible();

		await placeFields(page, 12);
		await clickPastHelp(page, page.locator('button.btn-next'));
		await expect(page.locator('tro-spider-chart svg')).toBeVisible({ timeout: 60_000 });

		// Five indicators plus the running total.
		// The static score board renders one table row per indicator plus the header total.
		await expect.poll(() => page.locator('tro-score-board table tr').count(),
			{ timeout: 30_000 }).toBeGreaterThan(1);
	});
});
