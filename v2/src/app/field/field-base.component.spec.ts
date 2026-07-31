import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef, ElementRef, Renderer2 } from '@angular/core';
import { FieldBaseComponent } from './field-base.component';
import { Field, HighlightSide } from '../shared/models/field';
import { FieldType } from '../shared/models/field-type';

// FieldBaseComponent sits under every cell on the board, so its listener wiring runs on
// every click and hover a player makes. It is abstract, so these drive a minimal concrete
// subclass — the same surface the real GridField/SvgField components inherit.

class TestField extends FieldBaseComponent {
	selectOn = false;
	deselectOn = false;
	colorCalls = 0;
	override shouldSelect(): boolean { return this.selectOn; }
	override shouldDeselect(): boolean { return this.deselectOn; }
	setColor(): void { this.colorCalls++; }
	assign(): void { }
	unassign(): void { }
}

// Records what was bound so the handlers can be fired directly, and counts unlistens so
// leaks are visible.
function fakeRenderer() {
	const handlers: Record<string, ((e: any) => void)[]> = {};
	let unlistens = 0;
	const renderer = {
		listen: (_el: unknown, event: string, cb: (e: any) => void) => {
			(handlers[event] ??= []).push(cb);
			// Detach on unlisten, as Renderer2 does — otherwise a released handler
			// still fires here and "no longer clickable" cannot be asserted.
			return () => {
				unlistens++;
				handlers[event] = (handlers[event] ?? []).filter(h => h !== cb);
			};
		},
	} as unknown as Renderer2;
	return {
		renderer,
		handlers,
		fire: (event: string, e: any = {}) => (handlers[event] ?? []).forEach(cb => cb(e)),
		count: (event: string) => (handlers[event] ?? []).length,
		unlistens: () => unlistens,
	};
}

function makeGameService() {
	const calls: string[] = [];
	const service: any = {
		selectField: (id: number) => calls.push(`select:${id}`),
		deselectField: (id: number) => calls.push(`deselect:${id}`),
		highlightOnOtherFields: (id: number) => calls.push(`highlight:${id}`),
	};
	return { service, calls };
}

const field = (id: number, editable = true, assigned = false) =>
	new Field(id, new FieldType('#000000'), 0, null, editable, assigned);

function setup() {
	const r = fakeRenderer();
	const g = makeGameService();
	const cd = { markForCheck: () => { } } as ChangeDetectorRef;
	// FieldBaseComponent injects DestroyRef so subclasses can use takeUntilDestroyed from a
	// lifecycle hook, and inject() needs a context — same as GridFieldComponent's spec.
	const c = TestBed.runInInjectionContext(
		() => new TestField(g.service, r.renderer, new ElementRef({}), cd));
	return { c, r, g };
}

describe('FieldBaseComponent field input', () => {
	it('takes editability from the field and recolours it', () => {
		const { c } = setup();

		c.field = field(1, true);

		expect(c.isEditable).toBe(true);
		expect((c as TestField).colorCalls).toBe(1);
	});

	it('marks a non-editable field as not editable', () => {
		const { c } = setup();

		c.field = field(1, false);

		expect(c.isEditable).toBe(false);
	});
});

describe('FieldBaseComponent clickable wiring', () => {
	it('binds a click and a hover listener when made clickable', () => {
		const { c, r } = setup();

		c.clickable = true;

		expect(c.clickable).toBe(true);
		expect(r.count('mousedown')).toBe(1);
		expect(r.count('mouseenter')).toBe(1);
	});

	it('only false disables it — any other value counts as clickable', () => {
		const { c, r } = setup();

		// The setter takes `any` and treats strictly-false as off, so a truthy-ish
		// binding still wires the field up.
		c.clickable = 0 as any;
		expect(c.clickable).toBe(true);
		expect(r.count('mousedown')).toBe(1);

		c.clickable = false;
		expect(c.clickable).toBe(false);
	});

	it('releases its listeners when switched off, and does not leak across toggles', () => {
		const { c, r } = setup();

		c.clickable = true;
		c.clickable = false;
		expect(r.unlistens()).toBe(2); // click + hover released

		c.clickable = true;
		c.clickable = false;
		expect(r.unlistens()).toBe(4); // and again, not 2 + 4 stale ones
	});

	it('releases its listeners on destroy', () => {
		const { c, r } = setup();
		c.clickable = true;

		c.ngOnDestroy();

		expect(r.unlistens()).toBe(2);
	});
});

describe('FieldBaseComponent interaction', () => {
	it('selects an unassigned field on mousedown and deselects an assigned one', () => {
		const { c, r, g } = setup();
		c.field = field(7, true, false);
		c.clickable = true;

		r.fire('mousedown');
		expect(g.calls).toEqual(['select:7']);

		c.field = field(7, true, true); // now carries a production type
		r.fire('mousedown');
		expect(g.calls).toEqual(['select:7', 'deselect:7']);
	});

	it('routes hover through shouldSelect, then shouldDeselect, then highlight', () => {
		const { c, r, g } = setup();
		c.field = field(3);
		c.clickable = true;

		// neither predicate: hovering just highlights
		r.fire('mouseenter');
		expect(g.calls).toEqual(['highlight:3']);

		// drag-to-fill
		(c as TestField).selectOn = true;
		r.fire('mouseenter');
		expect(g.calls).toEqual(['highlight:3', 'select:3']);

		// drag-to-erase; shouldSelect is checked first, so clear it
		(c as TestField).selectOn = false;
		(c as TestField).deselectOn = true;
		r.fire('mouseenter');
		expect(g.calls).toEqual(['highlight:3', 'select:3', 'deselect:3']);
	});

	it('does nothing on hover or click once no longer clickable', () => {
		const { c, r, g } = setup();
		c.field = field(5);
		c.clickable = true;
		c.clickable = false;

		r.fire('mousedown');
		r.fire('mouseenter');

		expect(r.unlistens()).toBe(2);
		expect(r.count('mousedown')).toBe(0);
		expect(r.count('mouseenter')).toBe(0);
		expect(g.calls).toEqual([]);
	});
});

describe('FieldBaseComponent highlight state', () => {
	it('highlights only an editable field', () => {
		const { c } = setup();

		c.field = field(1, false);
		c.highlight(HighlightSide.ALLSIDES);
		expect(c.isHighlighted).toBe(false);

		c.field = field(1, true);
		c.highlight(HighlightSide.ALLSIDES);
		expect(c.isHighlighted).toBe(true);
	});

	it('clears the highlight regardless of editability', () => {
		const { c } = setup();
		c.field = field(1, true);
		c.highlight(HighlightSide.ALLSIDES);

		c.removeHighlight();

		expect(c.isHighlighted).toBe(false);
	});

	it('toggles the missing-selection marker', () => {
		const { c } = setup();

		expect(c.isMissingSelection).toBe(false);
		c.addMissingHighlight();
		expect(c.isMissingSelection).toBe(true);
		c.removeMissingHighlight();
		expect(c.isMissingSelection).toBe(false);
	});
});
