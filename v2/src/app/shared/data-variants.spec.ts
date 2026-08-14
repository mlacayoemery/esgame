import data from '../../assets/data.json';
import dataRect from '../../assets/dataRect.json';

// dataRect.json is data.json with a different board: the same landscape, the same production
// types, the same suitability and consequence maps, partitioned into rectangles instead of
// hexagons (tools/R/make-rect-board.R). It is a near-duplicate on purpose — the frontend selects a
// whole dataset via config.json `dynamicDataUrl`, and there is no mechanism for overriding one
// field of one.
//
// Near-duplicates drift. The translation files did exactly this and nobody noticed for long enough
// that two languages were seventeen keys behind; see i18n.spec.ts. So this pins the ONLY three
// places the two files may differ. Add a production type to data.json and forget dataRect.json and
// this fails, instead of the rectangular board quietly offering fewer choices than the hexagonal
// one.

/** Every leaf path where two JSON values differ, as `.a.b[0].c`. */
const differences = (a: unknown, b: unknown, path = ''): string[] => {
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) { return [`${path}: length ${a.length} vs ${b.length}`]; }
		return a.flatMap((x, i) => differences(x, b[i], `${path}[${i}]`));
	}
	if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
		const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
		return keys.flatMap(k => differences(
			(a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`));
	}
	return a === b ? [] : [`${path}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`];
};

describe('dataRect.json', () => {
	it('differs from data.json only in the board raster and the title', () => {
		const paths = differences(data, dataRect).map(d => d.split(':')[0]).sort();
		expect(paths).toEqual(['.maps[0].urlToData', '.title.de', '.title.en']);
	});

	it('points at the rectangular board', () => {
		expect(dataRect.maps[0].urlToData).toBe('./assets/images/New_rectangles.tif');
		expect(dataRect.maps[0].gameBoardType).toBe('Drawing');
	});

	// Guards the first test from passing on nothing: if both imports resolved to the same object,
	// or to empty ones, "they differ in exactly these three places" could not hold — but a future
	// refactor that made data.json tiny would make the whole file vacuous without this.
	it('is comparing two real datasets', () => {
		expect(data.maps.length).toBeGreaterThan(10);
		expect(dataRect.maps.length).toBe(data.maps.length);
		expect(data.productionTypes.length).toBeGreaterThan(0);
	});
});
