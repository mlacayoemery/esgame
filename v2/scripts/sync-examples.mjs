// The shipped example games live in examples/, at the top of the repository, because that is
// where someone looks for an example. The app fetches them at runtime by URL -- config.json
// names assets/dataStaticGridRect.json -- so they have to be under src/assets by the time
// anything serves the app.
//
// Angular will not do this with an assets rule: an `input` outside the workspace root is
// rejected ("The ../examples asset path must be within the workspace root"). So this copies
// them, and npm's prebuild/pretest/pree2e/prestart hooks run it before anything that needs
// them. The copies are gitignored; examples/ holds the only edited version.
//
// It REFUSES to run on an empty source rather than copying nothing and letting the build
// succeed with no datasets in it -- a game whose board 404s at runtime is exactly the failure
// that is hard to trace back to a missing copy.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');            // v2/scripts -> v2 -> repository root
const from = process.env.ESGAME_EXAMPLES_DIR ?? join(root, 'examples');
const to = resolve(here, '..', 'src', 'assets');

const games = readdirSync(from).filter(f => f.endsWith('.json'));
if (games.length === 0) {
	console.error(`!! ${from} holds no game JSON; the build would ship no datasets`);
	process.exit(1);
}

mkdirSync(to, { recursive: true });
for (const game of games) {
	copyFileSync(join(from, game), join(to, game));
}
console.log(`examples -> assets: ${games.join(', ')}`);
