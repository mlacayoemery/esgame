import { ChangeDetectorRef, ElementRef, Renderer2 } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { SvgFieldComponent } from './svg-field.component';
import { Field, HighlightSide } from '../../shared/models/field';
import { FieldType } from '../../shared/models/field-type';
import { ProductionType } from '../../shared/models/production-type';

// SvgFieldComponent is one <path> per board cell. Its shouldSelect/shouldDeselect decode
// the mouse state that drives drag-to-fill and drag-to-erase, and setColor picks between a
// flat fill and an SVG pattern reference — both easy to break without noticing.

const CORN = '#ffcc00';
const field = (editable = true) => new Field(1, new FieldType('#eee'), 0, null, editable);
const cornType = (id = 11) => new ProductionType(id, CORN, null as any, '', 0);

// MouseEvent-shaped enough for the two predicates. buttons/shiftKey/ctrlKey are always
// present on a real MouseEvent, so they are defaulted here — omitting them makes
// `buttons == 1 || shiftKey` evaluate to undefined rather than false, which is an
// artefact of the double, not of the component.
const mouse = (o: Partial<MouseEvent>) =>
	({ buttons: 0, shiftKey: false, ctrlKey: false, ...o }) as MouseEvent;

function fakeRenderer() {
	const styles: Record<string, string> = {};
	const renderer = {
		listen: () => () => { },
		setStyle: (_el: unknown, prop: string, value: string) => { styles[prop] = value; },
	} as unknown as Renderer2;
	return { renderer, styles };
}

