import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dismissHelp, clickPastHelp } from './dynamic-game';

// The grid game and tools/calculator must agree, in a browser, on the same allocation.
//
// They are the same game: dataGridExample.json is 28 x 29 with elementSize 2, and every raster it
// renders is bit-identical to the matrix the service scores with (docs/reference/static-calculator.rst).
// So the service's VALIDATED mode — the default, the one a deployment would use — has an oracle
// that is not my reading of the Angular code: the shipped game itself.
//
// This is the other half of extract/golden.test.mjs. That one pins the service against
// calc_files/game.js with validation OFF, which is what the 2013 page did. This pins it against
// what v2 does today, with validation ON. Between them the service is anchored at both ends and
// cannot drift toward either without something going red.
//
// WHY THE CELL FORM. The allocation is sent as explicit cells rather than anchors, so this also
// exercises the input form that exists for a round in which cells are given back — and it means
// the comparison does not depend on the service and the browser agreeing about what an anchor
// expands to, which would be assuming the thing under test.

const PORT = 8124;
const BASE = `http://127.0.0.1:${PORT}`;
const REPO = join(__dirname, '..', '..');
const PACK = JSON.parse(readFileSync(join(REPO, 'tools', 'calculator', 'data', 'tradeoff-ag.json'), 'utf8'));

/** v2's score-board row name -> what the service calls the same number. */
const ROWS: Record<string, { key: 'production' | 'indicators', id: string, negate: boolean }> = {
	'Arable land': { key: 'production', id: 'farm', negate: false },
	'Livestock': { key: 'production', id: 'ranch', negate: false },
	// SelectedField.updateScore pushes consequence scores * -1, so the board shows a cost as a
	// negative number while the service reports it as a positive cost.
	'Carbon': { key: 'indicators', id: 'carbon', negate: true },
	'Habitat': { key: 'indicators', id: 'habitat-quality', negate: true },
	'Water': { key: 'indicators', id: 'water-quality', negate: true },
	'Hunt': { key: 'indicators', id: 'hunting', negate: true },
};

const COLS = PACK.cols;
const cellsOfBlock = (index: number) => {
	const x = (index % COLS) + 1;
	const y = Math.floor(index / COLS) + 1;
	return [{ x, y }, { x: x + 1, y }, { x, y: y + 1 }, { x: x + 1, y: y + 1 }];
};

/**
 * Board indices whose whole 2x2 block scores something, chosen from the pack rather than by hand.
 *
 * Two constraints. The block must stay off the right and bottom edges, because v2 SLIDES a block
 * that would leave the board (getAssociatedFields) and this test would then be comparing different
 * cells — that clamp is property-tested in game.service.placement-geometry.spec.ts and is not what
 * is under test here. And the cells must be non-zero on the relevant production map, or a passing
 * comparison would only prove that 0 equals 0: most of this board is zero, which is how an earlier
 * guard in this repository came to pass against an oracle that had done nothing at all.
 */
const scoringBlocks = (mapName: string, count: number, taken: Set<string>) => {
	const grid = PACK.maps[mapName].grid as number[][];
	const found: number[] = [];
	for (let y = 1; y <= PACK.rows - 1 && found.length < count; y++) {
		for (let x = 1; x <= COLS - 1 && found.length < count; x++) {
			const block = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]];
			if (!block.every(([cx, cy]) => grid[cy - 1][cx - 1] > 0)) { continue; }
			// Leave a gap: touching blocks are legal, overlapping ones are refused by both sides.
			if (block.some(([cx, cy]) => taken.has(`${cx},${cy}`))) { continue; }
			block.forEach(([cx, cy]) => taken.add(`${cx},${cy}`));
			found.push((y - 1) * COLS + (x - 1));
		}
	}
	if (found.length < count) { throw new Error(`only ${found.length} scoring blocks for ${mapName}`); }
	return found;
};

let service: ChildProcess;

