import { ChangeDetectorRef, ElementRef, Renderer2 } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { GridGameBoardComponent } from './grid-game-board.component';
import { GameBoard } from '../../shared/models/game-board';
import { GameBoardType } from '../../shared/models/game-board-type';
import { Field, HighlightSide } from '../../shared/models/field';
import { FieldType } from '../../shared/models/field-type';

// The grid counterpart of SvgGameBoardComponent. Two things differ and are worth pinning:
// it resolves fields by QueryList.get(id) — a positional index, not a field-id search like
// the SVG board's .find() — and it shows the production-type image on only the first field
// of each placement, so a multi-cell block gets one icon rather than four.

function fakeRenderer() {
	const handlers: Record<string, (() => void)[]> = {};
	let unlistens = 0;
	const renderer = {
		listen: (_el: unknown, event: string, cb: () => void) => {
			(handlers[event] ??= []).push(cb);
			return () => { unlistens++; handlers[event] = (handlers[event] ?? []).filter(h => h !== cb); };
		},
	} as unknown as Renderer2;
	return { renderer, fire: (e: string) => (handlers[e] ?? []).forEach(cb => cb()), count: (e: string) => (handlers[e] ?? []).length, unlistens: () => unlistens };
}

function fakeGameService(columns = 4) {
	const settings = new BehaviorSubject<any>({ gameBoardColumns: columns });
	const highlight = new Subject<any[]>();
	const selected = new Subject<any[]>();
	const calls: string[] = [];
	return {
		settings, highlight, selected, calls,
		service: {
			settingsObs: settings.asObservable(),
			productionTypesObs: new BehaviorSubject<any[]>([]).asObservable(),
			highlightFieldObs: highlight.asObservable(),
			selectedFieldsObs: selected.asObservable(),
			notSelectedFieldsObs: new Subject().asObservable(),
			removeHighlight: () => calls.push('removeHighlight'),
			selectGameBoard: (b: GameBoard) => calls.push(`selectGameBoard:${b.id}`),
		} as any,
	};
}

// Stands in for the @ViewChildren QueryList. get() is index-based, matching the real one.
function fakeFieldComponents(count: number) {
	const log: string[] = [];
	const items = Array.from({ length: count }, (_, i) => ({
		highlight: (side: string) => log.push(`highlight:${i}:${side}`),
		removeHighlight: () => log.push(`removeHighlight:${i}`),
		assign: (_pt: unknown, side: string) => log.push(`assign:${i}:${side}`),
		unassign: () => log.push(`unassign:${i}`),
		showProductionTypeImage: () => log.push(`image:${i}`),
	}));
	return {
		log,
		queryList: { get: (i: number) => items[i], changes: new Subject<void>() } as any,
	};
}

function build(columns = 4) {
	const r = fakeRenderer();
	const g = fakeGameService(columns);
	const cd = { markForCheck: () => { } } as ChangeDetectorRef;
	const c = TestBed.runInInjectionContext(
		() => new GridGameBoardComponent(g.service, r.renderer, new ElementRef({}), cd));
	return { c, r, g };
}

const cell = (id: number) => new Field(id, new FieldType('#eee'), 0);
const board = (ids: number[] = [0, 1, 2, 3]) =>
	new GameBoard('grid', GameBoardType.SuitabilityMap, ids.map(cell));

describe('GridGameBoardComponent column layout', () => {
	it('lays the grid out from settings.gameBoardColumns when the board arrives', () => {
		const { c } = build(28);

		c.boardData = board();

		expect(c.fieldColumns).toBe('repeat(28, 1fr)');
	});

	it('recomputes the layout for a different column count', () => {
		const { c, g } = build(4);
		c.boardData = board();
		expect(c.fieldColumns).toBe('repeat(4, 1fr)');

		g.settings.next({ gameBoardColumns: 12 });
		c.boardData = board();

		expect(c.fieldColumns).toBe('repeat(12, 1fr)');
	});

	it('still publishes the fields through the base setter', () => {
		const { c } = build();

		c.boardData = board([0, 1, 2]);

		expect(c.fields.map((f: Field) => f.id)).toEqual([0, 1, 2]);
	});
});

