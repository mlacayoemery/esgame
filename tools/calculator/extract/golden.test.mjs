// The committed golden fixture must still be what calc_files/game.js produces.
//
//   node --test 'tools/calculator/extract/*.test.mjs'
//
// test_model.py checks the Python service against golden/allocations.json. That pairing alone would
// be a closed loop: if the fixture were ever regenerated from the service, or hand-edited to make a
// failing test pass, both would agree forever and neither would have anything to do with the game.
// This is the open end — the fixture re-derived from the ORIGINAL and diffed.
//
// It also guards the oracle itself. A DOM shim that stopped driving game.js would produce a fixture
// of zeroes, which a service returning zeroes would match perfectly.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PACK_PATH, original } from './oracle.mjs';
import { build } from './make-golden.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const committed = JSON.parse(readFileSync(join(here, '..', 'golden', 'allocations.json'), 'utf8'));
const pack = JSON.parse(readFileSync(PACK_PATH, 'utf8'));

test('the shim actually drives the original', () => {
	// Most of this board is zero — it is a 29 x 28 rectangle around an irregular study area, the
	// same shape the static game's own raster has — so a hand-picked coordinate can score nothing
	// and make this pass against an oracle that did nothing at all. (5,5) is such a cell, which is
	// how this guard came to be written from the pack instead of from a guess.
	const grid = pack.maps.pts_crop_ag.grid;
	let cell = null;
	for (let y = 1; y <= pack.rows - 1 && !cell; y++) {
		for (let x = 1; x <= pack.cols - 1 && !cell; x++) { if (grid[y - 1][x - 1] > 0) { cell = { x, y }; } }
	}
	assert.ok(cell, 'the farm production map is entirely zero; the pack is wrong');

	const got = original([cell], [], []);
	assert.ok(Number.isFinite(got.score), `the original produced ${got.score}`);
	assert.notEqual(got.a_total, 0, `a farm at (${cell.x}, ${cell.y}) should score something`);
});

test('the committed fixture is what the original produces today', () => {
	const fresh = build();
	assert.equal(fresh.cases.length, committed.cases.length, 'case count');
	for (const [i, c] of fresh.cases.entries()) {
		const was = committed.cases[i];
		const where = `case #${i}: ${JSON.stringify({ farms: c.farms, ranches: c.ranches, setAsides: c.setAsides })}`;
		assert.deepEqual(was.farms, c.farms, `farms, ${where}`);
		assert.deepEqual(was.ranches, c.ranches, `ranches, ${where}`);
		assert.deepEqual(was.setAsides, c.setAsides, `setAsides, ${where}`);
		assert.deepEqual(was.expected, c.expected,
			`the original now scores this differently — regenerate the fixture. ${where}`);
	}
});

test('the fixture proves something', () => {
	// Same reasoning as make-golden.mjs's own refusal, asserted against what is COMMITTED rather
	// than against what was just built.
	const scoring = committed.cases.filter(c => c.expected.score !== 0).length;
	assert.ok(scoring > committed.cases.length / 2,
		`only ${scoring} of ${committed.cases.length} committed cases score anything`);
});
