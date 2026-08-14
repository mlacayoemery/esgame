// Runs the ORIGINAL calc_files/game.js and returns what it scored.
//
// game.js is the 2013 static game's calculator — its first line says it "will be used in the
// backend to calculate overall scores". The service in ../src is that backend, and this is the
// thing that decides whether the service is right: not a reading of the original, the original.
//
// It is a browser script. It reads its inputs out of a <table> of <input> elements and writes its
// outputs into more of them, so it runs here under a DOM shim narrow enough to be obviously
// faithful — getElementById returns either an input table or a value holder, and nothing else is
// provided. It is evaluated in a vm context because game.js overwrites Array.prototype.indexOf,
// which would otherwise be inflicted on this process.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
export const REPO = join(here, '..', '..', '..');
export const PACK_PATH = join(here, '..', 'data', 'tradeoff-ag.json');

const gameJs = readFileSync(join(REPO, 'calc_files', 'game.js'), 'utf8');

/** The output fields calculate() writes into, by the ids it uses. */
export const OUTPUTS = ['a_total', 'r_total', 'pos_total', 'hq_total', 'c_total', 'hf_total',
	'wq_total', 'neg_total', 'score'];

/** A <table> of coordinate inputs: row 0 is labels, rows 1..n hold x in cells[1] and y in cells[2]. */
const inputTable = (pairs, rowCount) => {
	const rows = [{ cells: [] }];
	for (let i = 1; i <= rowCount; i++) {
		const p = pairs[i - 1];
		rows.push({ cells: [{}, { firstChild: { value: p ? String(p.x) : '' } },
			{ firstChild: { value: p ? String(p.y) : '' } }] });
	}
	return { rows };
};

/**
 * Score one allocation with the original.
 *
 * The original reads at most 4 farms, 4 ranches and 5 set-asides, because that is how many rows its
 * page has. Anything beyond that is silently ignored by it, so it is rejected here instead of
 * being quietly dropped into a comparison.
 */
export const original = (farms, ranches, setAsides) => {
	if (farms.length > 4 || ranches.length > 4 || setAsides.length > 5) {
		throw new Error('the original reads 4 farms, 4 ranches and 5 set-asides; it would ignore the rest');
	}
	const out = Object.fromEntries(OUTPUTS.map(id => [id, { value: '' }]));
	const tables = {
		farms: inputTable(farms, 4),
		ranching: inputTable(ranches, 4),
		setasides: inputTable(setAsides, 5),
	};
	const context = createContext({
		document: {
			getElementById: id => tables[id] ?? out[id]
				?? (() => { throw new Error(`the shim has no element "${id}"`); })(),
			// clearText() walks these; calculate() never does.
			getElementsByTagName: () => [],
		},
	});
	runInContext(gameJs, context, { filename: 'game.js' });
	context.calculate();
	return Object.fromEntries(OUTPUTS.map(id => [id, Number(out[id].value)]));
};

/** Deterministic PRNG, so a fixture is reproducible and a failure carries its seed. */
export const rng = seed => () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

/**
 * The allocations the golden fixture covers.
 *
 * Coordinates stay where a 2x2 block remains on the board. The original runs off the right and
 * bottom edges — its bounds test rejects a cell only when it is off the board in BOTH directions —
 * and scores NaN there, which the service refuses instead. That difference is deliberate, and is
 * asserted directly rather than smuggled into a comparison against NaN.
 */
export const allocations = (pack, count) => {
	const random = rng(20260814);
	const pick = n => 1 + Math.floor(random() * n);
	const coord = () => ({ x: pick(pack.cols - 1), y: pick(pack.rows - 1) });
	return Array.from({ length: count }, () => ({
		farms: Array.from({ length: Math.floor(random() * 5) }, coord),
		ranches: Array.from({ length: Math.floor(random() * 5) }, coord),
		setAsides: Array.from({ length: Math.floor(random() * 6) }, coord),
	}));
};
