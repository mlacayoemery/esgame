import { ChangeDetectorRef, ElementRef, Renderer2 } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { SvgGameBoardComponent } from './svg-game-board.component';
// The template uses Material and translate; importing the declaring module gives the
// compiler the NgModule scope it needs to build this spec.
import '../../app.module';
import { GameBoard, GameBoardClickMode } from '../../shared/models/game-board';
import { GameBoardType } from '../../shared/models/game-board-type';
import { Field } from '../../shared/models/field';
import { FieldType } from '../../shared/models/field-type';

// SvgGameBoardComponent drives the SVG board (~3,200 paths on /dynamic-game). Its
// constructor calls takeUntilDestroyed(this.destroyRef), and destroyRef comes from
// inject(), so the component has to be built inside an injection context.

const field = (id: number) => new Field(id, new FieldType('#000'), 0);

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
	return { renderer, fire: (e: string) => (handlers[e] ?? []).forEach(cb => cb()), count: (e: string) => (handlers[e] ?? []).length, unlistens: () => unlistens };
}

function fakeGameService() {
	const settings = new BehaviorSubject<any>({ visualOptions: { consequenceFieldOpacity: false } });
	const highlight = new Subject<any[]>();
	const selected = new Subject<any[]>();
	const notSelected = new Subject<any[]>();
	// GameBoardBaseComponent's constructor subscribes to productionTypesObs too.
	const productionTypes = new BehaviorSubject<any[]>([]);
	return {
		settings, highlight, selected, notSelected, productionTypes,
		service: {
			settingsObs: settings.asObservable(),
			productionTypesObs: productionTypes.asObservable(),
			highlightFieldObs: highlight.asObservable(),
			selectedFieldsObs: selected.asObservable(),
			notSelectedFieldsObs: notSelected.asObservable(),
			removeHighlight: () => { },
			selectGameBoard: () => { },
		} as any,
	};
}

// Stands in for the @ViewChildren QueryList, recording what the board asked each field to do.
function fakeFieldComponents(ids: number[]) {
	const log: string[] = [];
	const items = ids.map(id => ({
		field: { id },
		highlight: (side: string) => log.push(`highlight:${id}:${side}`),
		removeHighlight: () => log.push(`removeHighlight:${id}`),
		assign: (_pt: unknown, side: string) => log.push(`assign:${id}:${side}`),
		unassign: () => log.push(`unassign:${id}`),
	}));
	return {
		log,
		queryList: {
			find: (fn: (o: any) => boolean) => items.find(fn),
			changes: new Subject<void>(),
		} as any,
	};
}

function build(clickMode = GameBoardClickMode.SelectBoard) {
	const r = fakeRenderer();
	const g = fakeGameService();
	const cd = { markForCheck: () => { } } as ChangeDetectorRef;
	const c = TestBed.runInInjectionContext(
		() => new SvgGameBoardComponent(g.service, r.renderer, new ElementRef({}), cd));
	c.clickMode = clickMode;
	return { c, r, g };
}

const board = (type: GameBoardType, fields = [field(1)]) =>
	new GameBoard('b', type, fields, undefined, true, 10, 10, 'bg.png', 'bg2.png');

describe('SvgGameBoardComponent stroke styling', () => {
	it('thins and fades the stroke everywhere except a consequence map', () => {
		const { c } = build();

		c.boardData = board(GameBoardType.SuitabilityMap);
		expect(c.getStrokeOpacity()).toBe(1);
		expect(c.getStrokeWidth()).toBe(8);

		c.boardData = board(GameBoardType.ConsequenceMap);
		expect(c.getStrokeOpacity()).toBe(0.5);
		expect(c.getStrokeWidth()).toBe(20);
	});

	it('falls back to the plain stroke before any board is set', () => {
		const { c } = build();

		expect(c.getStrokeOpacity()).toBe(1);
		expect(c.getStrokeWidth()).toBe(8);
	});
});

