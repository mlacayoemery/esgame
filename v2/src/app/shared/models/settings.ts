import { GameBoardType } from "./game-board-type";
import { DefaultGradients, applyGradientOverrides } from "../helpers/gradients";
import { TranslateService } from "@ngx-translate/core";

type LanguageString = Record<string, string>;

/** Optional, deployment-specific visual theming flags. All default to esgame's built-in look. */
export interface VisualOptions {
	/** Render consequence-map fields semi-transparent and overlay the consequence image. */
	consequenceFieldOpacity: boolean;
	/** Outline the currently focused board. */
	highlightFocusedBoard: boolean;
	/** Use neutral (black) map-title colors instead of positive/negative green/red. */
	neutralScoreColors: boolean;
}

const DEFAULT_VISUAL_OPTIONS: VisualOptions = {
	consequenceFieldOpacity: false,
	highlightFocusedBoard: false,
	neutralScoreColors: false
};

export class Settings {
	highlightColor: string;
	elementSize: number;
	gameBoardColumns: number;
	gameBoardRows: number;
	minValue: number;
	maxValue: number;
	minSelected: number;
	imageMode: boolean;
	basicInstructions: LanguageString;
	advancedInstructions: LanguageString;
	defaultProductionType: number;
	calcUrl: string;
	mode: 'GRID' | 'SVG';
	infiniteLevels: boolean;
	productionTypes: { id: number, name: LanguageString, fieldColor: string, urlToIcon: string, maxElements: number }[] = [];
	maps: { id: string, name: LanguageString, gradient: DefaultGradients, customColorId: string, gameBoardType: GameBoardType, productionTypes: number[], urlToData: string, values?: number[] }[] = [];
	customColors: { id: string, colors: { number: number, color: string }[] }[];
	basicInstructionsImageUrl: string;
	advancedInstructionsImageUrl: string;
	visualOptions: VisualOptions = { ...DEFAULT_VISUAL_OPTIONS };
	/**
	 * Colour SVG boards from the raster's distinct values, one palette entry each, the way a grid
	 * board is coloured — instead of stretching them across minValue..maxValue.
	 *
	 * For a board whose rasters hold a handful of classes rather than a continuous surface. Stated
	 * by the dataset rather than guessed from the value count, because "few distinct values" is a
	 * property of the data a deployment happens to ship, not a declaration of how it means to be
	 * read.
	 */
	paletted?: boolean;
	/**
	 * Score the round in the BROWSER, so the numbers move as pieces are placed.
	 *
	 * The board already carries what this needs: every field on a consequence board holds that
	 * cell's value, and SelectedField.updateScore records it per map — the same arithmetic the
	 * grid game is scored by. Without this the score board and the chart are drawn from the
	 * calculator's reply and therefore only change when a round is submitted.
	 *
	 * Opt-in per dataset, because it is only correct where the browser can reproduce the model.
	 * It can for the agriculture game, whose consequence rasters ARE the cost surfaces. It cannot
	 * for the Dutch model, where calculator.r solves a distance-decay field over the landscape.
	 */
	clientScored?: boolean;
	/**
	 * Open the instructions by itself on levels 1 and 2. Defaults to true, which is what SVG mode
	 * has always done — the grid level never did, so a board meant to match it wants this off.
	 */
	autoOpenInstructions?: boolean;
	/**
	 * Let a round that has been submitted go on being edited.
	 *
	 * Defaults to false, which is what advancing has always done — the previous level is frozen.
	 * A board that wants a player to go back and try a different first round sets this; the rounds
	 * keep their own allocations either way, so changing one does not move the other's numbers.
	 */
	editablePreviousRounds?: boolean;
	/**
	 * Lay the score sheet out as one column per production type — what that conversion gains,
	 * then what it costs — instead of one row per map name.
	 *
	 * Opt-in, because the alternative is not merely a different look: grouping by name SUMS the
	 * maps that share one, which is the only sensible reading where a consequence map belongs to
	 * several production types at once, as assets/data.json's do.
	 */
	scoreByConversion?: boolean;
	/** SVG-mode cell border (between zones). Optional; defaults to the built-in look when unset. */
	gridLineColor?: string;
	gridLineWidth?: string;
	/** SVG-mode hover-highlight border width (in board units). Optional; defaults to the built-in 2. */
	highlightWidth?: string;

