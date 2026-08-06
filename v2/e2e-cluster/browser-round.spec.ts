import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';

// A real browser playing real rounds against the live cluster.
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

/** What the browser sent to and fetched from the cluster, recorded per page. */
interface Traffic {
	errors: string[];
	posts: any[];
	coverages: string[];
	dialogs: string[];
	replies: any[];
}

function watch(page: Page): Traffic {
	const t: Traffic = { errors: [], posts: [], coverages: [], dialogs: [], replies: [] };
	page.on('pageerror', e => t.errors.push(e.message));
	// Playwright dismisses dialogs automatically when nothing is listening, which is why the
	// low-coverage warning could be added and every spec here still pass without seeing it.
	// Record them, then dismiss exactly as the default would.
	page.on('dialog', async d => { t.dialogs.push(d.message()); await d.dismiss(); });
	page.on('response', async r => {
		if (r.url().includes('esgame-calculation.local') && r.request().method() === 'POST') {
			try { t.replies.push(await r.json()); } catch { /* not JSON; the assertions below will say so */ }
		}
	});
	page.on('request', r => {
		if (r.url().includes('esgame-calculation.local') && r.method() === 'POST') {
			try { t.posts.push(r.postDataJSON()); } catch { t.posts.push(null); }
		}
		if (r.url().includes('esgame-geoserver.local') && r.url().includes('/wcs?')) {
			t.coverages.push(r.url());
		}
	});
	return t;
}

// The instructions dialog auto-opens on every level up to 2 and its backdrop swallows clicks,
// so it has to be dismissed before each placement, not once at the start.
async function dismissHelp(page: Page) {
	const backdrop = page.locator('tro-help .backdrop.--open');
	try {
		await backdrop.waitFor({ state: 'visible', timeout: 8_000 });
	} catch {
		return;   // not every transition opens it
	}
	await page.locator('tro-help .backdrop.--open .icon-close').first().click({ force: true });
	await expect(backdrop).toHaveCount(0, { timeout: 15_000 });
}

// `offset` matters: a field already carrying a production type is refused by the placement
// rules, so a second round clicking the same indices places nothing at all and submits an
// unchanged allocation. Rounds must touch different hexagons — which is what a player does.
async function placeAndSubmit(page: Page, count: number, offset = 0) {
	await dismissHelp(page);
	await page.locator('tro-production-type-button').first().click();
	const fields = page.locator('tro-svg-game-board.main-board path[troSvgField]');
	await expect.poll(() => fields.count(), { timeout: 120_000 }).toBeGreaterThan(offset + count * 3);
	for (let i = 0; i < count; i++) await fields.nth(offset + i * 3).click({ force: true });
	await page.locator('button.btn-next').click();
}

/**
 * How much of the allocation the calculator could actually use, from its own log.
 *
 * This is the honest version of a number ingress-test.sh also reports. That script builds its
 * payload from ids it reads out of the deployed raster, so it matches by construction and says
 * ~100% however wrong the raster is. The browser sends the ids the BOARD uses, which is the
 * comparison that means something — and on the raster committed to this repository the two
 * differ enormously: 100% there, 1% here.
 *
 * Returns null when kubectl is unavailable, so the spec still runs without it.
 */
