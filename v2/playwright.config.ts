import { defineConfig } from '@playwright/test';

// E2E for the deploy-critical behaviors (routing, defaultMode, /config, runtime config).
// Uses the system-installed Google Chrome (channel: 'chrome') so no browser download is needed.
// Run with: npm run e2e   (builds, then serves dist via e2e/serve.mjs and runs these specs)
export default defineConfig({
	testDir: './e2e',
	timeout: 60_000,
	expect: { timeout: 30_000 },
	fullyParallel: true,
	reporter: 'list',
	use: {
		baseURL: 'http://localhost:4173',
		channel: 'chrome',
		headless: true,
		launchOptions: { args: ['--no-sandbox', '--disable-gpu'] },
	},
	webServer: {
		command: 'node e2e/serve.mjs',
		url: 'http://localhost:4173',
		timeout: 30_000,
		reuseExistingServer: !process.env.CI,
	},
});
