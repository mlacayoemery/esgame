import { ChangeDetectorRef, ElementRef, Renderer2 } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { GameBoardBaseComponent } from './game-board-base.component';
import { GameBoard, GameBoardClickMode } from '../shared/models/game-board';
import { GameBoardType } from '../shared/models/game-board-type';
import { Field } from '../shared/models/field';
import { FieldType } from '../shared/models/field-type';

// Both the grid and the SVG board inherit this, so its input coercion and listener
// lifecycle apply to every board on screen. It is abstract, so these drive a minimal
// concrete subclass. The constructor uses takeUntilDestroyed(this.destroyRef), and
// destroyRef comes from inject(), so construction happens inside an injection context.

class TestBoard extends GameBoardBaseComponent {
	// The base constructor is protected, so the subclass re-exposes it publicly.
	constructor(gs: any, r: Renderer2, el: ElementRef, cd: ChangeDetectorRef) {
		super(gs, r, el, cd);
	}
	afterBoardDataSetCalls = 0;
	drawCalls = 0;
	override afterBoardDataSet(): void { this.afterBoardDataSetCalls++; }
	protected override drawSelectedFields(): void { this.drawCalls++; }
}

function fakeRenderer() {
	const handlers: Record<string, (() => void)[]> = {};
	let unlistens = 0;
	const renderer = {
		listen: (_el: unknown, event: string, cb: () => void) => {
			(handlers[event] ??= []).push(cb);
			return () => {
				unlistens++;
				handlers[event] = (handlers[event] ?? []).filter(h => h !== cb);
			};
		},
	} as unknown as Renderer2;
	return {
		renderer,
		fire: (e: string) => (handlers[e] ?? []).forEach(cb => cb()),
		count: (e: string) => (handlers[e] ?? []).length,
		unlistens: () => unlistens,
	};
}

function fakeGameService() {
	const settings = new BehaviorSubject<any>({ elementSize: 1 });
	const productionTypes = new BehaviorSubject<any[]>([]);
	const calls: string[] = [];
	return {
		settings, productionTypes, calls,
		service: {
			settingsObs: settings.asObservable(),
			productionTypesObs: productionTypes.asObservable(),
			highlightFieldObs: new Subject().asObservable(),
			selectedFieldsObs: new Subject().asObservable(),
			notSelectedFieldsObs: new Subject().asObservable(),
			removeHighlight: () => calls.push('removeHighlight'),
			selectGameBoard: (b: GameBoard) => calls.push(`selectGameBoard:${b.id}`),
		} as any,
	};
}

function build() {
	const r = fakeRenderer();
	const g = fakeGameService();
	const cd = { markForCheck: () => { } } as ChangeDetectorRef;
	const c = TestBed.runInInjectionContext(
		() => new TestBoard(g.service, r.renderer, new ElementRef({}), cd));
	return { c, r, g };
}

const board = (id = 'b', fields = [new Field(1, new FieldType('#000'), 0)]) =>
	new GameBoard(id, GameBoardType.SuitabilityMap, fields, undefined, true);

describe('GameBoardBaseComponent boardData', () => {
	it('publishes fields and legend and notifies the subclass', () => {
		const { c } = build();

		c.boardData = board('main');

		expect((c.boardData as unknown as GameBoard).id).toBe('main');
		expect(c.fields.map((f: Field) => f.id)).toEqual([1]);
		expect((c as TestBoard).afterBoardDataSetCalls).toBe(1);
	});

	it('ignores null and undefined rather than clearing the board', () => {
		const { c } = build();
		c.boardData = board('main');

		// svg-level binds boardData through an async pipe, which emits null first.
		c.boardData = null;
		c.boardData = undefined;
		// Read through a cast: TypeScript narrows the getter's type from the writes above.

		expect((c.boardData as unknown as GameBoard).id).toBe('main');
		expect((c as TestBoard).afterBoardDataSetCalls).toBe(1);
	});
});

describe('GameBoardBaseComponent flag inputs', () => {
	it('treats only strictly-false as off for hideLegend', () => {
		const { c } = build();

		expect(c.hideLegend).toBe(false);

		// Bound as a bare attribute (hideLegend), the value arrives as '' — truthy here.
		c.hideLegend = '';
		expect(c.hideLegend).toBe(true);

		c.hideLegend = false;
		expect(c.hideLegend).toBe(false);
	});

	it('treats only strictly-false as off for readOnly', () => {
		const { c } = build();

		expect(c.readOnly).toBe(false);

		c.readOnly = undefined;
		expect(c.readOnly).toBe(true);

		c.readOnly = false;
		expect(c.readOnly).toBe(false);
	});
});

describe('GameBoardBaseComponent click listener', () => {
	it('binds a board-select click only in SelectBoard mode', () => {
		const { c, r } = build();

		c.clickMode = GameBoardClickMode.Field;
		expect(r.count('click')).toBe(0);

		c.clickMode = GameBoardClickMode.SelectBoard;
		expect(r.count('click')).toBe(1);
		expect(c.clickMode).toBe(GameBoardClickMode.SelectBoard);
	});

	it('does not bind on a read-only board', () => {
		const { c, r } = build();
		c.readOnly = true;

		c.clickMode = GameBoardClickMode.SelectBoard;

		expect(r.count('click')).toBe(0);
	});

	it('selects its own board when clicked', () => {
		const { c, r, g } = build();
		c.boardData = board('side-1');
		c.clickMode = GameBoardClickMode.SelectBoard;

		r.fire('click');

		expect(g.calls).toEqual(['selectGameBoard:side-1']);
	});

	it('stays silent when clicked before any board is set', () => {
		const { c, r, g } = build();
		c.clickMode = GameBoardClickMode.SelectBoard;

		r.fire('click');

		expect(g.calls).toEqual([]);
	});

	it('releases its listeners on destroy', () => {
		const { c, r } = build();
		c.clickMode = GameBoardClickMode.SelectBoard;

		c.ngOnDestroy();

		expect(r.unlistens()).toBe(1);
	});
});

describe('GameBoardBaseComponent host handlers', () => {
	it('drops the highlight when the pointer leaves the board', () => {
		const { c, g } = build();

		c.onLeave();

		expect(g.calls).toEqual(['removeHighlight']);
	});

	it('suppresses the context menu so right-click can erase instead', () => {
		const { c } = build();
		let prevented = false;
		const event = { preventDefault: () => { prevented = true; } } as unknown as Event;

		c.preventContextMenu(event);

		expect(prevented).toBe(true);
	});
});

describe('GameBoardBaseComponent service state', () => {
	it('tracks settings and production types as they change', () => {
		const { c, g } = build();

		expect(c.productionTypes).toEqual([]);
		expect(c.settings.elementSize).toBe(1);

		g.productionTypes.next([{ id: 11 }, { id: 22 }]);
		expect(c.productionTypes.map((p: any) => p.id)).toEqual([11, 22]);

		g.settings.next({ elementSize: 3 });
		expect(c.settings.elementSize).toBe(3);
	});
});
