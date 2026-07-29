import { firstValueFrom } from 'rxjs';
import { GameService } from './game.service';
import { ProductionType } from '../shared/models/production-type';

// GameService's placement rules are the actual rules of the game — a field cannot be
// used twice, and a production type cannot exceed its maxElements. Both live in the
// private canFieldBePlaced(), so these drive them through the public API instead of
// reaching in: loadSettings -> setSelectedProductionType -> selectField.

// The four constructor dependencies are untouched by placement, so they are stubs.
// Settings only calls getLangs/setTranslation, and only when given i18n data.
const translateStub: any = { getLangs: () => [], setTranslation: () => { } };
const newService = () => new GameService({} as any, {} as any, translateStub, {} as any);

// elementSize 1 keeps getAssociatedFields to a single field, so each selectField(id)
// maps to exactly one board cell and the assertions stay about the rules, not geometry.
const settingsData = {
	title: { en: 'T' },
	mapMode: 'grid',
	elementSize: 1,
	gameBoardColumns: 4,
	gameBoardRows: 4,
	productionTypes: [],
	maps: [],
	customColors: []
};

const productionType = (id: number, maxElements: number) =>
	new ProductionType(id, '#000000', null as any, '', maxElements);

const selectedIds = (service: GameService) =>
	firstValueFrom(service.selectedFieldsObs).then(
		fields => fields.flatMap(f => f.fields.map(x => x.id)).sort((a, b) => a - b));

describe('GameService placement rules', () => {
	let service: GameService;

	beforeEach(() => {
		service = newService();
		service.loadSettings(settingsData);
	});

	it('places a field once a production type is selected', async () => {
		service.setSelectedProductionType(productionType(1, 0));
		service.selectField(5);

		expect(await selectedIds(service)).toEqual([5]);
	});

	it('ignores selectField when no production type is selected', async () => {
		service.selectField(5);

		expect(await selectedIds(service)).toEqual([]);
	});

	it('refuses to place a second production type on an occupied field', async () => {
		service.setSelectedProductionType(productionType(1, 0));
		service.selectField(5);
		service.setSelectedProductionType(productionType(2, 0));
		service.selectField(5);

		// Still one placement: the field is taken, so the second attempt is dropped.
		expect(await selectedIds(service)).toEqual([5]);
	});

	it('stops placing once the production type reaches maxElements', async () => {
		const limited = productionType(1, 2);
		service.setSelectedProductionType(limited);
		service.selectField(1);
		service.selectField(2);
		service.selectField(3); // over quota

		expect(await selectedIds(service)).toEqual([1, 2]);
	});

	it('treats maxElements 0 as unlimited', async () => {
		service.setSelectedProductionType(productionType(1, 0));
		[1, 2, 3, 4, 5].forEach(id => service.selectField(id));

		expect(await selectedIds(service)).toEqual([1, 2, 3, 4, 5]);
	});

	it('frees a field again after deselectField', async () => {
		service.setSelectedProductionType(productionType(1, 0));
		service.selectField(5);
		service.deselectField(5);

		expect(await selectedIds(service)).toEqual([]);

		// and the freed field can be taken by another production type
		service.setSelectedProductionType(productionType(2, 0));
		service.selectField(5);
		expect(await selectedIds(service)).toEqual([5]);
	});

	it('clears the highlight when the hovered field cannot be placed', async () => {
		service.setSelectedProductionType(productionType(1, 0));
		service.selectField(5);

		service.highlightOnOtherFields(5); // already occupied
		expect(await firstValueFrom(service.highlightFieldObs)).toEqual([]);

		service.highlightOnOtherFields(6); // free
		expect((await firstValueFrom(service.highlightFieldObs)).map(f => f.id)).toEqual([6]);
	});

	it('resets placements when settings are reloaded', async () => {
		service.setSelectedProductionType(productionType(1, 0));
		service.selectField(5);
		expect(await selectedIds(service)).toEqual([5]);

		service.loadSettings(settingsData);

		expect(await selectedIds(service)).toEqual([]);
	});
});

// With elementSize > 1 a click places a square block whose top-left is the clicked cell,
// except near the right/bottom edges where getAssociatedFields shifts the block back onto
// the board. That clamping is index arithmetic with real off-by-one risk, and it decides
// what a player actually gets when they click near an edge.
describe('GameService placement geometry (elementSize 2)', () => {
	let service: GameService;

	// 4x4 board, ids 0..15 laid out row-major:
	//    0  1  2  3
	//    4  5  6  7
	//    8  9 10 11
	//   12 13 14 15
	const board2 = { ...settingsData, elementSize: 2 };

	beforeEach(() => {
		service = newService();
		service.loadSettings(board2);
		service.setSelectedProductionType(productionType(1, 0));
	});

	it('places a 2x2 block anchored at the clicked cell', async () => {
		service.selectField(5);
		expect(await selectedIds(service)).toEqual([5, 6, 9, 10]);
	});

	it('shifts the block left when the click is against the right edge', async () => {
		service.selectField(7); // rightmost column — a block anchored here would overflow
		expect(await selectedIds(service)).toEqual([6, 7, 10, 11]);
	});

	it('shifts the block up when the click is on the bottom row', async () => {
		service.selectField(13);
		expect(await selectedIds(service)).toEqual([9, 10, 13, 14]);
	});

	it('shifts both ways in the bottom-right corner', async () => {
		service.selectField(15);
		expect(await selectedIds(service)).toEqual([10, 11, 14, 15]);
	});

	it('rejects a block that would overlap an existing one', async () => {
		service.selectField(5);            // occupies 5, 6, 9, 10
		service.selectField(6);            // would occupy 6, 7, 10, 11 — overlaps
		expect(await selectedIds(service)).toEqual([5, 6, 9, 10]);

		service.selectField(2);            // 2, 3, 6, 7 — also overlaps at 6
		expect(await selectedIds(service)).toEqual([5, 6, 9, 10]);
	});

	it('counts a whole block as one element against maxElements', async () => {
		service.setSelectedProductionType(productionType(2, 1));
		service.selectField(0);            // one block = one element, quota now full
		service.selectField(2);            // non-overlapping, but over quota
		expect(await selectedIds(service)).toEqual([0, 1, 4, 5]);
	});
});
