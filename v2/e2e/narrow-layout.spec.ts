import { test, expect, Page } from '@playwright/test';

// The board is 466 hexagons built for a workshop projector, and the level is three panels at
// 25% / 50% / 25% of a row. That row needs about 620px. Below it, three of the six production
// types were off-screen and Next Level with them.
//
// Nothing was ever unreachable — tro-svg-level sets overflow: auto, so the content scrolled
// sideways and every control could be scrolled to. But it is the component that scrolls, not the
// page, which is easy to mistake for the button being clipped away entirely: a player on a phone
// had to discover a sideways scroll to advance a level.
//
// So below 620px the panels stop being a row. These are the widths that measurement was taken at
// (docs/verification-status.rst), asserted rather than re-measured by hand.

const WIDTHS = [
	{ name: 'phone', width: 390, height: 844 },
	{ name: 'small tablet', width: 600, height: 900 },
	{ name: 'iPad', width: 768, height: 1024 },
	{ name: 'laptop', width: 1024, height: 768 },
];

/** Is every part of the element inside the viewport, without scrolling anything? */
async function fullyOnScreen(page: Page, selector: string, nth = 0) {
	const box = await page.locator(selector).nth(nth).boundingBox();
	if (!box) return false;
	const view = page.viewportSize()!;
	return box.x >= 0 && box.y >= 0 && box.x + box.width <= view.width + 1;
}

for (const { name, width, height } of WIDTHS) {
	test(`the level fits at ${width}px (${name})`, async ({ page }) => {
		await page.setViewportSize({ width, height });
		await page.goto('/dynamic-game');
		// Wait for the production types, not the board: the board becomes visible first and the
		// types populate a beat later, which made the count guard below fire on an empty list.
		await expect(page.locator('tro-production-type-button').first()).toBeVisible();

		// 1. The DOCUMENT must not scroll sideways. This was already true before the narrow
		//    layout — the component scrolled instead — so on its own it proves nothing. It is
		//    here because it is the thing that would regress if the fix were "let the page
		//    scroll", and a regression there is invisible in the assertions below.
		const doc = await page.evaluate(() => ({
			scrollWidth: document.documentElement.scrollWidth,
			clientWidth: document.documentElement.clientWidth,
		}));
		expect(doc.scrollWidth, `document scrolls sideways at ${width}px`)
			.toBeLessThanOrEqual(doc.clientWidth + 1);

		// 2. Every production type reachable without scrolling. This is the one that failed:
		//    three of six sat outside the viewport at 390px.
		const buttons = page.locator('tro-production-type-button');
		const count = await buttons.count();
		expect(count, 'no production types rendered; this test would be checking nothing').toBeGreaterThan(0);

		const offScreen: number[] = [];
		for (let i = 0; i < count; i++) {
			if (!await fullyOnScreen(page, 'tro-production-type-button', i)) offScreen.push(i);
		}
		expect(offScreen, `${offScreen.length} of ${count} production types are off-screen at ${width}px`)
			.toEqual([]);

		// 3. And the control that ends the round.
		const next = page.locator('button.btn-next');
		await expect(next).toBeVisible();
		expect(await fullyOnScreen(page, 'button.btn-next'), `Next Level is off-screen at ${width}px`)
			.toBe(true);
	});
}

// The grid game is the canonical one — it is what GitHub Pages serves — and it shares
// level-base.component.scss with the SVG level, so it takes this layout whether or not anyone
// aimed it there. Its board is a 28x29 grid rather than 466 hexagons, so it is a different shape
// at the same width and worth one pass of its own.
test('the grid game fits on a phone too', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/');
	await expect(page.locator('tro-production-type-button').first()).toBeVisible();

	const doc = await page.evaluate(() => ({
		scrollWidth: document.documentElement.scrollWidth,
		clientWidth: document.documentElement.clientWidth,
	}));
	expect(doc.scrollWidth, 'document scrolls sideways on the grid game at 390px')
		.toBeLessThanOrEqual(doc.clientWidth + 1);

	const count = await page.locator('tro-production-type-button').count();
	expect(count, 'no production types rendered; this test would be checking nothing').toBeGreaterThan(0);
	const offScreen: number[] = [];
	for (let i = 0; i < count; i++) {
		if (!await fullyOnScreen(page, 'tro-production-type-button', i)) offScreen.push(i);
	}
	expect(offScreen, `${offScreen.length} of ${count} production types are off-screen`).toEqual([]);

	expect(await fullyOnScreen(page, 'button.btn-next'), 'Next Level is off-screen').toBe(true);
});

test('the panels are a row when there is room for one, and a column when there is not', async ({ page }) => {
	// The 25/50/25 row is the layout this game was designed around and is what a projector or a
	// tablet gets. Asserting only "everything fits" would be satisfied by stacking at every width,
	// which would quietly throw that away — so assert the direction itself, both ways.
	await page.goto('/dynamic-game');
	await expect(page.locator('tro-production-type-button').first()).toBeVisible();

	const direction = () => page.evaluate(() => {
		const host = document.querySelector('tro-svg-level');
		return host ? getComputedStyle(host).flexDirection : null;
	});

	await page.setViewportSize({ width: 1024, height: 768 });
	expect(await direction(), 'the wide layout should still be a row').toBe('row');

	await page.setViewportSize({ width: 390, height: 844 });
	expect(await direction(), 'the narrow layout should be a column').toBe('column');

	// 620px is the width the row needs; the breakpoint is max-width: 619px, so 620 is still a row.
	await page.setViewportSize({ width: 620, height: 900 });
	expect(await direction(), '620px is the width the row needs, so it should still be a row').toBe('row');
});
