import { ChangeDetectorRef, ElementRef, Renderer2 } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { GridFieldComponent } from './grid-field.component';
import { Field, HighlightSide } from '../../shared/models/field';
import { FieldType } from '../../shared/models/field-type';
import { ProductionType } from '../../shared/models/production-type';

// One GridFieldComponent per board cell — 2,436 of them on the default board — so this is
// what actually paints a placed farm. Its constructor calls takeUntilDestroyed() with no
// argument, which requires an injection context, hence runInInjectionContext.

const EMPTY = '#eeeeee';
const CORN = '#ffcc00';

const field = (editable = true) => new Field(1, new FieldType(EMPTY), 0, null, editable);
const cornType = () => new ProductionType(11, CORN, null as any, '', 0);

function fakeGameService() {
	const settings = new BehaviorSubject<any>({ elementSize: 1, imageMode: false, highlightColor: '#ff0000' });
	const calls: string[] = [];
	return {
		settings, calls,
		service: {
			settingsObs: settings.asObservable(),
			productionTypesObs: new BehaviorSubject<any[]>([]).asObservable(),
			highlightFieldObs: new Subject().asObservable(),
			selectedFieldsObs: new Subject().asObservable(),
			notSelectedFieldsObs: new Subject().asObservable(),
			removeHighlight: () => calls.push('removeHighlight'),
			selectField: (id: number) => calls.push(`select:${id}`),
			deselectField: (id: number) => calls.push(`deselect:${id}`),
			highlightOnOtherFields: (id: number) => calls.push(`highlight:${id}`),
		} as any,
	};
}

function build() {
	const g = fakeGameService();
	const renderer = { listen: () => () => { } } as unknown as Renderer2;
	const cd = { markForCheck: () => { } } as ChangeDetectorRef;
	const c = TestBed.runInInjectionContext(
		() => new GridFieldComponent(g.service, renderer, new ElementRef({}), cd));
	return { c, g };
}

describe('GridFieldComponent size', () => {
	it('renders the given size as a square in px', () => {
		const { c } = build();

		c.size = 24;

		expect(c.fieldWidth).toBe('24px');
		expect(c.fieldHeight).toBe('24px');
	});

	it('falls back to 10px when the size is null', () => {
		const { c } = build();

		c.size = null;

		expect(c.fieldWidth).toBe('10px');
		expect(c.fieldHeight).toBe('10px');
	});
});

describe('GridFieldComponent colouring', () => {
	it('shows the field type colour while empty', () => {
		const { c } = build();

		c.field = field();

		expect(c.backgroundColor).toBe(EMPTY);
	});

	it('shows the production type colour once assigned', () => {
		const { c } = build();
		c.field = field();

		c.assign(cornType(), HighlightSide.ALLSIDES);

		expect(c.backgroundColor).toBe(CORN);
	});

	it('does not repaint on assign in image mode, since the icon carries the meaning', () => {
		const { c } = build();
		c.imageMode = true;
		c.field = field();

		c.assign(cornType(), HighlightSide.ALLSIDES);

		// assign() skips setColor() entirely in image mode, so the cell keeps the
		// empty-field colour it was painted when `field` was set.
		expect(c.backgroundColor).toBe(EMPTY);
	});

	it('setColor itself also ignores the production type in image mode', () => {
		const { c } = build();
		c.field = field();
		c.field.productionType = cornType();

		// Called directly: the assertion above cannot reach this branch, because
		// assign() never invokes setColor() while image mode is on.
		c.imageMode = true;
		c.setColor();
		expect(c.backgroundColor).toBe(EMPTY);

		c.imageMode = false;
		c.setColor();
		expect(c.backgroundColor).toBe(CORN);
	});

	it('treats only strictly-false as not image mode', () => {
		const { c } = build();

		c.imageMode = 0 as any;
		expect(c.imageMode).toBe(true);

		c.imageMode = false;
		expect(c.imageMode).toBe(false);
	});
});

describe('GridFieldComponent assign and unassign', () => {
	it('marks the field assigned, records the type and drops the hover highlight', () => {
		const { c, g } = build();
		c.field = field();
		const pt = cornType();

		c.assign(pt, HighlightSide.TOPLEFT);

		expect(c.isAssigned).toBe(true);
		expect(c.field.assigned).toBe(true);
		expect(c.field.productionType).toBe(pt);
		expect(c.highlightSide).toBe(HighlightSide.TOPLEFT);
		// the placement highlight is no longer wanted once the farm is down
		expect(g.calls).toContain('removeHighlight');
	});

	it('reverses all of that on unassign', () => {
		const { c } = build();
		c.field = field();
		c.assign(cornType(), HighlightSide.TOPLEFT);
		c.showProductionTypeImage();

		c.unassign();

		expect(c.isAssigned).toBe(false);
		expect(c.field.assigned).toBe(false);
		expect(c.field.productionType).toBe(null);
		expect(c.highlightSide).toBe(HighlightSide.NONE);
		expect(c.showProductionImage).toBe(false);
		expect(c.backgroundColor).toBe(EMPTY);
	});
});

describe('GridFieldComponent highlight', () => {
	it('records the side it was highlighted from', () => {
		const { c } = build();
		c.field = field();

		c.highlight(HighlightSide.BOTTOMRIGHT);

		expect(c.isHighlighted).toBe(true);
		expect(c.highlightSide).toBe(HighlightSide.BOTTOMRIGHT);
	});

	// Deliberate divergence from FieldBaseComponent, which gates highlight() on
	// field.editable. The grid override does not: placement eligibility is already
	// decided upstream by GameService.canFieldBePlaced before a highlight is requested.
	it('highlights even a non-editable field, unlike the base class', () => {
		const { c } = build();
		c.field = field(false);

		c.highlight(HighlightSide.ALLSIDES);

		expect(c.isHighlighted).toBe(true);
	});
});

describe('GridFieldComponent settings', () => {
	it('follows elementSize, imageMode and highlightColor from settings', () => {
		const { c, g } = build();

		expect(c.elementSize).toBe(1);
		expect(c.imageMode).toBe(false);
		expect(c.highlightColor).toBe('#ff0000');

		g.settings.next({ elementSize: 3, imageMode: true, highlightColor: '#00ff00' });

		expect(c.elementSize).toBe(3);
		expect(c.imageMode).toBe(true);
		expect(c.highlightColor).toBe('#00ff00');
	});
});
