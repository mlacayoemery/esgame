import { test, expect } from '@playwright/test';
import { CALC_URL, useDynamicGameWithCalculator, clickPastHelp, placeFields } from './dynamic-game';

// What the client spends its time on, measured in a real browser.
//
// perf/README.md named this as the gap: Lighthouse CI gates the BUILD (transfer bytes, which are
// stable to the byte) but nothing watches what the app does after it loads, and the heavy client
// op — decoding five GeoTIFFs into a 465-hexagon SVG board — happens entirely after the page has
// finished loading, where Lighthouse is no longer looking.
//
// TWO KINDS OF ASSERTION HERE, and the difference is the whole design.
//
//   COUNTS gate. "Each coverage URL is fetched exactly once" is true or false on any machine, at
//   any load, forever. A regression that re-decodes a board, or re-fetches a TIFF it already has,
//   changes an integer — and that is the shape most client performance regressions actually take.
//
//   TIMINGS do not gate; they are a smoke alarm, and they are recorded. This repository has been
//   here twice: Lighthouse's timing assertions aggregate on the median because three runs in one
//   sitting scored 88/90/69, and perf/calc-load.js shipped a p95 budget that failed a healthy
//   backend on a second machine (#202). A wall-clock ceiling tight enough to catch a 20%
//   regression is loose enough to fail on a loaded runner, so the ceilings below are set to catch
//   a COLLAPSE and nothing finer. The printed numbers are the useful part; compare them A/B in
//   one sitting, never against a figure recorded on a different day.
/**
 * Wait until the page stops adding hexagons, and report WHEN it stopped.
 *
 * The obvious version of this measurement is wrong, and measurably so. Waiting for the board
 * ELEMENT to appear, or for its count to exceed some threshold, returns while the decode is still
 * running: the first draft of this spec timed "five coverages decoded" at 1.0s, which is not a
 * plausible time to decode five GeoTIFFs and is not what it was measuring. Angular adds the
 * <tro-svg-game-board> elements as soon as the level object exists; the hexagons inside them
 * arrive per board as each TIFF finishes.
 *
 * So: poll the total field count, and treat the LAST time it changed as the end of the work. The
 * quiet period needed to be confident it has stopped is deliberately not counted — otherwise
 * every measurement carries a constant that has nothing to do with the app.
 *
 * `min` is neither optional nor decoration. Without it this returned **0 hexagons in 0.8s** on its
 * first run: the count is 0 before Angular renders anything, 0 does not change for the length of
 * the quiet period, and "has not started" is indistinguishable from "has finished" to a detector
 * that only watches for stillness. A settle detector with no floor reports success on a page that
 * never rendered at all.
 */
async function fieldsSettle(page: any, min: number, quietMs = 2_000, timeout = 120_000) {
	const start = Date.now();
	let last = -1;
	let lastChange = Date.now();
	while (Date.now() - start < timeout) {
		const n = await page.locator('path[troSvgField]').count();
		if (n !== last) {
			last = n;
			lastChange = Date.now();
		} else if (n >= min && Date.now() - lastChange > quietMs) {
			return { count: n, at: lastChange };
		}
		await page.waitForTimeout(200);
	}
	throw new Error(`hexagon count never settled at >= ${min}; last saw ${last}`);
}

test.describe('client render performance', () => {
	// Serial for the same reason round-trip.spec.ts is: each test decodes five GeoTIFFs on top of
	// a 465-hexagon board, and running these concurrently crashes the browser rather than failing
	// an assertion. Timings measured under concurrency would also mean nothing.
	test.describe.configure({ mode: 'serial', timeout: 180_000 });

	test('renders the first board, and decodes each coverage exactly once', async ({ page }) => {
		const posted: any[] = [];
		const coverageRequests: string[] = [];
		await useDynamicGameWithCalculator(page, posted, coverageRequests);

		const t0 = Date.now();
		await page.goto('/dynamic-game');

		// The board is not "rendered" when the element appears — it is rendered when the hexagons
		// are in the DOM. Waiting on the element alone would time the Angular bootstrap and call
		// it a board render.
		// 100 is a floor, not the geometry: a real board is 465 hexagons, and anything above
		// 100 means rendering genuinely started rather than the page still being blank.
		const firstBoard = await fieldsSettle(page, 100);
		const firstBoardMs = firstBoard.at - t0;
		const initialBoards = await page.locator('tro-svg-game-board').count();
		const fieldCount = firstBoard.count;

		// Time the calculator's response separately from the round, so a slow decode is not
		// hidden inside the wait for a click to land.
		let calcRespondedAt = 0;
		page.on('response', r => {
			if (r.url().includes(CALC_URL) && !calcRespondedAt) calcRespondedAt = Date.now();
		});

		await placeFields(page, 12);
		await clickPastHelp(page, page.locator('button.btn-next'));

		// The chart is the app's own signal that the round was consumed.
		await expect(page.locator('tro-spider-chart svg')).toBeVisible({ timeout: 120_000 });
		// And the hexagons settling is the decode actually finishing.
		// Strictly more than the board we already had, so this cannot settle on the main board
		// alone and call the consequence decode finished.
		const decoded = await fieldsSettle(page, fieldCount + 1);
		const decodeMs = calcRespondedAt ? decoded.at - calcRespondedAt : -1;
		const boards = await page.locator('tro-svg-game-board').count();

		console.log(`  first render: ${fieldCount} hexagons across ${initialBoards} boards ` +
			`in ${(firstBoardMs / 1000).toFixed(1)}s`);
		console.log(`  after round: ${decoded.count} hexagons across ${boards} boards, ` +
			`${(decodeMs / 1000).toFixed(1)}s after the calculator replied`);
		console.log(`  coverage requests: ${coverageRequests.length}`);

		// THE GATE. Five coverages came back; five were fetched. Re-fetching one is a wasted
		// decode of a whole 465-hexagon board, and it is invisible in every other spec here.
		const round1 = coverageRequests.filter(u => u.includes('round=1'));
		expect(new Set(round1).size, `duplicate coverage fetches: ${round1.join(', ')}`)
			.toBe(round1.length);

		// THERE IS NO WALL-CLOCK ASSERTION HERE, ON PURPOSE.
		//
		// One was written and then removed, because measuring it settled the question. On this
		// machine, on the same build, first render took 3.0-3.4s run alone and 11.4s as part of
		// the full suite — a 3.4x swing from nothing but Playwright's own concurrency. Any ceiling
		// tight enough to mean something would fail on a busy runner, and one loose enough to
		// survive would be decoration: at 30x the observed value it asserts nothing a hang does
		// not already trigger.
		//
		// And the hang IS already covered. fieldsSettle throws "hexagon count never settled at
		// >= N; last saw M" after its own timeout, which is a better failure than a wall-clock
		// comparison would produce: it says how far the render actually got.
		//
		// So the timings above are printed and not asserted. Compare them A/B in one sitting.
	});
});
