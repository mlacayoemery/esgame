import { defineConfig } from '@playwright/test';

// Playwright config for browser-round.spec.ts, which drives the LIVE kind cluster rather than a
// local build — so there is no webServer here and no baseURL: the spec addresses the ingress
// hosts directly.
//
// host-resolver-rules is the only accommodation made. The .local hosts are not in /etc/hosts and
// this should not require editing it, so Chrome is told to resolve them itself. Everything else
// — the app, the calculator, GeoServer — is reached exactly as a user would reach it.
export default defineConfig({
	testDir: '.',   // v2/e2e-cluster — deliberately NOT ./e2e, so `npm run e2e` does not pick it up
	testMatch: 'browser-round.spec.ts',
	timeout: 300_000,
	expect: { timeout: 120_000 },
	workers: 1,
	reporter: 'list',
	use: {
		channel: 'chrome',
		headless: true,
		launchOptions: {
			args: [
				'--no-sandbox',
				'--disable-gpu',
				'--host-resolver-rules=MAP esgame.local 127.0.0.1, MAP esgame-calculation.local 127.0.0.1, MAP esgame-geoserver.local 127.0.0.1',
			],
		},
	},
});
