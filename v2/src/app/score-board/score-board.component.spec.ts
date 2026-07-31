import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { ScoreBoardComponent } from './score-board.component';
import { ScoreEntry } from '../services/score.service';

// The score board is what the player actually reads, and it had no coverage. Its logic is
// small but not trivial: entries are grouped by their *translated* name and summed within a
// group, which is deliberate — two maps that share a display name are meant to read as one
// number — and it is also the only place a display bug would look like a model bug.
//
// Constructed directly with stubs rather than through TestBed: the component takes four
// collaborators and uses one method from each.

const cdRefStub: any = { markForCheck: () => { } };

// Translates "map_name_<id>" -> a display name. Two ids deliberately map to one name so the
// grouping behaviour is observable.
const NAMES: Record<string, string> = {
	map_name_11: 'Human health',
	map_name_22: 'Nutrients',
	map_name_33: 'Nutrients',        // same display name as 22
	map_name_all: 'Total'
};
const translateStub: any = { instant: (key: string) => NAMES[key] ?? key };

const entry = (id: string, score: number): ScoreEntry => ({ id, score });

const newComponent = (opts: {
	level?: BehaviorSubject<any>,
	fields?: BehaviorSubject<any>,
	scoreService?: any
} = {}) => {
	const gameStub: any = {
		currentLevelObs: opts.level ?? new BehaviorSubject(null),
		selectedFieldsObs: opts.fields ?? new BehaviorSubject([])
	};
	const scoreStub = opts.scoreService ?? {
		createEmptyScoreEntry: () => [],
		calculateScore: () => { }
	};
	return TestBed.runInInjectionContext(() => new ScoreBoardComponent(gameStub, cdRefStub, scoreStub, translateStub));
};

describe('ScoreBoardComponent', () => {

	describe('totals', () => {
		it('sums every entry', () => {
			const c = newComponent();
			c.scores = [entry('11', 10), entry('22', 5), entry('33', -3)];

			expect(c.totalScore).toBe(12);
		});

		it('starts at zero before any scores arrive', () => {
			expect(newComponent().totalScore).toBe(0);
		});

		it('recomputes rather than accumulating when scores are replaced', () => {
			const c = newComponent();
			c.scores = [entry('11', 10)];
			c.scores = [entry('11', 3)];

			expect(c.totalScore).toBe(3);
		});

		// The setter guards on truthiness, so an undefined input leaves the previous scores on
		// screen instead of clearing them. Worth pinning: it means a round that returns nothing
		// keeps showing the last round's numbers.
		it('keeps the previous scores when set to undefined', () => {
			const c = newComponent();
			c.scores = [entry('11', 10)];
			c.scores = undefined;

			expect(c.totalScore).toBe(10);
			expect(c.scores).toEqual([entry('11', 10)]);
		});
	});

	describe('grouping', () => {
		it('shows one row per distinct translated name', () => {
			const c = newComponent();
			c.scores = [entry('11', 4), entry('22', 5), entry('33', 6)];

			expect(c.groupedScores.map(g => g.name)).toEqual(['Human health', 'Nutrients']);
		});

		it('sums entries that share a display name', () => {
			const c = newComponent();
			c.scores = [entry('22', 5), entry('33', 6)];

			expect(c.groupedScores.find(g => g.name === 'Nutrients')!.score).toBe(11);
		});

		it('falls back to the raw key when there is no translation', () => {
			const c = newComponent();
			c.scores = [entry('99', 7)];

			expect(c.groupedScores).toEqual([{ name: 'map_name_99', score: 7 }]);
		});

		it('produces no rows for no scores', () => {
			expect(newComponent().groupedScores).toEqual([]);
		});

		// The dynamic game's level.scores carries an "all" entry (the running total) alongside
		// the per-indicator ones, so it appears as its own row rather than being folded in.
		it('keeps the running total as its own row', () => {
			const c = newComponent();
			c.scores = [entry('all', 40), entry('11', -12)];

			expect(c.groupedScores).toEqual([{ name: 'Total', score: 40 }, { name: 'Human health', score: -12 }]);
		});
	});

	describe('isStatic', () => {
		// Used as a bare attribute in the template (<tro-score-board isStatic>), which Angular
		// passes as the empty string — hence `!== false` rather than a truthiness check. A plain
		// truthy test here would silently turn the static board back into a live one.
		it('treats a bare attribute as static', () => {
			const level = new BehaviorSubject<any>(null);
			const c = newComponent({ level });
			c.isStatic = '';
			c.scores = [entry('11', 9)];

			c.ngOnInit();
			level.next({ gameBoards: [] });

			// A live board would have overwritten these from the service.
			expect(c.totalScore).toBe(9);
		});

		it('subscribes to the game when not static', () => {
			const level = new BehaviorSubject<any>(null);
			const fields = new BehaviorSubject<any>([]);
			const scoreService = {
				createEmptyScoreEntry: () => [entry('11', 0), entry('22', 0)],
				calculateScore: (scores: ScoreEntry[]) => { scores.forEach(s => s.score = 4); }
			};
			const c = newComponent({ level, fields, scoreService });

			c.ngOnInit();
			level.next({ gameBoards: [] });
			fields.next([{}]);

			expect(c.totalScore).toBe(8);
			expect(c.groupedScores.map(g => g.name)).toEqual(['Human health', 'Nutrients']);
		});

		it('explicitly false is not static', () => {
			const level = new BehaviorSubject<any>(null);
			const scoreService = {
				createEmptyScoreEntry: () => [entry('11', 7)],
				calculateScore: () => { }
			};
			const c = newComponent({ level, scoreService });
			c.isStatic = false;

			c.ngOnInit();
			level.next({ gameBoards: [] });

			expect(c.scores).toEqual([entry('11', 7)]);
		});
	});
});
