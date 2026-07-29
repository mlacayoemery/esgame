import { test, expect } from '@playwright/test';

// These cover the behaviors that break silently on a config/routing change and that were previously
// only checked by hand: root landing, /config, both game modes, and runtime config.

test('root launches the grid game by default (not the start screen)', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('tro-grid-game-board').first()).toBeVisible();
	await expect(page.getByText('Welcome to the new version')).toHaveCount(0);
});

test('/config shows the start / configuration page', async ({ page }) => {
	await page.goto('/config');
	await expect(page.getByText('Welcome to the new version')).toBeVisible();
	await expect(page.getByRole('button', { name: /Configuration 2 \(Static maps\)/ })).toBeVisible();
});

test('the start page launches the static grid game', async ({ page }) => {
	await page.goto('/config');
	await page.getByRole('button', { name: /Configuration 2 \(Static maps\)/ }).click();
	await expect(page).toHaveURL(/\/static-game$/);
	await expect(page.locator('tro-grid-game-board').first()).toBeVisible();
});

test('the dynamic route renders the SVG game', async ({ page }) => {
	await page.goto('/dynamic-game');
	await expect(page.locator('tro-svg-game-board').first()).toBeVisible();
});

// Every assertion above passes against an empty board — they only prove the component
// mounted. This one fails unless the GeoTIFFs actually decoded into fields, which is
// what the byte-range support in e2e/serve.mjs exists for.
test('the grid board decodes its GeoTIFFs into fields', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', e => errors.push(e.message));
	page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

	await page.goto('/');
	await expect(page.locator('tro-grid-game-board').first()).toBeVisible();
	// 812 fields per 28x29 board; the page shows the main board plus side maps.
	await expect.poll(() => page.locator('tro-field').count(), { timeout: 30_000 })
		.toBeGreaterThanOrEqual(812);

	// geotiff.js reports "Server responded with full file" when a Range request is
	// answered with the whole body, and then silently renders nothing.
	expect(errors).toEqual([]);
});

test('runtime config.json is served and selects the static default', async ({ request }) => {
	const res = await request.get('/assets/config.json');
	expect(res.ok()).toBeTruthy();
	const cfg = await res.json();
	expect(cfg).toHaveProperty('calcUrl');
	expect(cfg.defaultMode).toBe('static');
});
