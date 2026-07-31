import gradients, { CustomColors, Gradient, applyGradientOverrides } from './gradients';

describe('Gradient.calculateColor', () => {
	it('returns the start color at ratio 1 and the end color at ratio 0', () => {
		const g = new Gradient('ff0000', '00ff00', []);
		expect(g.calculateColor(1)).toBe('ff0000');
		expect(g.calculateColor(0)).toBe('00ff00');
	});
});

describe('applyGradientOverrides', () => {
	// These exercise the self-resetting override used by per-deployment theming (e.g. places).
	afterEach(() => applyGradientOverrides({})); // leave the global gradients at defaults

	it('overrides the start/end stops of a named gradient', () => {
		applyGradientOverrides({ red: { start: 'F8F27D', end: 'A80000' } });
		expect(gradients.get('red')!.startingColor).toBe('F8F27D');
		expect(gradients.get('red')!.endingColor).toBe('A80000');
	});

	it('resets a previously-overridden gradient to its built-in default when not in the new overrides', () => {
		applyGradientOverrides({ red: { start: 'AAAAAA', end: 'BBBBBB' } });
		applyGradientOverrides({}); // no red -> must reset, not leak
		expect(gradients.get('red')!.startingColor).toBe('ffc0c0');
		expect(gradients.get('red')!.endingColor).toBe('c90000');
	});

	it('leaves untouched gradients at their defaults', () => {
		applyGradientOverrides({ yellow: { start: '111111', end: '222222' } });
		expect(gradients.get('green')!.startingColor).toBe('edf8e9');
	});
});

// calculateColor slices its colours by index and parseInt's each pair, so a stop that is not
// six bare hex digits does not fail — it produces a colour. "#F8F27D", the form every other
// colour in this file and in data.json's fieldColor uses, gave calculateColor(0.5) = "NaN8814":
// only the first channel lands on the "#", and the other two read shifted pairs, so the result
// looks plausible and is wrong.
describe('applyGradientOverrides with colours a deployment might reasonably write', () => {
	let errors: string[];
	beforeEach(() => {
		errors = [];
		vi.spyOn(console, 'error').mockImplementation((...a: any[]) => { errors.push(a.map(String).join(' ')); });
	});
	afterEach(() => { vi.restoreAllMocks(); applyGradientOverrides({}); });

	it('accepts a #-prefixed colour and produces the same result as the bare form', () => {
		applyGradientOverrides({ red: { start: '#F8F27D', end: '#A80000' } });
		const withHash = gradients.get('red')!.calculateColor(0.5);
		const rgbWithHash = gradients.get('red')!.calculateColorRGB(0.5);

		applyGradientOverrides({ red: { start: 'F8F27D', end: 'A80000' } });
		const bare = gradients.get('red')!.calculateColor(0.5);

		expect(withHash).toBe(bare);
		expect(withHash).not.toContain('NaN');
		expect(rgbWithHash.every(c => Number.isInteger(c))).toBe(true);
		expect(errors).toEqual([]);
	});

	it('expands three-digit shorthand', () => {
		applyGradientOverrides({ red: { start: '#f00', end: '#00f' } });

		expect(gradients.get('red')!.startingColor).toBe('ff0000');
		expect(gradients.get('red')!.endingColor).toBe('0000ff');
		expect(errors).toEqual([]);
	});

	it('keeps the built-in colour and says so when the override is not a colour', () => {
		const before = gradients.get('red')!.startingColor;

		applyGradientOverrides({ red: { start: 'nonsense' } });

		expect(gradients.get('red')!.startingColor).toBe(before);
		expect(gradients.get('red')!.calculateColor(0.5)).not.toContain('NaN');
		expect(errors.join(' ')).toContain('gradientOverrides.red.start');
	});

	it('says nothing for a valid override', () => {
		applyGradientOverrides({ red: { start: 'AABBCC', end: '#DDEEFF' } });

		expect(errors).toEqual([]);
	});
});

// colorToRgb turns a deployment-supplied colour into the pixels of the background map. It used
// to slice by index assuming #RRGGBB, so every other CSS form was read from the wrong offsets
// and produced a colour rather than an error — which the canvas then painted. NaN enters a
// Uint8ClampedArray as 0, so nothing downstream noticed either.
describe('CustomColors.colorToRgb', () => {
	const c = new CustomColors('x');

	it('reads #RRGGBB', () => {
		expect(c.colorToRgb('#40916c')).toEqual([64, 145, 108, 255]);
	});

	it('reads #RRGGBBAA', () => {
		expect(c.colorToRgb('#b2b2b2c0')).toEqual([178, 178, 178, 192]);
	});

	// The regression. #FFF is white; the old code read [255, 15, NaN, 255] — near-pure red.
	it('expands #RGB shorthand instead of reading it from the wrong offsets', () => {
		expect(c.colorToRgb('#FFF')).toEqual([255, 255, 255, 255]);
		expect(c.colorToRgb('#f0f')).toEqual([255, 0, 255, 255]);
	});

	it('expands #RGBA shorthand', () => {
		expect(c.colorToRgb('#f0fa')).toEqual([255, 0, 255, 170]);
	});

	// Every channel of every accepted form must be a real byte. This is the property that
	// actually matters: a NaN here is silently painted as 0.
	for (const v of ['#40916c', '#b2b2b2c0', '#FFF', '#f0fa', '#FFFFFF']) {
		it(`gives four real bytes for ${v}`, () => {
			const rgba = c.colorToRgb(v);
			expect(rgba).toHaveLength(4);
			expect(rgba.every((x: number) => Number.isInteger(x) && x >= 0 && x <= 255)).toBe(true);
		});
	}

	// A named colour is valid CSS but cannot be resolved without a DOM. Refusing is honest;
	// reading it by offset gave [235, 236, 202, NaN].
	for (const v of ['rebeccapurple', '#12345', 'rgb(1,2,3)', '', 'not a colour']) {
		it(`returns the transparent default rather than nonsense for ${JSON.stringify(v)}`, () => {
			expect(c.colorToRgb(v)).toEqual([255, 255, 255, 0]);
		});
	}

	it('returns the transparent default when the colour is unset', () => {
		expect(c.colorToRgb(undefined)).toEqual([255, 255, 255, 0]);
	});
});
