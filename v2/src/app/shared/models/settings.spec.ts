import { Settings } from './settings';

// Minimal TranslateService stub: no languages registered, so mapData's i18n loop is a no-op.
const translateStub: any = { getLangs: () => [], setTranslation: () => { } };

const baseData = {
	title: { en: 'T' },
	mapMode: 'svg',
	productionTypes: [],
	maps: [],
	customColors: []
};

describe('Settings.mapData', () => {
	it('defaults visualOptions to all-off when the config omits them', () => {
		const s = new Settings(translateStub, { ...baseData });
		expect(s.visualOptions).toEqual({
			consequenceFieldOpacity: false,
			highlightFocusedBoard: false,
			neutralScoreColors: false
		});
	});

	it('parses provided visualOptions and keeps defaults for the rest', () => {
		const s = new Settings(translateStub, { ...baseData, visualOptions: { neutralScoreColors: true } });
		expect(s.visualOptions.neutralScoreColors).toBe(true);
		expect(s.visualOptions.highlightFocusedBoard).toBe(false);
	});

	it('maps mapMode "svg" -> SVG and "grid" -> GRID', () => {
		expect(new Settings(translateStub, { ...baseData, mapMode: 'svg' }).mode).toBe('SVG');
		expect(new Settings(translateStub, { ...baseData, mapMode: 'grid' }).mode).toBe('GRID');
	});
});
