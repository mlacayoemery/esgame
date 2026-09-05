import { test, expect } from '@playwright/test';
import { clickPastHelp, dismissHelp } from './dynamic-game';

// A RASTER-GRID GAME SCORED BY A CALCULATOR — the combination that did not exist until
// 2026-09-05, played in a browser rather than asserted against a stubbed service.
//
// game.service.mode-branch.spec.ts pins the branching and what prepareNextLevel does with the
// reply. What it cannot show is that the grid board then DECODES those rasters and draws round 2
// from them: the unit tests hand the service a TiffService stub, so "the URL reached the board"
// and "the board is the returned raster" are the same statement there and different ones here.
//
// The shipped dataset is used as it ships, with one key injected at the network edge:
// `backendScored`. That is deliberate — dataStaticGridRect.json IS the static example, and giving
// it a backend in the repository would make it something else. Injecting the opt-in here tests
// the feature without changing the game.

const CALC_URL = '/fake-grid-calc';

// The static game's own consequence ids, 4-7 arable and 8-11 livestock, pointed at rasters that
// really ship. A round-relative query string makes each round's fetch identifiable.
const calcResponse = (round: number) => ({
	results: [
		{ name: 'ag_carbon', id: '4', score: 0.31, url: `/assets/images/esgame_img_ag_carbon.tif?round=${round}` },
		{ name: 'ag_habitat', id: '5', score: 0.22, url: `/assets/images/esgame_img_ag_habitat.tif?round=${round}` },
		{ name: 'ag_water', id: '6', score: 0.18, url: `/assets/images/esgame_img_ag_water.tif?round=${round}` },
		{ name: 'ag_hunt', id: '7', score: 0.11, url: `/assets/images/esgame_img_ag_hunt.tif?round=${round}` },
		{ name: 'ranch_carbon', id: '8', score: 0.29, url: `/assets/images/esgame_img_ranch_carbon.tif?round=${round}` },
		{ name: 'ranch_habitat', id: '9', score: 0.21, url: `/assets/images/esgame_img_ranch_habitat.tif?round=${round}` },
		{ name: 'ranch_water', id: '10', score: 0.17, url: `/assets/images/esgame_img_ranch_water.tif?round=${round}` },
		{ name: 'ranch_hunt', id: '11', score: 0.09, url: `/assets/images/esgame_img_ranch_hunt.tif?round=${round}` },
	]
});

test.describe('a raster-grid game scored by a calculator', () => {
	test.describe.configure({ mode: 'serial', timeout: 180_000 });

	test('posts its allocation and builds round 2 from what comes back', async ({ page }) => {
		const posted: any[] = [];
		const coverageRequests: string[] = [];
		const errors: string[] = [];
		page.on('pageerror', e => errors.push(e.message));
		page.on('request', r => { if (r.url().includes('round=')) coverageRequests.push(r.url()); });

		// A deployment that serves the grid game AND names a calculator.
		await page.route('**/assets/config.json', route => route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify({
				staticDataUrl: 'assets/dataStaticGridRect.json',
				dynamicDataUrl: 'assets/dataDynamicGridRect.json',
				calcUrl: CALC_URL,
				defaultMode: 'static',
			}),
		}));

		// The shipped game, plus the one key that asks for a backend.
		await page.route('**/assets/dataStaticGridRect.json', async route => {
			const data = await (await route.fetch()).json();
			data.backendScored = true;
			await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
		});

		let round = 0;
		await page.route(`**${CALC_URL}`, async route => {
			round += 1;
			posted.push(route.request().postDataJSON());
			await route.fulfill({ contentType: 'application/json', body: JSON.stringify(calcResponse(round)) });
		});

		await page.goto('/');
		await expect(page.locator('tro-grid-game-board').first()).toBeVisible();
		const fields = page.locator('.center-panel tro-field');
		await expect.poll(() => fields.count(), { timeout: 60_000 }).toBeGreaterThan(100);

		const types = page.locator('tro-production-type-button');
		await clickPastHelp(page, types.nth(0));
		for (const i of [0, 6, 12]) await clickPastHelp(page, fields.nth(i));
		await dismissHelp(page);

		await clickPastHelp(page, page.locator('button.btn-next'));

		// It asked the calculator, in the shape a calculator parses.
		await expect.poll(() => posted.length, { timeout: 60_000 }).toBe(1);
		expect(Array.isArray(posted[0].allocation)).toBe(true);
		expect(posted[0].allocation.every((a: any) => typeof a.id === 'number')).toBe(true);
		expect(posted[0].round).toBe(1);

		// And round 2 is drawn from the rasters it answered with, not from the ones that ship.
		// The query string is what separates the two: the shipped boards are fetched without it.
		await expect.poll(() => coverageRequests.length, { timeout: 60_000 }).toBeGreaterThan(0);
		expect(coverageRequests.some(u => u.includes('esgame_img_ag_carbon.tif?round=1'))).toBe(true);

		await expect(page.locator('tro-grid-game-board').first()).toBeVisible();
		expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([]);
	});

	test('is still the client-side game when the dataset does not ask', async ({ page }) => {
		// The guard that matters, and the reason the opt-in is in the dataset: this is the same
		// deployment — a calcUrl is configured — with the shipped file untouched.
		const posted: any[] = [];
		await page.route('**/assets/config.json', route => route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify({
				staticDataUrl: 'assets/dataStaticGridRect.json',
				dynamicDataUrl: 'assets/dataDynamicGridRect.json',
				calcUrl: CALC_URL,
				defaultMode: 'static',
			}),
		}));
		await page.route(`**${CALC_URL}`, async route => {
			posted.push(route.request().postDataJSON());
			await route.fulfill({ contentType: 'application/json', body: JSON.stringify(calcResponse(1)) });
		});

		await page.goto('/');
		await expect(page.locator('tro-grid-game-board').first()).toBeVisible();
		const fields = page.locator('.center-panel tro-field');
		await expect.poll(() => fields.count(), { timeout: 60_000 }).toBeGreaterThan(100);

		await clickPastHelp(page, page.locator('tro-production-type-button').nth(0));
		for (const i of [0, 6, 12]) await clickPastHelp(page, fields.nth(i));
		await dismissHelp(page);
		await clickPastHelp(page, page.locator('button.btn-next'));

		// Round 2 arrives without anyone being asked.
		await expect(page.locator('tro-score-board table tr').first()).toBeVisible({ timeout: 60_000 });
		expect(posted, 'a calcUrl alone must not turn the static game into a backend game').toEqual([]);
	});
});
