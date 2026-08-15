/**
 * Expand a CSS hex colour to its 6- or 8-digit form, or null if it is not one.
 *
 * Shared because this class slices hex by index in two places, and both got it wrong for the
 * shorthand forms. #RGB and #RGBA mean each digit doubled; 5 and 7 digits are not colours.
 */
export function expandHexColor(value: string | undefined): string | null {
	const m = /^#([0-9a-fA-F]{3,8})$/.exec(value?.trim() ?? '');
	if (!m) return null;
	const digits = m[1].length === 3 || m[1].length === 4
		? m[1].split('').map(c => c + c).join('')
		: m[1];
	return digits.length === 6 || digits.length === 8 ? digits : null;
}

export class Gradient {
	constructor(startingColor: string, endingColor: string, colors: string[]) {
		this.startingColor = startingColor;
		this.endingColor = endingColor;
		this.colors = colors;
		// colors[0] is the brown a grid map gives its first distinct value; the rest are the
		// palette proper. See `ramp`.
		this.ramp = colors.slice(1);
	}

	colors: string[];
	startingColor: string;
	endingColor: string;

	/**
	 * The colours a CONTINUOUS map is interpolated through, lightest first.
	 *
	 * The six built-ins are ColorBrewer 5-class sequential palettes — Blues, Greens, Oranges,
	 * Purples, Reds — and until 2026-08-15 a continuous map used only their two ENDS: `mix()`
	 * drew a straight line in RGB from lightest to darkest and discarded the three classes
	 * between. A ColorBrewer sequence is not a straight line in RGB; being perceptually even is
	 * the whole reason to use one. The grid game was already colouring by the full palette
	 * (`colors`), so the same gradient rendered two different ways depending on the board type.
	 *
	 * `colors[0]` is excluded on purpose: it is `#d2b188`, a brown that a grid map assigns to its
	 * first distinct value, and interpolating brown into a blue ramp would be wrong.
	 *
	 * A deployment's `gradientOverrides` replaces this with exactly the two colours it named —
	 * asking for a two-colour gradient and getting ColorBrewer's middle classes anyway would be
	 * a surprise. See applyGradientOverrides.
	 */
	ramp: string[];

	/**
	 * The two stops, as bare 6-digit hex whatever form they were assigned in.
	 *
	 * Both are public fields, so "they are always bare hex" was true only by inspecting every
	 * assignment: six built-ins written that way, and applyGradientOverrides normalising the
	 * config path. Nothing enforced it, and the same mistake — reading hex from fixed offsets —
	 * was found in four places in this codebase on one day. A seventh gradient written "#abcdef",
	 * or a Gradient built anywhere else, would silently produce "NaN8814" again.
	 *
	 * Doing it here makes every assignment path safe, including ones not written yet.
	 * applyGradientOverrides still validates, because it can say WHICH override was wrong.
	 */
	private stops(): { start: string, end: string } {
		return {
			start: expandHexColor(`#${this.startingColor.replace(/^#/, '')}`)?.slice(0, 6) ?? '000000',
			end: expandHexColor(`#${this.endingColor.replace(/^#/, '')}`)?.slice(0, 6) ?? '000000',
		};
	}

	/** The ramp as bare 6-digit hex, falling back to the two stops if it is empty or malformed. */
	private rampStops(): string[] {
		const expanded = this.ramp
			.map(c => expandHexColor(`#${String(c).replace(/^#/, '')}`)?.slice(0, 6))
			.filter((c): c is string => !!c);
		if (expanded.length >= 2) { return expanded; }
		const { start, end } = this.stops();
		return [start, end];
	}

	/**
	 * Interpolate the ramp. ratio 1 is the lightest end and 0 the darkest, which is the sense
	 * TiffService.arrayToImage passes and the opposite of what "ratio" usually suggests.
	 */
	private mix(ratio: number): number[] {
		const stops = this.rampStops();
		// Position along the ramp, from the light end. Clamped because a caller may hand over a
		// value outside the configured range, and an out-of-range index silently yields NaN.
		const pos = Math.min(1, Math.max(0, 1 - ratio)) * (stops.length - 1);
		const lo = Math.floor(pos);
		const hi = Math.min(stops.length - 1, lo + 1);
		const t = pos - lo;
		const channel = (i: number) => Math.ceil(
			parseInt(stops[lo].substring(i, i + 2), 16) * (1 - t) +
			parseInt(stops[hi].substring(i, i + 2), 16) * t);
		return [channel(0), channel(2), channel(4)];
	}