function allocationCoverage(): { line: string, percent: number } | null {
	let logs: string;
	try {
		logs = execFileSync('kubectl',
			['--context', process.env.KIND_CONTEXT ?? 'kind-esgame',
				'logs', 'deploy/esgame-calculation', '--tail=400'],
			{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
	} catch {
		return null;
	}
	const lines = logs.split('\n').filter(l => l.includes('Allocation coverage:'));
	if (!lines.length) return null;
	const line = lines[lines.length - 1];
	const m = /\((\d+)%\)/.exec(line);
	return { line, percent: m ? Number(m[1]) : NaN };
}

/** The coverage each WCS URL asks for — this is what changes between rounds. */
function coverageIds(urls: string[]): string[] {
	return urls.map(u => new URL(u).searchParams.get('coverageId') ?? u);
}

test.describe.configure({ mode: 'serial', timeout: 420_000 });

test('a browser plays a round end to end against the cluster', async ({ page }) => {
	const t = watch(page);

	await page.goto(`${APP}/dynamic-game`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('tro-svg-game-board').first()).toBeVisible({ timeout: 120_000 });

	await placeAndSubmit(page, 12);

	// The spider plot only renders once a result carrying id -1 came back and was consumed.
	await expect(page.locator('.expandable img')).toBeVisible({ timeout: 240_000 });

	// The browser built and sent its own allocation — nothing here constructed it.
	expect(t.posts).toHaveLength(1);
	const body = t.posts[0];
	expect(Array.isArray(body.allocation)).toBe(true);
	expect(body.allocation.length).toBeGreaterThan(400);
	expect(body.allocation.every((a: any) => typeof a.id === 'number')).toBe(true);
	console.log(`  allocation sent by the browser: ${body.allocation.length} hexagons`);

	// And it fetched the coverages GeoServer published, through the geoserver ingress.
	console.log(`  coverage URLs fetched by the browser: ${t.coverages.length}`);
	expect(t.coverages.length).toBeGreaterThanOrEqual(5);

	// The score board shows what came back.
	const rows = await page.locator('tro-score-board table tr').count();
	console.log(`  score board rows: ${rows}`);
	expect(rows).toBeGreaterThan(1);

	// How much of what the browser sent the calculator could use. Everything above passes on a
	// round that ignored the allocation entirely — five finite scores come back either way.
	const coverage = allocationCoverage();
	if (coverage) {
		console.log(`  ${coverage.line.trim()}`);
		if (coverage.percent < 50) {
			console.log(`  !! only ${coverage.percent}% of what the browser allocated was used, so`);
			console.log(`  !! those scores barely depend on it. Expected with the raster committed`);
			console.log(`  !! here; a deployment supplies the data-release one.`);
		}
		// The reporter must be running. Nothing else in this file would notice if it were not,
		// and it is the only signal that a round was inert.
		expect(Number.isNaN(coverage.percent)).toBe(false);
	} else {
		console.log('  (allocation coverage unavailable — kubectl not on PATH, or no log line)');
	}

	// And the player was told. Deliberately NOT inside the kubectl block above: that one degrades
	// to a console note when kubectl is absent, and the first version of this assertion sat inside
	// it — so it skipped silently on the very run that was meant to prove it. This reads the
	// response the browser itself received, which needs nothing but the browser.
	expect(t.replies, 'no JSON reply from the calculation ingress').toHaveLength(1);
	const reported = t.replies[0]?.allocationCoverage;
	expect(reported, 'the calculator did not report allocationCoverage').toBeTruthy();
	const percent = Math.round(100 * reported.fraction);
	console.log(`  calculator reported: ${reported.matched} of ${reported.allocated} ids used (${percent}%)`);

	// The committed raster shares 4 ids of 465 with the board, so this cluster always takes the
	// low branch. That makes it the honest place to assert the warning rather than a contrived one.
	if (reported.fraction < 0.5) {
		const warning = t.dialogs.find(d => d.includes('reached the model'));
		console.log(`  warning shown to the player: ${warning ? 'yes' : 'NO'}`);
		expect(warning, 'the player was not told the round had been ignored').toBeTruthy();
		expect(warning).toContain(`${percent}%`);
		expect(warning).toContain(`${reported.matched} of ${reported.allocated}`);
	} else {
		console.log('  coverage is high, so no warning is expected');
		expect(t.dialogs.filter(d => d.includes('reached the model'))).toHaveLength(0);
	}

	expect(t.errors).toEqual([]);
});

test('a second round replaces the first round\'s maps', async ({ page }) => {
	// e2e/round-trip.spec.ts already asserts this — against an intercepted calculator whose
	// URLs are query-string variants of one another. Here the two rounds are two genuinely
	// different coverages, published by GeoServer under names the calculator chose, which is
	// where the interesting failure lives: `settings.maps` is mutated in place, so a bug in
	// the swap re-renders round 1 forever while the network shows a healthy second round.
	const t = watch(page);

	await page.goto(`${APP}/dynamic-game`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('tro-svg-game-board').first()).toBeVisible({ timeout: 120_000 });

	await placeAndSubmit(page, 12);
	await expect(page.locator('.expandable img')).toBeVisible({ timeout: 240_000 });
	const round1 = coverageIds(t.coverages);
	expect(round1.length).toBeGreaterThanOrEqual(5);
	console.log(`  round 1 coverages: ${round1.join(', ')}`);

	// Round 2, on hexagons round 1 did not touch.
	const before = t.coverages.length;
	await placeAndSubmit(page, 12, 1);
	await expect.poll(() => t.posts.length, { timeout: 300_000 }).toBe(2);
	await expect.poll(() => t.coverages.length, { timeout: 300_000 }).toBeGreaterThanOrEqual(before + 5);

	const round2 = coverageIds(t.coverages.slice(before));
	console.log(`  round 2 coverages: ${round2.join(', ')}`);

	// The app told the calculator which round this was, and it was a different one.
	expect(t.posts[1].round).not.toBe(t.posts[0].round);
	console.log(`  rounds posted: ${t.posts[0].round} then ${t.posts[1].round}`);

	// The board fetched round 2's coverages, not round 1's again. Overlap of zero is the
	// assertion: every name changed, because the calculator stamps the round into each one.
	expect(round2.filter(c => round1.includes(c))).toEqual([]);

	// And round 1's coverages still exist. The calculator publishes into one GeoServer
	// workspace round after round; if round 2 overwrote round 1's layers instead of adding
	// its own, the game's history would silently rot behind the player.
	const stillThere = await page.evaluate(async (urls: string[]) => {
		const codes: number[] = [];
		for (const u of urls) codes.push((await fetch(u)).status);
		return codes;
	}, t.coverages.slice(0, 5));
	console.log(`  round 1 coverages re-fetched after round 2: ${stillThere.join(', ')}`);
	expect(stillThere).toEqual([200, 200, 200, 200, 200]);

	expect(t.errors).toEqual([]);
});
