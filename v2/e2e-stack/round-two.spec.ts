import { test, expect, Page } from '@playwright/test';

// Round 2, in a browser, against the running stack — the journey that broke.
//
// Reported 2026-09-02: "I tried to go to round 2 and I get a popup saying that something went
// wrong." Nothing in the repository could have caught it. The unit specs call prepareNextLevel
// directly; the e2e/ suite supplies its own config.json and answers the calculator itself; the
// stack's CI job compared the served calcUrl against the compose variable it came from. Every one
// of those passes with a deployment that cannot play a round.
//
// So the assertion here is deliberately the player's: click the button, and no popup appears.

/** Every alert()/confirm() the page raised. The product uses alert() for its failure paths. */
function collectDialogs(page: Page) {
	const dialogs: string[] = [];
	page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss(); });
	return dialogs;
}

// The instructions dialog auto-opens on levels 1 and 2 and its backdrop swallows clicks. Same
// reasoning as e2e/dynamic-game.ts — it opens asynchronously, so it has to be waited for rather
// than checked for once.
async function dismissHelp(page: Page) {
	const backdrop = page.locator('tro-help .backdrop.--open');
	try {
		await backdrop.waitFor({ state: 'visible', timeout: 5_000 });
	} catch {
		return;
	}
	await page.locator('tro-help .backdrop.--open .icon-close').first().click({ force: true });
	await expect(backdrop).toHaveCount(0, { timeout: 15_000 });
}

async function clickPastHelp(page: Page, locator: any, attempts = 5) {
	let lastError: unknown;
	for (let i = 0; i < attempts; i++) {
		await dismissHelp(page);
		try {
			await locator.click({ timeout: 15_000, force: true });
			return;
		} catch (e) { lastError = e; }
	}
	throw lastError;
}

test.describe('round 2 on the running stack', () => {
	// THE REPORTED BUG. The static game scores entirely in the browser, so it must reach round 2
	// with no backend involvement at all — including on a stack that has a calculator running,
	// which is where it broke: goToNextLevel branched on calcUrl alone, so a configured backend
	// made the client-side game POST, and a POST it never needed took the round down when it 404'd.
	//
	// Asserting "no popup" alone would pass again the moment the POST merely starts SUCCEEDING.
	// The point is that the static game does not depend on the backend, so the absence of the
	// request is the property, and it is asserted directly.
	test('the static game reaches round 2 without touching the calculator', async ({ page, baseURL }) => {
		const dialogs = collectDialogs(page);
		const config = await (await page.request.get(`${baseURL}/assets/config.json`)).json();

		const backendCalls: string[] = [];
		if (config.calcUrl) {
			const origin = new URL(config.calcUrl, baseURL!).origin;
			page.on('request', r => { if (r.url().startsWith(origin) && r.method() === 'POST') backendCalls.push(r.url()); });
		}

		await page.goto('/static-game');
		const boards = page.locator('tro-grid-game-board');
		await expect(boards.first()).toBeVisible();
		const fields = boards.first().locator('tro-field');
		// 812 fields on the 28x29 board: the GeoTIFFs decoded, rather than an empty board mounting.
		await expect.poll(() => fields.count(), { timeout: 90_000 }).toBeGreaterThanOrEqual(812);
		const before = await boards.count();

		// A round: four blocks of each production type, on distinct cells.
		const types = page.locator('tro-production-type-button');
		for (const [index, start] of [[0, 0], [1, 200]]) {
			await clickPastHelp(page, types.nth(index));
			for (let i = 0; i < 4; i++) await fields.nth(start + i * 6).click({ force: true });
		}

		await clickPastHelp(page, page.locator('button.btn-next'));

		// Round 2 reveals the eight consequence boards, so the board count rises. That is the
		// observable "the level advanced" — and it cannot pass on a game stuck behind a spinner.
		await expect.poll(() => boards.count(), { timeout: 120_000 }).toBeGreaterThan(before);

		expect(dialogs, `the static game showed a popup: ${JSON.stringify(dialogs)}`).toEqual([]);
		expect(backendCalls,
			`the client-side game POSTed to the calculator. It scores in the browser and ignores ` +
			`the response, so this is a dependency it does not need and can only fail on.`).toEqual([]);
	});

	// The other half: where a backend IS the point, a real round has to complete against the real
	// calculator — not a stub that answers whatever it is asked.
	test('the dynamic game scores round 2 against the real calculator', async ({ page, baseURL }) => {
		const config = await (await page.request.get(`${baseURL}/assets/config.json`)).json();
		test.skip(!config.calcUrl, 'client-side-only deployment: no calculator to score against');

		const dialogs = collectDialogs(page);
		const failed: string[] = [];
		page.on('requestfailed', r => failed.push(`${r.method()} ${r.url()} :: ${r.failure()?.errorText}`));

		await page.goto('/dynamic-game');
		await expect(page.locator('tro-svg-game-board').first()).toBeVisible();

		const fields = page.locator('tro-svg-game-board.main-board path[troSvgField]');
		await expect.poll(() => fields.count(), { timeout: 120_000 }).toBeGreaterThan(40);

		await clickPastHelp(page, page.locator('tro-production-type-button').first());
		for (let i = 0; i < 12; i++) await fields.nth(i * 3).click({ force: true });

		await clickPastHelp(page, page.locator('button.btn-next'));

		// The chart is drawn from the scores the calculator returned, so it renders only once a
		// round has actually been scored — a 404 or a NaN leaves it absent.
		const chart = page.locator('tro-spider-chart svg');
		await expect(chart).toBeVisible({ timeout: 300_000 });
		await expect(page.locator('tro-spider-chart .spider-chart__dot')).toHaveCount(5);

		expect(dialogs, `the dynamic game showed a popup: ${JSON.stringify(dialogs)}`).toEqual([]);
		expect(failed, `requests failed outright: ${failed.slice(0, 3).join(' | ')}`).toEqual([]);
	});
});