	/** The ramp as bare 6-digit hex, lightest first — what a legend must draw to match the map. */
	rampColors(): string[] {
		return this.rampStops();
	}

	calculateColor(ratio: number) : string {
		const hex = (x: number) => {
			const strValue = x.toString(16);
			return (strValue.length == 1) ? '0' + strValue : strValue;
		};

		const [r, g, b] = this.mix(ratio);
		return hex(r) + hex(g) + hex(b);
	}

	calculateColorRGB(ratio: number) : number[] {
		return this.mix(ratio);
	}
}

let gradients: Map<string, Gradient> = new Map<string, Gradient>();
gradients.set('blue', new Gradient("eff3ff", "08519c", ['#d2b188', '#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c']));
gradients.set('green', new Gradient("edf8e9", "006d2c", ['#d2b188', '#edf8e9', '#bae4b3', '#74c476', '#31a354', '#006d2c']));
gradients.set('orange', new Gradient("feedde", "a63603", ['#d2b188', '#feedde', '#fdbe85', '#fd8d3c', '#e6550d', '#a63603']));
gradients.set('purple', new Gradient("f2f0f7", "54278f", ['#d2b188', '#f2f0f7', '#cbc9e2', '#9e9ac8', '#756bb1', '#54278f']));
// red's stops were "ffc0c0"/"c90000", which are not the ends of its own palette — so a red map
// rendered as one pair of colours on a grid board and a different pair on an SVG board. They are
// the ColorBrewer Reds ends now, like every other gradient here.
gradients.set('red', new Gradient("fee5d9", "a50f15", ['#d2b188', '#fee5d9', '#fcae91', '#fb6a4a', '#de2d26', '#a50f15']));
gradients.set('yellow', new Gradient("F8F27D", "670B0D", ['#d2b188', '#F8F27D', '#F7D068', '#F6A825', '#AE5322', '#670B0D']));

// Snapshot the built-in start/end colors so per-deployment overrides can be reset between configs.
const defaultGradientStops = new Map<string, { start: string, end: string }>();
gradients.forEach((g, name) => defaultGradientStops.set(name, { start: g.startingColor, end: g.endingColor }));
// The built-in ColorBrewer ramps, so an override can be undone by the next config load.
const defaultGradientRamps = new Map<string, string[]>();
gradients.forEach((g, name) => defaultGradientRamps.set(name, [...g.ramp]));

export interface GradientOverride { start?: string; end?: string; }

/**
 * Apply per-deployment gradient start/end overrides from config (e.g. data.json `gradientOverrides`).
 * Always resets to the built-in defaults first, so loading a config without overrides restores them
 * and one config's override never leaks into the next.
 */
/**
 * Normalise a deployment-supplied stop colour to the bare 6-hex-digit form the maths expects.
 *
 * calculateColor slices the string by index and parseInt's each pair, so anything else produces
 * a colour rather than an error. "#F8F27D" — the form every other colour in this file and in
 * data.json's fieldColor uses — gives calculateColor(0.5) = "NaN8814" and
 * calculateColorRGB(0.5) = [null, 136, 20]: not a failure, a plausible-looking wrong colour,
 * because only the first channel lands on the "#" while the other two read shifted pairs.
 * Junk gives "NaNNaNNaN". Measured, both of them.
 *
 * Returns null for anything that is not a colour, so the caller can keep the built-in default.
 */
