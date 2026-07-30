import { SelectedField, HighlightField, HighlightSide } from './field';
import { ProductionType } from './production-type';
import { ScoreService, ScoreEntry } from '../../services/score.service';

// SelectedField.updateScore feeds ScoreService.calculateScore, and the two are only correct
// together: calculateScore reads with `find`, which takes the FIRST match, so updateScore must
// replace its entries rather than add to them.
//
// It used to append. game.service calls updateScore() on every selected field at the end of
// every round, so `scores` grew by (1 + consequenceMaps) entries per level, per field, and a
// stale entry shadowed the fresh one for any map id whose data had been replaced. Nothing on
// screen was wrong because of it, which is exactly why it needs a test.

const board = (id: string, scores: Record<number, number>) => ({
	id,
	fields: Object.entries(scores).map(([fid, score]) => ({ id: Number(fid), score })),
	getScore(ids: number[]) {
		return this.fields.filter((f: any) => ids.includes(f.id)).reduce((a: number, f: any) => a + f.score, 0);
	}
}) as any;

const highlight = (id: number): HighlightField => ({ id, side: HighlightSide.NONE });

const productionType = (suitability: any, consequences: any[] = []) => {
	const pt = new ProductionType(1, '#000', suitability, '', 0);
	pt.consequenceMaps = consequences;
	return pt;
};

describe('SelectedField.updateScore', () => {

	it('records the suitability score for the selected ids', () => {
		const sf = new SelectedField([highlight(1), highlight(2)], productionType(board('suit', { 1: 3, 2: 4, 3: 99 })));

		expect(sf.scores).toEqual([{ id: 'suit', score: 7 }]);
	});

	// Consequence maps are costs, so they are negated. The score board then shows them as the
	// negative contributions they are.
	it('negates consequence scores', () => {
		const sf = new SelectedField(
			[highlight(1)],
			productionType(board('suit', { 1: 10 }), [board('cons', { 1: 4 })]));

		expect(sf.scores).toEqual([{ id: 'suit', score: 10 }, { id: 'cons', score: -4 }]);
	});

	it('records nothing when the production type has no suitability map', () => {
		const pt = new ProductionType(1, '#000', undefined as any, '', 0);
		const sf = new SelectedField([highlight(1)], pt);

		expect(sf.scores).toEqual([]);
	});

	it('scores only the ids belonging to this selection', () => {
		const sf = new SelectedField([highlight(2)], productionType(board('suit', { 1: 100, 2: 5 })));

		expect(sf.scores[0].score).toBe(5);
	});

	// It used to append, so `scores` grew by (1 + consequenceMaps) entries per level, per field,
	// for the whole game. Recomputing keeps it one entry per map.
	it('replaces rather than appending on a second call', () => {
		const pt = productionType(board('suit', { 1: 10 }));
		const sf = new SelectedField([highlight(1)], pt);

		sf.updateScore();
		sf.updateScore();

		expect(sf.scores).toEqual([{ id: 'suit', score: 10 }]);
	});
});

describe('ScoreService.calculateScore with re-scored fields', () => {
	const service = new ScoreService();

	it('sums one entry per field', () => {
		const a = new SelectedField([highlight(1)], productionType(board('suit', { 1: 3 })));
		const b = new SelectedField([highlight(2)], productionType(board('suit', { 2: 4 })));
		const entries: ScoreEntry[] = [{ id: 'suit', score: 0 }];

		service.calculateScore(entries, [a, b]);

		expect(entries[0].score).toBe(7);
	});

	it('contributes zero for a field that has no entry for that id', () => {
		const a = new SelectedField([highlight(1)], productionType(board('suit', { 1: 3 })));
		const entries: ScoreEntry[] = [{ id: 'nothing-here', score: 0 }];

		service.calculateScore(entries, [a]);

		expect(entries[0].score).toBe(0);
	});

	// The reason these two are tested together: calculateScore reads with `find`, which takes the
	// FIRST match. While updateScore appended, a stale entry shadowed the fresh one for any map id
	// whose data had been replaced — this returned -4 after the map had changed to -9.
	it('reads the current score after a map is replaced under the same id', () => {
		const pt = productionType(board('suit', { 1: 10 }), [board('cons', { 1: 4 })]);
		const sf = new SelectedField([highlight(1)], pt);

		// A new round: the same map id now carries a different score.
		pt.consequenceMaps = [board('cons', { 1: 9 })];
		sf.updateScore();

		const entries: ScoreEntry[] = [{ id: 'cons', score: 0 }];
		service.calculateScore(entries, [sf]);

		expect(sf.scores.filter(s => s.id === 'cons').map(s => s.score)).toEqual([-9]);
		expect(entries[0].score).toBe(-9);
	});

	it('handles no selected fields', () => {
		const entries: ScoreEntry[] = [{ id: 'suit', score: 5 }];

		service.calculateScore(entries, []);

		expect(entries[0].score).toBe(0);
	});
});