describe('SvgGameBoardComponent board data', () => {
	it('wraps both backgrounds as CSS url() and records the map type', () => {
		const { c } = build();

		c.boardData = board(GameBoardType.DrawingMap);

		expect(c.background).toBe('url("bg.png")');
		expect(c.background2).toBe('url("bg2.png")');
		expect(c.mapType).toBe(GameBoardType.DrawingMap);
		expect(c.fields.map(f => f.id)).toEqual([1]);
	});
});

describe('SvgGameBoardComponent pattern show/hide listeners', () => {
	it('binds mouseenter/mouseleave for a selectable, editable board', () => {
		const { c, r } = build(GameBoardClickMode.SelectBoard);

		c.boardData = board(GameBoardType.SuitabilityMap);

		expect(r.count('mouseenter')).toBe(1);
		expect(r.count('mouseleave')).toBe(1);

		expect(c.displayPatterns).toBe('inline');
		r.fire('mouseenter');
		expect(c.displayPatterns).toBe('none');
		r.fire('mouseleave');
		expect(c.displayPatterns).toBe('inline');
	});

	it('binds nothing when the board is not in select-board mode', () => {
		const { c, r } = build(GameBoardClickMode.Field);

		c.boardData = board(GameBoardType.SuitabilityMap);

		expect(r.count('mouseenter')).toBe(0);
	});

	it('binds nothing on a consequence map', () => {
		const { c, r } = build(GameBoardClickMode.SelectBoard);

		c.boardData = board(GameBoardType.ConsequenceMap);

		expect(r.count('mouseenter')).toBe(0);
	});

	it('releases the listeners when the board turns read-only', () => {
		const { c, r } = build(GameBoardClickMode.SelectBoard);
		c.boardData = board(GameBoardType.SuitabilityMap);
		expect(r.count('mouseenter')).toBe(1);

		c.readOnly = true;

		expect(r.unlistens()).toBe(2);
		expect(r.count('mouseenter')).toBe(0);
	});

	it('treats only strictly-false as not read-only', () => {
		const { c } = build();

		c.readOnly = undefined as any;
		expect(c.readOnly).toBe(true);

		c.readOnly = false;
		expect(c.readOnly).toBe(false);
	});
});

describe('SvgGameBoardComponent highlighting', () => {
	it('clears the previous highlight before applying the new one', () => {
		const { c, g } = build();
		const f = fakeFieldComponents([1, 2, 3]);
		c.svgFieldComponents = f.queryList;

		g.highlight.next([{ id: 1, side: '--top' }]);
		expect(f.log).toEqual(['highlight:1:--top']);

		g.highlight.next([{ id: 2, side: '--left' }]);
		// field 1's highlight is removed before field 2 gets one
		expect(f.log).toEqual(['highlight:1:--top', 'removeHighlight:1', 'highlight:2:--left']);
	});

	it('clears everything when the highlight goes empty', () => {
		const { c, g } = build();
		const f = fakeFieldComponents([1, 2]);
		c.svgFieldComponents = f.queryList;

		g.highlight.next([{ id: 1, side: '--top' }, { id: 2, side: '--top' }]);
		f.log.length = 0;

		g.highlight.next([]);

		expect(f.log).toEqual(['removeHighlight:1', 'removeHighlight:2']);
	});

	it('ignores highlights for fields the board does not hold', () => {
		const { c, g } = build();
		const f = fakeFieldComponents([1]);
		c.svgFieldComponents = f.queryList;

		g.highlight.next([{ id: 99, side: '--top' }]);

		expect(f.log).toEqual([]);
	});
});

describe('SvgGameBoardComponent settings', () => {
	it('takes consequenceFieldOpacity from settings, defaulting to off', () => {
		const { c, g } = build();

		expect(c.consequenceFieldOpacity).toBe(false);

		g.settings.next({ visualOptions: { consequenceFieldOpacity: true } });
		expect(c.consequenceFieldOpacity).toBe(true);

		// a settings payload with no visualOptions must not throw, and falls back to off
		g.settings.next({});
		expect(c.consequenceFieldOpacity).toBe(false);
	});
});