describe('GridGameBoardComponent highlighting', () => {
	it('clears the previous highlight before applying the new one', () => {
		const { c, g } = build();
		const f = fakeFieldComponents(4);
		c.fieldComponents = f.queryList;

		g.highlight.next([{ id: 1, side: HighlightSide.TOP }]);
		expect(f.log).toEqual(['highlight:1:--top']);

		g.highlight.next([{ id: 2, side: HighlightSide.LEFT }]);
		expect(f.log).toEqual(['highlight:1:--top', 'removeHighlight:1', 'highlight:2:--left']);
	});

	it('clears everything when the highlight goes empty', () => {
		const { c, g } = build();
		const f = fakeFieldComponents(4);
		c.fieldComponents = f.queryList;

		g.highlight.next([{ id: 0, side: HighlightSide.TOP }, { id: 3, side: HighlightSide.TOP }]);
		f.log.length = 0;

		g.highlight.next([]);

		expect(f.log).toEqual(['removeHighlight:0', 'removeHighlight:3']);
	});

	it('survives a highlight for an index the board does not have', () => {
		const { c, g } = build();
		const f = fakeFieldComponents(2);
		c.fieldComponents = f.queryList;

		g.highlight.next([{ id: 99, side: HighlightSide.TOP }]);

		expect(f.log).toEqual([]);
	});

	it('does not throw when a highlight arrives before the view exists', () => {
		const { c, g } = build();

		// fieldComponents is undefined until ngAfterViewInit; the optional chain in the
		// removal loop is what keeps this from throwing.
		expect(() => g.highlight.next([])).not.toThrow();
	});
});

describe('GridGameBoardComponent drawing placements', () => {
	// drawSelectedFields is protected; the board calls it from its own subscriptions.
	const draw = (c: GridGameBoardComponent) => (c as any).drawSelectedFields();

	it('clears every cell, then assigns the selected ones', () => {
		const { c } = build();
		const f = fakeFieldComponents(4);
		c.boardData = board([0, 1, 2, 3]);
		c.fieldComponents = f.queryList;
		(c as any)._selectedFields = [
			{ productionType: { id: 11 }, fields: [{ id: 1, side: HighlightSide.ALLSIDES }] },
		];

		draw(c);

		expect(f.log).toEqual([
			'unassign:0', 'unassign:1', 'unassign:2', 'unassign:3',
			'assign:1:--all-sides',
			'image:1',
		]);
	});

	it('shows one icon per placement, on its first cell only', () => {
		const { c } = build();
		const f = fakeFieldComponents(4);
		c.boardData = board([0, 1, 2, 3]);
		c.fieldComponents = f.queryList;
		// a 2x2 block: four cells, one placement
		(c as any)._selectedFields = [{
			productionType: { id: 11 },
			fields: [
				{ id: 0, side: HighlightSide.TOPLEFT },
				{ id: 1, side: HighlightSide.TOPRIGHT },
				{ id: 2, side: HighlightSide.BOTTOMLEFT },
				{ id: 3, side: HighlightSide.BOTTOMRIGHT },
			],
		}];

		draw(c);

		expect(f.log.filter(l => l.startsWith('assign:')).length).toBe(4);
		expect(f.log.filter(l => l.startsWith('image:'))).toEqual(['image:0']);
	});

	it('does nothing until the board, the selection and the view all exist', () => {
		const { c } = build();
		const f = fakeFieldComponents(4);

		// no fields, no selection, no view
		expect(() => draw(c)).not.toThrow();
		expect(f.log).toEqual([]);

		// view present but still no board
		c.fieldComponents = f.queryList;
		expect(() => draw(c)).not.toThrow();
		expect(f.log).toEqual([]);
	});
});
