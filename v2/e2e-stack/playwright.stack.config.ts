import { defineConfig } from '@playwright/test';

// E2E against a LIVE compose stack — real nginx, real R calculator, real GeoServer.
//
// WHY THIS EXISTS SEPARATELY FROM e2e/. The suite in e2e/ intercepts assets/config.json and
// answers the calculator itself (see e2e/dynamic-game.ts). That is the right shape for testing the
// APP: it is fast, hermetic, and needs no containers. But it means the app under test is always
// configured by the test, and a stub answers whatever URL the app posts to — so no spec in e2e/
// can observe a deployment whose configuration is wrong, because the configuration never comes
// from the deployment.
//
// That gap had a cost. v2/docker-compose.dynamic.yml set CALC_URL to a bare origin while the R
// calculator serves /esgame, and shipped that way: every round in a browser 404'd. 26 e2e specs
// and 416 unit tests were green throughout, and so was the stack's own CI job, which asserted the
// served calcUrl EQUALLED the compose variable — a comparison of the configuration with itself.
//
// So these specs configure nothing. They read what the stack serves and use it as given.
//
//   ESGAME_STACK_URL=http://localhost:81 npx playwright test --config e2e-stack/playwright.stack.config.ts
//
// or `make esgame-dynamic-verify` from the repo root, which brings the stack up first.
export default defineConfig({
	testDir: '.',
	// A round on the real calculator is 60-90s (it scores 466 hexagons and publishes five
	// coverages to GeoServer), and these tests play two of them back to back.
	timeout: 420_000,
	expect: { timeout: 90_000 },
	// Serial. Every spec drives the same single-replica calculator, and concurrent rounds queue
	// behind each other in plumber anyway — parallel workers would only turn that into timeouts.
	fullyParallel: false,
	workers: 1,
	reporter: 'list',
	use: {
		baseURL: process.env.ESGAME_STACK_URL || 'http://localhost:81',
		channel: 'chrome',
		headless: true,
		launchOptions: { args: ['--no-sandbox', '--disable-gpu'] },
	},
});
