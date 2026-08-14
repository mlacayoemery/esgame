import { LegendBoardComponent } from './legend-board.component';
import { Legend, LegendElement } from '../shared/models/legend';

// The legend is what tells a player which colour means what, and its whole behaviour lives in
// one setter: sort, then either build a CSS gradient from the first two entries or drop the
// zero entry. Untested until now.

const element = (forValue: number, color: string): LegendElement => ({ forValue, color });

const legend = (elements: LegendElement[], opts: Partial<Legend> = {}): Legend =>
	Object.assign(new Legend(), { elements, isNegative: false, isGradient: false }, opts);

describe('LegendBoardComponent', () => {

	describe('discrete legends', () => {
		it('orders entries by value', () => {
			const c = new LegendBoardComponent();

			c.legendData = legend([element(3, 'c'), element(1, 'a'), element(2, 'b')]);

			expect(c.legendElements.map(e => e.forValue)).toEqual([1, 2, 3]);
		});

		// forValue 0 is the "no data" entry and is not shown.
		it('drops the zero entry', () => {
			const c = new LegendBoardComponent();

			c.legendData = legend([element(0, 'none'), element(1, 'a')]);

			expect(c.legendElements.map(e => e.forValue)).toEqual([1]);
		});

		it('carries isNegative through', () => {
			const c = new LegendBoardComponent();

			c.legendData = legend([element(1, 'a')], { isNegative: true });

			expect(c.isNegative).toBe(true);
		});

		it('builds no gradient', () => {
			const c = new LegendBoardComponent();

			c.legendData = legend([element(1, 'a'), element(2, 'b')]);

			expect(c.gradient).toBe('');
			expect(c.isGradient).toBe(false);
		});
	});

	describe('gradient legends', () => {
		it('builds a CSS gradient from the two lowest values', () => {
			const c = new LegendBoardComponent();

			c.legendData = legend([element(2, 'ff0000'), element(1, '00ff00')], { isGradient: true });

			expect(c.gradient).toBe('linear-gradient(90deg, #00ff00, #ff0000)');
		});

		it('keeps the zero entry rather than filtering it', () => {
			const c = new LegendBoardComponent();

			c.legendData = legend([element(0, 'aaaaaa'), element(1, 'bbbbbb')], { isGradient: true });

			expect(c.legendElements.map(e => e.forValue)).toEqual([0, 1]);
		});

		// isGradient is both an @Input and set here, so the data wins over whatever the template
		// bound — which is what makes the host class track the legend rather than the caller.
		it('overrides the isGradient input from the data', () => {
			const c = new LegendBoardComponent();
			c.isGradient = false;

			c.legendData = legend([element(1, 'a'), element(2, 'b')], { isGradient: true });

			expect(c.isGradient).toBe(true);
		});
	});

	describe('edge cases', () => {
		it('ignores an absent legend', () => {
			const c = new LegendBoardComponent();
			c.legendData = legend([element(1, 'a')]);
			const before = c.legendElements;

			c.legendData = undefined as any;

			expect(c.legendElements).toBe(before);
		});

		// sort() sorts in place, so the Legend handed in comes back reordered. Worth recording:
		// a Legend shared between two boards is mutated by whichever renders first.
		it('reorders the caller\'s own array', () => {
			const c = new LegendBoardComponent();
			const data = legend([element(2, 'b'), element(1, 'a')]);

			c.legendData = data;

			expect(data.elements.map(e => e.forValue)).toEqual([1, 2]);
		});

		// This used to throw: elements[1] was indexed unguarded, giving "Cannot read properties
		// of undefined (reading 'color')". Since the setter runs during change detection, that
		// took out the view binding the legend rather than merely rendering it wrong.
		it('renders a one-entry gradient as a solid bar', () => {
			const c = new LegendBoardComponent();

			c.legendData = legend([element(1, 'abcdef')], { isGradient: true });

			expect(c.gradient).toBe('linear-gradient(90deg, #abcdef, #abcdef)');
		});

		it('renders nothing for an empty gradient legend', () => {
			const c = new LegendBoardComponent();

			c.legendData = legend([], { isGradient: true });

			expect(c.gradient).toBe('');
		});

		it('does not throw for a short gradient legend', () => {
			const c = new LegendBoardComponent();

			expect(() => { c.legendData = legend([element(1, 'a')], { isGradient: true }); }).not.toThrow();
			expect(() => { c.legendData = legend([], { isGradient: true }); }).not.toThrow();
		});
	});

	// A consequence map is published stretched to its OWN round — calculator.r applies
	// `(x - min) / (max - min) * 100` per round — so its ramp runs 0-100 whatever the exposure
	// behind it was. The template prints words rather than those numbers when this is set, and
	// this is the flag it keys off.
	describe('round-relative legends', () => {
		it('carries isRoundRelative through', () => {
			const c = new LegendBoardComponent();

			c.legendData = legend([element(0, 'a'), element(100, 'b')],
				{ isGradient: true, isRoundRelative: true });

			expect(c.isRoundRelative).toBe(true);
		});

		// The default matters as much as the flag: a suitability map's numbers come from the
		// dataset and DO mean something, so it must not be relabelled by inheriting a stale value.
		it('defaults to false, and resets between bindings', () => {
			const c = new LegendBoardComponent();

			c.legendData = legend([element(0, 'a'), element(100, 'b')],
				{ isGradient: true, isRoundRelative: true });
			c.legendData = legend([element(0, 'a'), element(100, 'b')], { isGradient: true });

			expect(c.isRoundRelative).toBe(false);
		});
	});
});
