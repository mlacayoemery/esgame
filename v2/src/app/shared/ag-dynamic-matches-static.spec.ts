import dataGridExample from '../../assets/dataGridExample.json';
import dataAgDynamic from '../../assets/dataAgDynamic.json';

// The two agriculture datasets are the SAME GAME. dataGridExample.json is played on grid blocks
// and scored in the browser; dataAgDynamic.json is played on SVG zones. That is the whole of the
// intended difference — the maps behind them are the same rasters and must be drawn alike.
//
// This exists because they twice drifted apart in a way nobody could see from the JSON. Declaring
// `values: [0, 25, 50, 75, 100, 125]` on the dynamic consequence maps did not merely add an empty
// swatch to the legend: a paletted board colours a value by its INDEX in that list, so a
// six-entry scale moved every class one step along the gradient, and all four consequence maps
// came out in colours the static game never shows. The rasters hold [0, 25, 50, 75, 100]; there
// is no 125 class in them.
//
// So: whatever decides a map's colours and values is pinned to the static game's copy.

type MapEntry = Record<string, unknown>;
const byId = (maps: MapEntry[]): Record<string, MapEntry> =>
	Object.fromEntries(maps.map(m => [m['id'] as string, m]));

/** The fields that decide what a map is drawn from and how it is coloured. */
const COLOUR_FIELDS = ['urlToData', 'gradient', 'customColorId', 'gameBoardType', 'productionTypes'];

describe('dataAgDynamic.json', () => {
	const staticMaps = byId(dataGridExample.maps as MapEntry[]);
	const dynamicMaps = byId(dataAgDynamic.maps as MapEntry[]);

	it('draws every one of the static game\'s maps from the same raster and gradient', () => {
		Object.entries(staticMaps).forEach(([id, expected]) => {
			const actual = dynamicMaps[id];
			expect(actual, `no map ${id} in dataAgDynamic.json`).toBeDefined();
			COLOUR_FIELDS.forEach(field => {
				expect(JSON.stringify(actual[field]), `map ${id}.${field}`)
					.toBe(JSON.stringify(expected[field]));
			});
		});
	});

	// The specific regression above. A declared scale is legitimate — it is how a map that never
	// reaches its top class can still be labelled for it — but the moment one map declares one and
	// the static game does not, the two are drawing different colours from the same raster.
	it('declares no palette scale the static game does not declare', () => {
		Object.entries(staticMaps).forEach(([id, expected]) => {
			expect('values' in dynamicMaps[id], `map ${id} declares values`)
				.toBe('values' in expected);
		});
	});

	it('places the same piece on the same board', () => {
		expect(dataAgDynamic.elementSize).toBe(dataGridExample.elementSize);
		expect(dataAgDynamic.imageMode).toBe(dataGridExample.imageMode);
		expect(dataAgDynamic.gameBoardColumns).toBe(dataGridExample.gameBoardColumns);
		expect(dataAgDynamic.gameBoardRows).toBe(dataGridExample.gameBoardRows);
		expect(dataAgDynamic.highlightColor).toBe(dataGridExample.highlightColor);
	});

	// Non-vacuity: the comparison above is only worth anything if there are maps to compare, and
	// if the dynamic dataset really is the larger of the two (it adds the zone and background
	// boards an SVG game needs and the grid game has no use for).
	it('is comparing two real datasets', () => {
		expect(Object.keys(staticMaps).length).toBe(10);
		expect(Object.keys(dynamicMaps).length).toBeGreaterThan(Object.keys(staticMaps).length);
		expect(Object.values(staticMaps).filter(m => m['gameBoardType'] === 'Consequence').length).toBe(8);
	});
});
