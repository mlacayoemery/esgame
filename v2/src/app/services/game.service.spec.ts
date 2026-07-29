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
