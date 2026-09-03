import { test, expect } from '@playwright/test';

// What the deployment SERVES, checked against what it has to be true for the game to work.
//
// These are cheap (no browser round), and between them they are the guard that the two defects
// found on 2026-09-02 would have tripped, at the point where they were introduced rather than in
// somebody's browser two hours later.

/** The config.json the frontend actually serves, as the app reads it. */
async function servedConfig(request: any, baseURL: string) {
	const res = await request.get(`${baseURL}/assets/config.json`);
	expect(res.status(), 'the frontend must serve assets/config.json').toBe(200);
	return res.json();
}

test.describe('the deployed configuration', () => {
	// DEFECT 1: CALC_URL was "http://localhost:8000" while tools/R/calculator.r serves
	// `#* @post /esgame`. calcUrl is the ENDPOINT the app POSTs to, not the origin the calculator
	// lives at — game.service.ts hands it to HttpClient.post and appends nothing.
	//
	// The reason this is asserted by POSTING rather than by matching the string against a known
	// path: the calculators in this repository serve different routes on purpose (tools/R and
	// tools/calculator serve /esgame, the FastAPI example serves "/"), so there is no single
	// correct suffix to compare against. What is common to all of them is that the URL in
	// config.json must reach a handler. That is the property, so that is what is tested.
	test('the calcUrl it serves names a route the calculator answers', async ({ request, baseURL }) => {
		const config = await servedConfig(request, baseURL!);
		test.skip(!config.calcUrl, 'client-side-only deployment: no backend to check');

		// An EMPTY allocation, on purpose, and this deliberately does NOT assert 200.
		//
		// What is under test is the URL, not the model: does calcUrl name a path this calculator
		// serves? Both calculators in this repository refuse an empty round with 400 -- "Refusing
		// the round: 'allocation' is empty." -- and that 400 is proof the request reached a
		// handler. A 404 is proof it did not.
		//
		// It cannot post a REAL allocation, because a valid one is specific to the board the
		// deployment serves: hexagon ids for the Dutch model, zone ids 1..196 for the agriculture
		// one. Hardcoding either would make this spec pass only against that stack -- so scoring a
		// real round is round-two.spec.ts's job, through the UI, which is board-agnostic by
		// construction.
		const res = await request.post(config.calcUrl, {
			data: { allocation: [], round: 1, score: 0, game_id: 'e2e-stack' },
			headers: { 'Content-Type': 'application/json' },
			timeout: 120_000,
		});

		expect(res.status(), `POST ${config.calcUrl} answered 404. calcUrl names a path the ` +
			`calculator does not serve -- the configuration is wrong, not the calculator.`).not.toBe(404);
		expect(res.status(), `POST ${config.calcUrl} answered ${res.status()}; nothing is routing there.`)
			.toBeLessThan(500);
	});

	// DEFECT 2: the stack set CALC_URL but not DEFAULT_MODE, so it served the CLIENT-SIDE grid
	// game with a calculator configured. docs/static-vs-dynamic.rst states the invariant that
	// broke: "Static: calcUrl is empty, so GameService.goToNextLevel never makes a request."
	//
	// The app no longer POSTs from GRID mode whatever calcUrl says, so this combination is no
	// longer a broken round — but it is still a deployment that started containers it does not
	// use, and saying so is cheaper than wondering later why the calculator is idle.
	test('a configured backend means the dynamic game is what it serves', async ({ request, baseURL }) => {
		const config = await servedConfig(request, baseURL!);
		if (!config.calcUrl) return;   // client-side-only: nothing to reconcile

		expect(config.defaultMode,
			`calcUrl is "${config.calcUrl}" but defaultMode is "${config.defaultMode}". ` +
			`This stack runs a calculator and then serves the client-side grid game, which never ` +
			`calls it. Set DEFAULT_MODE=dynamic, or clear CALC_URL.`).toBe('dynamic');
	});

	// The dataset the mode actually selects has to be there. A defaultMode pointing at a
	// dynamicDataUrl that 404s gives a blank board and a console error, which is a slower way to
	// learn the same thing.
	test('the dataset for the served mode is served too', async ({ request, baseURL }) => {
		const config = await servedConfig(request, baseURL!);
		const url = config.defaultMode === 'dynamic' ? config.dynamicDataUrl : config.staticDataUrl;
		const res = await request.get(`${baseURL}/${url}`);
		expect(res.status(), `${url} (the ${config.defaultMode} dataset) must be served`).toBe(200);

		// Served, and actually the dataset. An SPA fallback answers every path with index.html at
		// 200, which config.service.ts has its own guard for — this is the same trap one layer out.
		const body = await res.json();
		expect(Array.isArray(body.maps), `${url} must be game data, not the SPA fallback page`).toBe(true);
	});
});