	constructor(
		private translate: TranslateService,
		data: any
	) {
		this.mapData(data);
	}

	/**
	 * Fields this class dereferences, and therefore cannot do without.
	 *
	 * Omitting any of them used to give "Cannot read properties of undefined (reading 'map')" —
	 * which names neither the field nor the file, and a deployment writes this file by hand. They
	 * are collected and reported together rather than one per attempt, because a data.json being
	 * written from scratch is usually missing more than one.
	 *
	 * `visualOptions` and `gradientOverrides` are deliberately absent: they already default via
	 * `?? {}` just below, and are genuinely optional.
	 */
	private static missingRequired(data: any): string[] {
		const missing: string[] = [];
		const isArray = (v: any) => Array.isArray(v);
		if (!isArray(data.productionTypes)) missing.push('productionTypes (an array)');
		if (!isArray(data.maps)) missing.push('maps (an array)');
		if (isArray(data.maps)) {
			data.maps.forEach((m: any, i: number) => {
				if (!isArray(m?.productionTypes)) {
					missing.push(`maps[${i}]${m?.id ? ` (id "${m.id}")` : ''}.productionTypes (an array)`);
				}
			});
		}
		return missing;
	}

	mapData(data: any) {
		if (!data) return;

		const missing = Settings.missingRequired(data);
		if (missing.length) {
			throw new Error(
				`The game data is missing ${missing.length === 1 ? 'a required field' : 'required fields'}: ` +
				`${missing.join(', ')}. Every deployment supplies its own data file, so this is a ` +
				`problem with that file rather than with the game.`);
		}

		this.elementSize = data.elementSize;
		this.gameBoardColumns = data.gameBoardColumns;
		this.gameBoardRows = data.gameBoardRows;
		this.imageMode = data.imageMode;
		this.defaultProductionType = Number.parseInt(data.defaultProductionType);
		this.mode = data.mapMode == "svg" ? 'SVG' : 'GRID';
		this.infiniteLevels = data.infiniteLevels;
		this.highlightColor = data.highlightColor;
		this.basicInstructions = data.basicInstructions;
		this.advancedInstructions = data.advancedInstructions;
		this.calcUrl = data.calcUrl;
		this.paletted = data.paletted;
		this.clientScored = data.clientScored;
		this.autoOpenInstructions = data.autoOpenInstructions;
		this.editablePreviousRounds = data.editablePreviousRounds;
		this.scoreByConversion = data.scoreByConversion;
		this.gridLineColor = data.gridLineColor;
		this.gridLineWidth = data.gridLineWidth;
		this.highlightWidth = data.highlightWidth;
		this.productionTypes = data.productionTypes.map((o: any) => ({ id: Number.parseInt(o.id), name: o.name, fieldColor: o.fieldColor, urlToIcon: o.urlToIcon, maxElements: o.maxElements }));
		this.maps = data.maps.map((o: any) => ({ id: o.id, name: o.name, gradient: convertGradient(o.gradient), customColorId: o.customColorId, gameBoardType: convertGameBoardType(o.gameBoardType), productionTypes: o.productionTypes.map((p: any) => Number.parseInt(p)), urlToData: o.urlToData, values: o.values }));
		this.customColors = data.customColors;
		this.basicInstructionsImageUrl = data.basicInstructionsImageUrl;
		this.advancedInstructionsImageUrl = data.advancedInstructionsImageUrl;
		this.minValue = data.minValue;
		this.maxValue = data.maxValue;
		this.minSelected = data.minSelected;
		this.visualOptions = { ...DEFAULT_VISUAL_OPTIONS, ...(data.visualOptions ?? {}) };
		applyGradientOverrides(data.gradientOverrides ?? {});

		// Every one of these was an unguarded index into an object the data file may not have,
		// so a data.json with no `title` — or a map with no `name` — took the whole game down
		// with "Cannot read properties of undefined (reading 'en')". A missing label is a missing
		// label: report it and render the rest.
		const langs = this.translate.getLangs();
		const missingText: string[] = [];
		const text = (obj: any, lang: string, what: string) => {
			const v = obj?.[lang];
			if (v === undefined) missingText.push(`${what} (${lang})`);
			return v;
		};
		langs.forEach((lang) => {
			this.maps.forEach(o => {
				let translation = {} as any;
				translation["map_name_" + o.id] = text(o.name, lang, `maps["${o.id}"].name`);
				this.translate.setTranslation(lang, translation, true);
			});
			this.productionTypes.forEach(o => {
				let translation = {} as any;
				translation["production_type_" + o.id] = text(o.name, lang, `productionTypes[${o.id}].name`);
				this.translate.setTranslation(lang, translation, true);
			});
			let translation = {} as any;
			translation["basic_instructions"] = text(this.basicInstructions, lang, 'basicInstructions');
			translation["advanced_instructions"] = text(this.advancedInstructions, lang, 'advancedInstructions');
			translation["title"] = text(data.title, lang, 'title');
			this.translate.setTranslation(lang, translation, true);
		});
		if (missingText.length) {
			console.error(
				`The game data has no text for: ${missingText.join(', ')}. ` +
				`Those labels will be blank.`);
		}
	}
}

