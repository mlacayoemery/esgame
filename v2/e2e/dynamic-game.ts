import { expect } from '@playwright/test';

// The dynamic-game fixture: a browser playing real rounds against an intercepted calculator.
//
// This lives in its own module because two spec files need it, and the last time an assertion
// about this app was duplicated across e2e/ and e2e-cluster/ the two drifted — #195 updated one
// and not the other, and the weekly cluster job went red four days later waiting for an element
// that no longer existed (#200). One definition, imported twice, cannot do that.

const CALC_URL = '/fake-calc';

// ids 11/22/33/44/55 are the dynamic game's Consequence maps.
//
// The -1 entry is a spider plot the calculator USED TO render and serve from its own pod. It is
// kept here on purpose: tools/R/calculator.r stopped sending it on 2026-08-07 and the browser
// draws the chart itself, but a frontend can be deployed against a calculation image that has
// not been rebuilt, so "-1" must go on being filtered out rather than drawn as a sixth axis.
//
// Scores are the 0-100 integers the R calculator returns (these are the golden allocation's,
// nudged per round so two rounds differ), not fractions — the chart is drawn against a 0-100
// axis, so a fixture of 0.11 would have rendered five dots at the centre and asserted nothing.
const calcResponse = (round: number) => ({
	results: [
		// Real GeoTIFFs that exist in the build. data.json's own Consequence_*_Clip.tif do NOT
		// exist in this repository — see the note at the bottom of this file.
		{ name: `HH_${round}.tif`, id: '11', score: 65 + round, url: `/assets/images/esgame_img_ag_carbon.tif?round=${round}` },
		{ name: `NP_${round}.tif`, id: '22', score: 60 + round, url: `/assets/images/esgame_img_ag_habitat.tif?round=${round}` },
		{ name: `WE_${round}.tif`, id: '33', score: 72 + round, url: `/assets/images/esgame_img_ag_hunt.tif?round=${round}` },
		{ name: `WA_${round}.tif`, id: '44', score: 66 + round, url: `/assets/images/esgame_img_ag_water.tif?round=${round}` },
		{ name: `HC_${round}.tif`, id: '55', score: 68 + round, url: `/assets/images/esgame_img_ranch_carbon.tif?round=${round}` },
		{ name: `Spider_${round}.png`, id: '-1', score: 0, url: `/assets/images/agropark.png?round=${round}` }
	]
});

// Serves the dynamic game with a calculator configured. config.json ships calcUrl:"" so that a
// default build has no backend; without this the Next Level button takes the offline branch.
//
// `dataUrl` selects the BOARD, exactly as a deployment does: assets/data.json is the hexagonal
// board and assets/dataRect.json is the rectangular one (docs/boards.rst). Intercepting
// config.json is how a deployment's DYNAMIC_DATA_URL is simulated without rebuilding the image —
// the app reads the dataset from there and nothing else distinguishes the two boards.
async function useDynamicGameWithCalculator(
	page: any, posted: any[], coverageRequests: string[], dataUrl = 'assets/data.json') {
	await page.route('**/assets/config.json', async (route: any) => {
		await route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify({
				staticDataUrl: 'assets/dataStaticGridRect.json',
				dynamicDataUrl: dataUrl,
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

export { CALC_URL, calcResponse, useDynamicGameWithCalculator, dismissHelp, clickPastHelp, placeFields };
