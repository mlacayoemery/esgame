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

test('runtime config.json is served and selects the static default', async ({ request }) => {
	const res = await request.get('/assets/config.json');
	expect(res.ok()).toBeTruthy();
	const cfg = await res.json();
	expect(cfg).toHaveProperty('calcUrl');
	expect(cfg.defaultMode).toBe('static');
});
