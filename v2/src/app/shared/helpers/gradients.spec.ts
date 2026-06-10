import gradients, { Gradient, applyGradientOverrides } from './gradients';

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
