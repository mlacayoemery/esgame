import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { ProductionTypeButtonComponent } from './production-type-button.component';
import { ProductionType } from '../shared/models/production-type';

// The production-type buttons are how a player chooses what to place, so a regression here
// breaks the game outright — nothing can be placed and nothing says why. Constructed directly
// with a stub service rather than through TestBed; the component uses three members of it.

const productionType = (id: number, colour = '#123456') =>
	new ProductionType(id, colour, null as any, '', 0);

const setup = (opts: { imageMode?: boolean } = {}) => {
	const settings = new BehaviorSubject<any>({ imageMode: opts.imageMode ?? false });
	const selected = new BehaviorSubject<ProductionType | null>(null);
	const chosen: ProductionType[] = [];
	const gameStub: any = {
		settingsObs: settings,
		selectedProductionTypeObs: selected,
		setSelectedProductionType: (pt: ProductionType) => chosen.push(pt)
	};
	return { settings, selected, chosen, make: () => TestBed.runInInjectionContext(() => new ProductionTypeButtonComponent(gameStub)) };
};

describe('ProductionTypeButtonComponent', () => {

	it('is inactive until its own type is selected', () => {
		const { make } = setup();
		const pt = productionType(1);
		const c = make();
		c.productionType = pt;

		c.ngOnInit();

		expect(c.isActive).toBe(false);
	});

	it('becomes active when its own type is selected', () => {
		const { selected, make } = setup();
		const pt = productionType(1);
		const c = make();
		c.productionType = pt;
		c.ngOnInit();

		selected.next(pt);

		expect(c.isActive).toBe(true);
	});

	it('does not activate for a different type', () => {
		const { selected, make } = setup();
		const c = make();
		c.productionType = productionType(1);
		c.ngOnInit();

		selected.next(productionType(2));

		expect(c.isActive).toBe(false);
	});

	// The comparison is `o == this.productionType`, by identity. Two ProductionTypes sharing an
	// id are still different objects and will not match — worth pinning, because a refactor that
	// rebuilds the list on every emission would silently leave every button inactive.
	it('compares by identity, not by id', () => {
		const { selected, make } = setup();
		const c = make();
		c.productionType = productionType(7);
		c.ngOnInit();

		selected.next(productionType(7));   // same id, different object

		expect(c.isActive).toBe(false);
	});

	it('deactivates when the selection is cleared', () => {
		const { selected, make } = setup();
		const pt = productionType(1);
		const c = make();
		c.productionType = pt;
		c.ngOnInit();
		selected.next(pt);

		selected.next(null);

		expect(c.isActive).toBe(false);
	});

	it('selects its own type when clicked', () => {
		const { chosen, make } = setup();
		const pt = productionType(3);
		const c = make();
		c.productionType = pt;
		c.ngOnInit();

		c.onClick();

		expect(chosen).toEqual([pt]);
	});

	it('takes its colour from the production type', () => {
		const { make } = setup();
		const c = make();
		c.productionType = productionType(1, '#abcdef');

		c.ngOnInit();

		expect(c.backgroundColor).toBe('#abcdef');
	});

	it('follows imageMode from settings', () => {
		const { settings, make } = setup({ imageMode: true });
		const c = make();
		c.productionType = productionType(1);

		c.ngOnInit();
		expect(c.isImageMode).toBe(true);

		settings.next({ imageMode: false });
		expect(c.isImageMode).toBe(false);
	});
});
