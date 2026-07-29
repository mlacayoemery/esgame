import tiffToSvgPaths, { toIndex } from './tiffToSvgPaths';

// tiffToSvgPaths turns a raster of values into one SVG path per distinct value — it is
// what draws the SVG board (~3,200 <path> elements on /dynamic-game) and had no tests.
// It is pure, so these are plain input/output checks.

describe('toIndex', () => {
	it('maps (x, y) to a row-major offset', () => {
		expect(toIndex(0, 0, 10)).toBe(0);
		expect(toIndex(2, 3, 10)).toBe(32);
		expect(toIndex(9, 0, 10)).toBe(9);
	});
});

describe('tiffToSvgPaths', () => {
	it('returns one entry per distinct value in the raster', () => {
		const paths = tiffToSvgPaths([[1, 2], [1, 2]]);

		expect([...paths.keys()].sort()).toEqual([1, 2]);
	});

	it('traces a uniform block as a single closed rectangle', () => {
		const paths = tiffToSvgPaths([[1, 1], [1, 1]]);

		// (0,0)-(2,2) square: move to the corner, three sides, close.
		expect(paths.get(1)).toBe('M2,2H0V0H2Z');
	});

	it('separates adjacent values into their own paths', () => {
		const paths = tiffToSvgPaths([[1, 2], [1, 2]]);

		expect(paths.get(1)).toBe('M1,2H0V0H1Z'); // left column
		expect(paths.get(2)).toBe('M2,2H1V0H2Z'); // right column
	});

	it('accepts a flat array when given options.width', () => {
		const flat = tiffToSvgPaths([1, 1, 1, 1], { width: 2 });
		const nested = tiffToSvgPaths([[1, 1], [1, 1]]);

		expect(flat.get(1)).toBe(nested.get(1));
	});

	it('rejects a flat array with no width', () => {
		expect(() => tiffToSvgPaths([1, 1, 1]))
			.toThrowError('options.width is required for 1 dimensional array.');
	});

	it('rejects a width that does not divide the data evenly', () => {
		expect(() => tiffToSvgPaths([1, 1, 1], { width: 2 }))
			.toThrowError('Invalid bitmask width. 1.5 = 3 / 2');
	});

	it('multiplies every coordinate by scale', () => {
		const paths = tiffToSvgPaths([[1, 1], [1, 1]], { scale: 2 });

		expect(paths.get(1)).toBe('M4,4H0V0H4Z');
	});

	// Regression: the moveto used to be emitted without the offsets while the H/V
	// commands added them, so an offset path started in a different coordinate space
	// from its own edges — "M2,2H10V5H12Z" instead of "M12,7H10V5H12Z".
	it('applies offsets to the moveto as well as the edges', () => {
		const paths = tiffToSvgPaths([[1, 1], [1, 1]], { offsetX: 10, offsetY: 5 });

		expect(paths.get(1)).toBe('M12,7H10V5H12Z');
	});

	it('translates the shape without changing its size', () => {
		const base = tiffToSvgPaths([[1, 1], [1, 1]]).get(1)!;
		// Equal offsets on both axes, so every coordinate shifts by the same amount
		// regardless of whether the path grammar puts an x or a y in that position.
		const moved = tiffToSvgPaths([[1, 1], [1, 1]], { offsetX: 3, offsetY: 3 }).get(1)!;

		const coords = (p: string) => (p.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
		const [b, m] = [coords(base), coords(moved)];

		expect(m.length).toBe(b.length);
		expect(m).toEqual(b.map(n => n + 3));
	});

	it('leaves output unchanged for the options the app actually passes', () => {
		// tiff.service.ts calls it with { width, height: undefined, scale: 1 } and no offsets.
		const withOpts = tiffToSvgPaths([1, 1, 1, 1], { width: 2, height: undefined, scale: 1 });

		expect(withOpts.get(1)).toBe('M2,2H0V0H2Z');
	});
});
