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
		// These were 'ffc0c0'/'c90000' until 2026-08-15, which were not the ends of red's own
		// palette — so a red map rendered as one pair on a grid board and a different pair on an
		// SVG board. They are the ColorBrewer Reds ends now.
		expect(gradients.get('red')!.startingColor).toBe('fee5d9');
		expect(gradients.get('red')!.endingColor).toBe('a50f15');
	});

	it('restores the built-in ramp too, not just the stops', () => {
		applyGradientOverrides({ blue: { start: '000000', end: 'ffffff' } });
		applyGradientOverrides({});
		// If only the stops were reset, this would still be the two-colour override ramp and the
		// middle of the range would be grey.
		expect(gradients.get('blue')!.calculateColor(0.5)).toBe('6baed6');
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

// game.service calls this on every SVG level build, to render the background map at 25%
// opacity. It sliced by index like colorToRgb did, so a shorthand colour came out with five
// hex digits — not a colour at all, and the intended one lost.
describe('CustomColors.addTransparencyToColors', () => {
	const withColor = (v: string) => {
		const c = new CustomColors('x');
		c.set(1, v);
		c.addTransparencyToColors('3F');   // the 25% opacity game.service asks for
		return c;
	};

	it('appends the alpha to #RRGGBB', () => {
		expect(withColor('#40916c').get(1)).toBe('#40916c3F');
	});

	it('replaces an alpha that is already there', () => {
		expect(withColor('#b2b2b2c0').get(1)).toBe('#b2b2b23F');
	});

	// The regression: this used to give #FFF3F, which colorToRgb reads as fully transparent.
	// Compared case-insensitively — hex colours are, and the expansion keeps the input's case.
	it('expands shorthand rather than producing five hex digits', () => {
		expect(withColor('#FFF').get(1).toLowerCase()).toBe('#ffffff3f');
		expect(withColor('#f0fa').get(1).toLowerCase()).toBe('#ff00ff3f');
	});

	// The property that matters: whatever comes out has to survive the trip to pixels with the
	// requested alpha, for every form the data files use.
	for (const v of ['#40916c', '#b2b2b2c0', '#FFF', '#f0fa']) {
		it(`${v} still paints with the requested alpha`, () => {
			const rgba = withColor(v).getRgb(1)!;
			expect(rgba.every((x: number) => Number.isInteger(x))).toBe(true);
			expect(rgba[3]).toBe(0x3F);
		});
	}

	it('leaves a colour it cannot parse alone rather than mangling it', () => {
		expect(withColor('rebeccapurple').get(1)).toBe('rebeccapurple');
	});
});

// startingColor and endingColor are public fields, so "they are always bare 6-digit hex" was
// true only by inspecting every assignment. Nothing enforced it — and reading hex from fixed
// offsets was the same mistake found in four separate places in this codebase on one day.
// These drive Gradient directly, the way a seventh built-in or another caller would.
describe('Gradient stops assigned in any hex form', () => {
	const forms = [
		['bare 6-digit', 'F8F27D', 'A80000'],
		['#-prefixed', '#F8F27D', '#A80000'],
		['#RGB shorthand', '#ff0', '#a00'],
		['lower case', 'f8f27d', 'a80000'],
	] as const;

	// The reference: the form the built-ins are written in.
	const reference = new Gradient('F8F27D', 'A80000', []).calculateColor(0.5);

	for (const [name, start, end] of forms) {
		it(`${name} produces a real colour`, () => {
			const g = new Gradient(start, end, []);

			expect(g.calculateColor(0.5)).not.toContain('NaN');
			expect(g.calculateColorRGB(0.5).every((c: number) => Number.isInteger(c))).toBe(true);
		});
	}

	it('#-prefixed gives the same colour as the bare form', () => {
		expect(new Gradient('#F8F27D', '#A80000', []).calculateColor(0.5)).toBe(reference);
	});

	it('lower case gives the same colour as upper', () => {
		expect(new Gradient('f8f27d', 'a80000', []).calculateColor(0.5)).toBe(reference);
	});

	// A stop assigned after construction is the applyGradientOverrides path, and any future one.
	it('survives a stop assigned after construction', () => {
		const g = new Gradient('F8F27D', 'A80000', []);

		g.startingColor = '#0f0';

		expect(g.calculateColor(0.5)).not.toContain('NaN');
		expect(g.calculateColorRGB(0.5).every((c: number) => Number.isInteger(c))).toBe(true);
	});
});


// The six built-ins are ColorBrewer 5-class sequential palettes. A continuous map used only their
// two ENDS until 2026-08-15: mix() drew a straight RGB line from lightest to darkest and threw
// away the three classes between, while the grid game coloured by the full palette — so the same
// gradient rendered two different ways depending on the board type. A ColorBrewer sequence is not
// a straight line in RGB; being perceptually even is the entire reason to use one.
describe('a continuous map follows the whole ColorBrewer palette', () => {
	afterEach(() => applyGradientOverrides({}));

	// Blues 5-class: eff3ff bdd7e7 6baed6 3182bd 08519c. With five stops the quarter points land
	// exactly on a class, which is what makes these assertions exact rather than approximate.
	it('lands on the palette classes at the quarter points', () => {
		const blue = gradients.get('blue')!;
		expect(blue.calculateColor(1)).toBe('eff3ff');
		expect(blue.calculateColor(0.75)).toBe('bdd7e7');
		expect(blue.calculateColor(0.5)).toBe('6baed6');
		expect(blue.calculateColor(0.25)).toBe('3182bd');
		expect(blue.calculateColor(0)).toBe('08519c');
	});

	it('is not the straight line between the two ends', () => {
		// What the old two-stop mix produced at the midpoint of Blues. If this ever comes back,
		// the palette is being ignored again.
		expect(gradients.get('blue')!.calculateColor(0.5)).not.toBe('7ca2ce');
	});

	it('every built-in ends on its own palette ends', () => {
		for (const name of ['blue', 'green', 'orange', 'purple', 'red', 'yellow']) {
			const g = gradients.get(name)!;
			const palette = g.colors.slice(1).map(c => c.replace(/^#/, '').toLowerCase());
			expect(g.calculateColor(1), `${name} light end`).toBe(palette[0]);
			expect(g.calculateColor(0), `${name} dark end`).toBe(palette[palette.length - 1]);
		}
	});

	// An override names two colours, so it gets a two-colour ramp. Keeping ColorBrewer's middle
	// classes under colours a deployment chose would make the override look ignored mid-range.
	it('an override collapses the ramp to the two colours it named', () => {
		applyGradientOverrides({ blue: { start: '000000', end: 'ffffff' } });
		expect(gradients.get('blue')!.calculateColor(1)).toBe('000000');
		expect(gradients.get('blue')!.calculateColor(0)).toBe('ffffff');
		expect(gradients.get('blue')!.calculateColor(0.5)).toBe('808080');
	});

	// The brown is a grid-map colour for the first distinct value; interpolating it into a blue
	// ramp would be wrong, and it is the one entry of `colors` the ramp excludes.
	it('does not interpolate the leading brown', () => {
		expect(gradients.get('blue')!.colors[0]).toBe('#d2b188');
		expect(gradients.get('blue')!.ramp).not.toContain('#d2b188');
	});

	it('still produces a colour for a gradient built with no palette', () => {
		const g = new Gradient('ff0000', '00ff00', []);
		expect(g.calculateColor(0.5)).not.toContain('NaN');
		expect(g.calculateColorRGB(0.5).every((c: number) => Number.isInteger(c))).toBe(true);
	});
});