test.beforeAll(async () => {
	service = spawn('python3', [join(REPO, 'tools', 'calculator', 'src', 'server.py')], {
		env: { ...process.env, PORT: String(PORT) },
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	service.stderr?.on('data', d => process.stderr.write(`[calc] ${d}`));
	for (let i = 0; i < 60; i++) {
		try {
			const r = await fetch(`${BASE}/health`);
			if (r.ok) { return; }
		} catch { /* not up yet */ }
		await new Promise(r => setTimeout(r, 250));
	}
	throw new Error(`the calculator never answered on ${BASE}; is python3 present?`);
});

test.afterAll(() => { service?.kill(); });

test.describe('the grid game and the static calculator agree', () => {
	test.describe.configure({ mode: 'serial', timeout: 180_000 });

	test('on an allocation placed in a browser', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', e => errors.push(e.message));

		const taken = new Set<string>();
		const farmIndices = scoringBlocks('pts_crop_ag', 2, taken);
		const ranchIndices = scoringBlocks('pts_past_ps', 1, taken);

		await page.goto('/');
		await expect(page.locator('tro-grid-game-board').first()).toBeVisible();
		const fields = page.locator('.center-panel tro-field');
		await expect.poll(() => fields.count(), { timeout: 60_000 }).toBe(PACK.rows * COLS);

		const types = page.locator('tro-production-type-button');
		// Arable land is declared first in dataGridExample.json, Livestock second.
		await clickPastHelp(page, types.nth(0));
		for (const i of farmIndices) { await clickPastHelp(page, fields.nth(i)); }
		await clickPastHelp(page, types.nth(1));
		for (const i of ranchIndices) { await clickPastHelp(page, fields.nth(i)); }
		await dismissHelp(page);

		// ADVANCE A LEVEL BEFORE READING. Round 1 shows only the suitability maps — that is the
		// game's design, "fill the blank spaces based on maps that show their relative
		// productivity" — so its score board carries the two production rows and nothing else.
		// The consequence maps, and therefore the costs, appear in round 2, and the placements
		// carry over. Comparing in round 1 would check half the model and call it agreement.
		await clickPastHelp(page, page.locator('button.btn-next'));
		const rows = page.locator('tro-score-board table tr');
		await expect.poll(() => rows.count(), { timeout: 60_000 })
			.toBe(1 + Object.keys(ROWS).length);
		await dismissHelp(page);

		// What the player sees.
		const shown: Record<string, number> = {};
		const count = await rows.count();
		expect(count, 'the score board rendered no rows').toBeGreaterThan(1);
		let total = 0;
		for (let i = 0; i < count; i++) {
			const cells = rows.nth(i).locator('th,td');
			const name = (await cells.nth(0).textContent())?.trim() ?? '';
			const value = Number((await cells.nth(1).textContent())?.trim());
			if (i === 0) { total = value; } else { shown[name] = value; }
		}

		// What the service says about the same cells.
		const allocation = [
			...farmIndices.map(i => ({ type: 'farm', cells: cellsOfBlock(i) })),
			...ranchIndices.map(i => ({ type: 'ranch', cells: cellsOfBlock(i) })),
		];
		const res = await fetch(`${BASE}/score`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ allocation }),
		});
		// Read the body ONCE: consuming it for an assertion message leaves res.json() with
		// "Body is unusable", which reads like a service failure and is not one.
		const body = await res.text();
		expect(res.status, body).toBe(200);
		const scored = JSON.parse(body);

		// Guards the comparison from passing on a board where nothing scored.
		expect(scored.positive, 'the service scored nothing; the chosen cells are all zero')
			.toBeGreaterThan(0);

		for (const [name, map] of Object.entries(ROWS)) {
			expect(shown, `the score board has no "${name}" row`).toHaveProperty(name);
			const fromService = map.key === 'production'
				? scored.production[map.id] : scored.indicators[map.id];
			expect(shown[name], `${name}: browser vs service`)
				.toBe(map.negate ? -fromService : fromService);
		}
		expect(total, 'the total the player sees').toBe(scored.score);
		expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([]);
	});

	test('and the service refuses what the game will not let a player do', async () => {
		// The grid game makes overlapping placements unreachable — canFieldBePlaced() rejects a
		// block covering a cell already taken. The service enforces the same rule rather than
		// trusting a caller to have a UI in front of it, which is the whole point of validation
		// defaulting on. Same cells, both answers.
		const overlapping = {
			allocation: [
				{ type: 'farm', cells: cellsOfBlock(0) },
				{ type: 'farm', cells: cellsOfBlock(1) },
			],
		};
		const res = await fetch(`${BASE}/score`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(overlapping),
		});
		expect(res.status).toBe(400);
		expect((await res.json()).error).toContain('claimed by two pieces');
	});
});
