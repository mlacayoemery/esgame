// Turns calc_files/game.js into data/tradeoff-ag.json — the model pack the service scores with.
//
//   node tools/calculator-js/tools/extract-pack.mjs
//
// GENERATED, NOT COPIED. The ten matrices are 29 x 28 numbers each, about 8,000 values, and a
// hand-copied one would be wrong in a way no reviewer could see: a single transposed row still
// scores, still looks plausible, and differs from the original game only for allocations nobody
// tried. So the pack is derived from calc_files/game.js by EVALUATING it, and
// test/differential.test.mjs then runs the original's own calculate() against the service's model
// on random allocations and requires the totals to agree exactly.
//
// game.js is a browser script from 2013: it declares the matrices with `var` at top level and then
// defines functions that reach for `document`. Evaluating it in a Node vm with no DOM is enough to
// capture the data — the functions are only ever CALLED by the page, and by the differential test,
// which supplies its own shim.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const source = join(repo, 'calc_files', 'game.js');
const out = join(here, '..', 'data', 'tradeoff-ag.json');

const context = createContext({});
runInContext(readFileSync(source, 'utf8'), context, { filename: 'game.js' });

/** The matrices game.js declares, and what each one means in the model. */
const MAPS = {
	pts_crop_ag: 'farm production',
	pts_past_ps: 'ranch production',
	pts_aghq: 'habitat quality, farm',
	pts_pshq: 'habitat quality, ranch',
	pts_agcarb: 'carbon, farm',
	pts_pscarb: 'carbon, ranch',
	pts_agrec: 'hunting/recreation, farm',
	pts_psrec: 'hunting/recreation, ranch',
	pts_agwq: 'water quality, farm',
	pts_pswq: 'water quality, ranch',
};

const grids = {};
let rows = null;
let cols = null;
for (const name of Object.keys(MAPS)) {
	const m = context[name];
	if (!Array.isArray(m)) { throw new Error(`${name} is not an array in game.js`); }
	rows ??= m.length;
	cols ??= m[0].length;
	// Every map must be the same shape, or "the same cell" means different things per map and the
	// sums below are adding unrelated places together.
	if (m.length !== rows) { throw new Error(`${name} has ${m.length} rows, expected ${rows}`); }
	for (const [i, row] of m.entries()) {
		if (row.length !== cols) { throw new Error(`${name} row ${i} has ${row.length} cols, expected ${cols}`); }
		for (const v of row) {
			if (typeof v !== 'number' || !Number.isFinite(v)) { throw new Error(`${name} row ${i} holds ${v}`); }
		}
	}
	grids[name] = m;
}

const pack = {
	id: 'tradeoff-ag',
	name: 'Tradeoff: Agriculture Edition (the 2013 board)',
	// Recorded so a reader can tell where these numbers came from without diffing 32KB of arrays.
	source: 'calc_files/game.js, itself generated from pts_*.tif by tif_to_js.py',
	rows,
	cols,
	// A placement covers a 2x2 block: game.js adds (x+1,y), (x,y+1) and (x+1,y+1) to every farm and
	// ranch coordinate. Set-asides are single cells.
	placementSize: 2,
	productionTypes: [
		{ id: 'farm', name: 'Farm', production: 'pts_crop_ag',
			consequences: ['pts_aghq', 'pts_agcarb', 'pts_agrec', 'pts_agwq'] },
		{ id: 'ranch', name: 'Ranch', production: 'pts_past_ps',
			consequences: ['pts_pshq', 'pts_pscarb', 'pts_psrec', 'pts_pswq'] },
	],
	// Which consequence maps are the same indicator, so the response can report one number per
	// service rather than one per (service x production type).
	indicators: [
		{ id: 'habitat-quality', name: 'Habitat quality', maps: ['pts_aghq', 'pts_pshq'] },
		{ id: 'carbon', name: 'Carbon', maps: ['pts_agcarb', 'pts_pscarb'] },
		{ id: 'hunting', name: 'Hunting and recreation', maps: ['pts_agrec', 'pts_psrec'] },
		{ id: 'water-quality', name: 'Water quality', maps: ['pts_agwq', 'pts_pswq'] },
	],
	maps: Object.fromEntries(Object.entries(MAPS).map(([k, description]) => [k, { description, grid: grids[k] }])),
};

writeFileSync(out, JSON.stringify(pack) + '\n');
console.log(`wrote ${out}`);
console.log(`  ${rows} rows x ${cols} cols, ${Object.keys(MAPS).length} maps, ` +
	`${rows * cols * Object.keys(MAPS).length} values`);
