import { test, expect } from '@playwright/test';

// A real browser playing a real round against the live cluster.
//
// Everything else that claims a round works stubs something: the unit specs fake the tiff
// service, e2e/round-trip.spec.ts intercepts the calculator, and ingress-test.sh POSTs with
// curl and a Host header. This closes the last of those — "Allocations were synthetic" in
// docs/verification-status.rst — by having Chrome fetch the app through the ingress, build
// its own allocation from what the player clicked, POST it to the calculation ingress, and
// render the coverage URLs GeoServer hands back.
//
// Nothing is intercepted. The only accommodation is DNS: the .local hosts resolve to 127.0.0.1
// via Chrome's host-resolver-rules, because there is no entry for them in /etc/hosts.
//
//   deploy/k8s/kind.sh up && deploy/k8s/kind.sh deploy
//   cd v2 && npx playwright test --config e2e-cluster/browser-round.config.ts
//
// It lives under v2/ because that is where Playwright is installed, and in e2e-cluster/ rather
// than e2e/ so `npm run e2e` — which builds and serves a local dist — does not try to run it.

const PORT = process.env.KIND_HTTP_PORT ?? '8880';
const APP = `http://esgame.local:${PORT}`;

test.describe.configure({ mode: 'serial', timeout: 300_000 });

test('a browser plays a round end to end against the cluster', async ({ page }) => {
	const errors: string[] = [];
	const calcPosts: any[] = [];
	const coverageFetches: string[] = [];

	page.on('pageerror', e => errors.push(e.message));
	page.on('request', r => {
		if (r.url().includes('esgame-calculation.local') && r.method() === 'POST') {
			try { calcPosts.push(r.postDataJSON()); } catch { calcPosts.push(null); }
		}
		if (r.url().includes('esgame-geoserver.local')) coverageFetches.push(r.url());
	});

	await page.goto(`${APP}/dynamic-game`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('tro-svg-game-board').first()).toBeVisible({ timeout: 120_000 });

	// The instructions open over the board on levels 1-2.
	try {
		await page.locator('tro-help .backdrop.--open').waitFor({ state: 'visible', timeout: 20_000 });
		await page.locator('tro-help .icon-close').first().click({ force: true });
	} catch { /* not always shown */ }
	await page.waitForTimeout(500);

	// Play: pick a production type, place hexagons.
	await page.locator('tro-production-type-button').first().click();
	const fields = page.locator('tro-svg-game-board.main-board path[troSvgField]');
	await expect.poll(() => fields.count(), { timeout: 120_000 }).toBeGreaterThan(100);
	for (let i = 0; i < 12; i++) await fields.nth(i * 3).click({ force: true });

	await page.locator('button.btn-next').click();

	// The spider plot only renders once a result carrying id -1 came back and was consumed.
	await expect(page.locator('.expandable img')).toBeVisible({ timeout: 240_000 });

	// The browser built and sent its own allocation — nothing here constructed it.
	expect(calcPosts).toHaveLength(1);
	const body = calcPosts[0];
	expect(Array.isArray(body.allocation)).toBe(true);
	expect(body.allocation.length).toBeGreaterThan(400);
	expect(body.allocation.every((a: any) => typeof a.id === 'number')).toBe(true);
	console.log(`  allocation sent by the browser: ${body.allocation.length} hexagons`);

	// And it fetched the coverages GeoServer published, through the geoserver ingress.
	const wcs = coverageFetches.filter(u => u.includes('/wcs?'));
	console.log(`  coverage URLs fetched by the browser: ${wcs.length}`);
	expect(wcs.length).toBeGreaterThanOrEqual(5);

	// The score board shows what came back.
	const rows = await page.locator('tro-score-board table tr').count();
	console.log(`  score board rows: ${rows}`);
	expect(rows).toBeGreaterThan(1);

	expect(errors).toEqual([]);
});