function normaliseStop(value: string, gradient: string, which: 'start' | 'end'): string | null {
	const bare = value.trim().replace(/^#/, '');
	if (/^[0-9a-fA-F]{6}$/.test(bare)) return bare;
	// Three-digit shorthand is valid CSS and an easy thing to write; expand rather than reject.
	if (/^[0-9a-fA-F]{3}$/.test(bare)) return bare.split('').map(c => c + c).join('');
	console.error(
		`gradientOverrides.${gradient}.${which} is ${JSON.stringify(value)}, which is not a ` +
		`6-digit hex colour. Keeping the built-in ${gradient} ${which} colour. ` +
		`Both "#RRGGBB" and "RRGGBB" are accepted.`);
	return null;
}

export function applyGradientOverrides(overrides: { [name: string]: GradientOverride } = {}) {
	// Reset first, ramp included: this runs on every config load, and without restoring the ramp a
	// deployment that removed an override would keep the two-colour one from the previous load.
	defaultGradientStops.forEach((d, name) => {
		const g = gradients.get(name);
		if (g) { g.startingColor = d.start; g.endingColor = d.end; g.ramp = defaultGradientRamps.get(name) ?? g.ramp; }
	});
	Object.keys(overrides).forEach(name => {
		const g = gradients.get(name);
		const o = overrides[name];
		if (g && o) {
			if (o.start) g.startingColor = normaliseStop(o.start, name, 'start') ?? g.startingColor;
			if (o.end) g.endingColor = normaliseStop(o.end, name, 'end') ?? g.endingColor;
			// An override names two colours, so it gets a two-colour ramp. Keeping ColorBrewer's
			// middle classes under colours the deployment chose would produce a gradient nobody
			// asked for — and would make the override look ignored in the middle of the range.
			if (o.start || o.end) { g.ramp = [g.startingColor, g.endingColor]; }
		}
	});
}

export default gradients;

export enum DefaultGradients {
	Blue = 'blue',
	Green = 'green',
	Orange = 'orange',
	Purple = 'purple',
	Red = 'red',
	Yellow = 'yellow'
}

export class CustomColors {
	private colors = new Map<number, string>();
	id: string;

	constructor(id: string) {
		this.id = id;
	}

	get(i: number) {
		const returnVal = this.colors.get(i);
		if (!returnVal) return "#FFFFFF";
		return returnVal;
	}

	set(key: number, value: string) {
		this.colors.set(key, value);
	}

	/**
	 * Replace every colour's alpha with the given one, for the semi-transparent background map.
	 *
	 * This was `value.slice(0, 7) + transparencyHex`, which is right only for #RRGGBB and
	 * #RRGGBBAA. Measured with "3F", the 25% opacity game.service asks for:
	 *
	 *   #40916c     #40916c3F   [64, 145, 108, 63]
	 *   #b2b2b2c0   #b2b2b23F   [178, 178, 178, 63]    existing alpha correctly replaced
	 *   #FFF        #FFF3F      [255, 255, 255, 0]     5 digits: the colour is lost entirely
	 *
	 * A colour that cannot be parsed is left alone rather than turned into something that is
	 * not a colour at all.
	 */
	addTransparencyToColors(transparencyHex: string) {
		this.colors.forEach((value, key) => {
			const digits = expandHexColor(value);
			if (digits) this.colors.set(key, `#${digits.slice(0, 6)}${transparencyHex}`);
		});
	}

	getRgb(i: number) {
		return this.colorToRgb(this.colors.get(i));
	}

	/**
	 * Deployment-supplied colour to RGBA, for painting a raster into a canvas.
	 *
	 * This used to slice by index, assuming #RRGGBB or #RRGGBBAA. Every other CSS colour form is
	 * then read from the wrong offsets and produces a colour rather than an error, which the
	 * canvas paints. Measured, since the offsets do not misbehave in the way one would guess —
	 * "#FFF".slice(3, 5) is "F", not "":
	 *
	 *   #FFF            [255, 15, NaN, 255]     white paints as near-pure red
	 *   #f0fa           [240, 250, NaN, 255]
	 *   rebeccapurple   [235, 236, 202, NaN]    a valid CSS colour, read as nonsense
	 *
	 * NaN then enters a Uint8ClampedArray as 0, so nothing downstream notices either.
	 *
	 * Now: 3, 4, 6 and 8 digit hex are all parsed, and anything else returns the same
	 * transparent default an unknown value already did. Named colours and rgb() cannot be
	 * resolved without a DOM, so refusing them is the honest answer — and it is a better one
	 * than painting 235,236,202.
	 */
	colorToRgb(hex: string | undefined) {
		const transparent = [255, 255, 255, 0];
		const digits = expandHexColor(hex);
		if (!digits) return transparent;
		const pair = (i: number) => parseInt(digits.slice(i, i + 2), 16);
		return [pair(0), pair(2), pair(4), digits.length === 8 ? pair(6) : 255];
	}
}