function fakeGameService(settingsValue: any = { highlightColor: '#ff0000' }) {
	const settings = new BehaviorSubject<any>(settingsValue);
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

function build(settingsValue?: any) {
	const r = fakeRenderer();
	const g = fakeGameService(settingsValue);
	const cd = { markForCheck: () => { } } as ChangeDetectorRef;
	const c = TestBed.runInInjectionContext(
		() => new SvgFieldComponent(g.service, r.renderer, new ElementRef({}), cd));
	return { c, r, g };
}

describe('SvgFieldComponent drag predicates', () => {
	it('selects on the primary button held, or with shift', () => {
		const { c } = build();

		expect(c.shouldSelect(mouse({ buttons: 1 }))).toBe(true);
		expect(c.shouldSelect(mouse({ buttons: 0, shiftKey: true }))).toBe(true);
		expect(c.shouldSelect(mouse({ buttons: 0 }))).toBe(false);
		// buttons is a bitmask, but the check is equality — the secondary button alone
		// must not count as a select.
		expect(c.shouldSelect(mouse({ buttons: 2 }))).toBe(false);
	});

	it('deselects on the secondary button held, or with ctrl', () => {
		const { c } = build();

		expect(c.shouldDeselect(mouse({ buttons: 2 }))).toBe(true);
		expect(c.shouldDeselect(mouse({ buttons: 0, ctrlKey: true }))).toBe(true);
		expect(c.shouldDeselect(mouse({ buttons: 0 }))).toBe(false);
		expect(c.shouldDeselect(mouse({ buttons: 1 }))).toBe(false);
	});
});

describe('SvgFieldComponent fill', () => {
	it('paints nothing without a field', () => {
		const { c } = build();

		c.setColor(cornType());

		expect(c.fillColor).toBeUndefined();
	});

	it('uses a flat colour on a clickable field', () => {
		const { c } = build();
		c.field = field();
		c.clickable = true;

		c.setColor(cornType());

		expect(c.fillColor).toBe(CORN);
	});

	it('appends 7D alpha for a consequence map', () => {
		const { c } = build();
		c.field = field();
		c.clickable = true;
		c.hasOpacity = true;

		c.setColor(cornType());

		expect(c.fillColor).toBe(`${CORN}7D`);
	});

	it('falls back to a per-board pattern reference when not clickable', () => {
		const { c } = build();
		c.field = field();
		c.clickable = false;
		c.gameBoardId = 'ag_carbon';

		c.setColor(cornType(7));

		// The board id is part of the reference so two boards showing the same
		// production type do not collide on one <pattern> definition.
		expect(c.fillColor).toBe('url(#pattern_7_ag_carbon)');
	});

	it('clears the fill when there is no production type', () => {
		const { c } = build();
		c.field = field();
		c.clickable = true;
		c.setColor(cornType());

		c.setColor(null);

		expect(c.fillColor).toBe('');
	});
});

describe('SvgFieldComponent highlight stroke', () => {
	it('strokes with the configured highlight colour and clears it again', () => {
		const { c } = build({ highlightColor: '#00ff00' });
		c.ngOnInit();
		c.field = field();

		c.highlight(HighlightSide.ALLSIDES);
		expect(c.isHighlighted).toBe(true);
		expect(c.stroke).toBe('#00ff00');

		c.removeHighlight();
		expect(c.isHighlighted).toBe(false);
		expect(c.stroke).toBe('');
	});

	it('inherits the base rule that only an editable field highlights', () => {
		const { c } = build();
		c.ngOnInit();
		c.field = field(false);

		c.highlight(HighlightSide.ALLSIDES);

		expect(c.isHighlighted).toBe(false);
	});
});

describe('SvgFieldComponent assign and unassign', () => {
	it('refuses to assign to a non-editable field', () => {
		const { c, g } = build();
		c.field = field(false);

		c.assign(cornType(), HighlightSide.ALLSIDES);

		expect(c.isAssigned).toBe(false);
		expect(c.field.assigned).toBe(false);
		expect(g.calls).not.toContain('removeHighlight');
	});

	it('assigns an editable field and drops the hover highlight', () => {
		const { c, g } = build();
		c.field = field();
		c.clickable = true;

		c.assign(cornType(), HighlightSide.ALLSIDES);

		expect(c.isAssigned).toBe(true);
		expect(c.field.assigned).toBe(true);
		expect(c.fillColor).toBe(CORN);
		expect(g.calls).toContain('removeHighlight');
	});

	it('clears the fill and the production type on unassign', () => {
		const { c } = build();
		c.field = field();
		c.clickable = true;
		c.assign(cornType(), HighlightSide.ALLSIDES);

		c.unassign();

		expect(c.isAssigned).toBe(false);
		expect(c.field.assigned).toBe(false);
		expect(c.field.productionType).toBe(null);
		expect(c.fillColor).toBe('');
	});
});

describe('SvgFieldComponent grid-line settings', () => {
	it('applies the optional per-deployment cell-border custom properties', () => {
		const { c, r } = build({
			highlightColor: '#ff0000',
			gridLineColor: '#9e9e9e',
			gridLineWidth: '0.05px',
			highlightWidth: '1',
		});

		c.ngOnInit();

		expect(r.styles['--cell-stroke']).toBe('#9e9e9e');
		expect(r.styles['--cell-stroke-width']).toBe('0.05px');
		expect(r.styles['--highlight-stroke-width']).toBe('1');
	});

	it('sets none of them when settings omit them, so the stylesheet default stands', () => {
		const { c, r } = build({ highlightColor: '#ff0000' });

		c.ngOnInit();

		expect(Object.keys(r.styles)).toEqual([]);
		expect(c.highlightColor).toBe('#ff0000');
	});
});

// There are 466 of these on the default board, and the dynamic game builds a fresh set of
// boards every round — so anything a field subscribes to without tearing down is leaked 466
// times per board per round, and each leaked subscription keeps the destroyed component and
// its DOM element alive for the lifetime of the app.
//
// settingsObs comes from a BehaviorSubject on the root-provided GameService, so it outlives
// every field by definition. Counting the subject's subscribers is the only way to see this:
// a leaked subscription is invisible from the DOM and from every other assertion here.
describe('SvgFieldComponent subscription lifetime', () => {
	it('unsubscribes from the service when destroyed', () => {
		const { c, g } = build();
		const observers = () => (g.settings as any).observers?.length
			?? (g.settings as any).currentObservers?.length ?? 0;

		const before = observers();
		c.ngOnInit();

		// Presence first: if the field never subscribed, "it unsubscribed" proves nothing.
		expect(observers()).toBe(before + 1);

		TestBed.resetTestingModule();   // runs the DestroyRef callbacks for the injection context
		expect(observers()).toBe(before);
	});
});