/**
 * A deployment writes these strings by hand, and both converters used to accept anything.
 *
 * convertGameBoardType's `default` turned every typo into a Suitability map — measured:
 * "Consequense" and "Backgrund" both became SuitabilityMap, so a mistyped consequence map
 * rendered as a suitability one and a mistyped background left the game with none.
 * convertGradient was a bare cast, so "blu" and "BLUE" were stored unchanged and then looked up
 * as undefined, giving a blank board or "Cannot read properties of undefined (reading 'colors')".
 *
 * The fallbacks stay — refusing to start over one mistyped map would be worse — but they no
 * longer happen in silence.
 */
const convertGameBoardType = (type: string) => {
	switch (type) {
		case "Suitability": return GameBoardType.SuitabilityMap;
		case "Consequence": return GameBoardType.ConsequenceMap;
		case "Drawing": return GameBoardType.DrawingMap;
		case "Background": return GameBoardType.BackgroundMap;
		default:
			console.error(
				`The game data has a map with gameBoardType ${JSON.stringify(type)}, which is not ` +
				`one of Suitability, Consequence, Drawing, Background. Treating it as a ` +
				`Suitability map, which is very likely not what was meant.`);
			return GameBoardType.SuitabilityMap;
	}
};

/**
 * "custom" is not a gradient and not a mistake: it is the marker a map uses to say its colours
 * come from `customColorId` instead. src/assets/data.json's Background map is written that way,
 * and getSvgBackground passes `undefined` for the gradient and the CustomColors separately, so
 * nothing ever looks it up.
 *
 * Reporting it was a false alarm on the game's own shipped data — every load of the dynamic
 * game logged an error about a correct configuration. A guard that cries wolf on the common
 * case is worse than no guard, because it teaches people to ignore the ones that matter.
 */
const CUSTOM_COLOURS_MARKER = 'custom';

const convertGradient = (gradientName: string) => {
	const known = Object.values(DefaultGradients) as string[];
	if (known.includes(gradientName)) return gradientName as DefaultGradients;
	// Passed through unchanged, not defaulted: a map marked `custom` must NOT end up looking
	// like it asked for blue.
	if (gradientName === CUSTOM_COLOURS_MARKER) return gradientName as unknown as DefaultGradients;
	// An absent gradient is normal — a map may use customColors instead — so only a value that
	// was given and is wrong is worth reporting.
	if (gradientName !== undefined && gradientName !== null && gradientName !== '') {
		console.error(
			`The game data asks for gradient ${JSON.stringify(gradientName)}, which does not ` +
			`exist. Known gradients: ${known.join(', ')} (lower case). Falling back to ` +
			`${DefaultGradients.Blue}.`);
		// Actually fall back, rather than passing the bad name on. gradients.get() would return
		// undefined, and getGridGameBoard dereferences it — `gradients.get(x)!.colors[i]` — so
		// the alternative to a wrong-but-working gradient is a crash.
		return DefaultGradients.Blue;
	}
	// Absent: left as-is. A map may legitimately have no gradient and use customColors instead,
	// and arrayToImage branches on that.
	return gradientName as unknown as DefaultGradients;
};
