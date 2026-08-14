// Writes golden/allocations.json — allocations, and what the ORIGINAL calc_files/game.js scores
// for each.
//
//   node tools/calculator/extract/make-golden.mjs
//
// The service is written in Python and the oracle is a 2013 browser script, so they cannot be run
// against each other in one process. This is the bridge: the oracle's answers, committed, and
// checked two ways.
//
//   test/test_model.py           the service must reproduce every one of these
//   extract/golden.test.mjs      the file must still be what the oracle produces TODAY
//
// The second is what stops the fixture becoming a record of what the service happens to do. A
// golden file that is only ever compared against the thing it was generated from is a check that
// cannot fail; this one is regenerated from game.js and diffed.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACK_PATH, allocations, original } from './oracle.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'golden', 'allocations.json');
const pack = JSON.parse(readFileSync(PACK_PATH, 'utf8'));

export const build = () => {
	const cases = allocations(pack, 200).map(a => ({
		...a,
		expected: original(a.farms, a.ranches, a.setAsides),
	}));

	// A fixture of empty allocations would be reproduced perfectly by a service that always returns
	// zero. Refuse to write one.
	const scoring = cases.filter(c => c.expected.score !== 0).length;
	if (scoring < cases.length / 2) {
		throw new Error(`only ${scoring} of ${cases.length} cases score anything; this fixture proves little`);
	}
	return {
		source: 'calc_files/game.js, run under extract/oracle.mjs',
		pack: pack.id,
		note: 'Regenerate with: node tools/calculator/extract/make-golden.mjs',
		cases,
	};
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const golden = build();
	writeFileSync(out, JSON.stringify(golden, null, '\t') + '\n');
	const scoring = golden.cases.filter(c => c.expected.score !== 0).length;
	console.log(`wrote ${out}`);
	console.log(`  ${golden.cases.length} allocations, ${scoring} of them scoring non-zero`);
}
