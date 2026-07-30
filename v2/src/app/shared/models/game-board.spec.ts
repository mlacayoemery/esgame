import { GameBoard } from './game-board';
import { Field } from './field';
import { FieldType } from './field-type';
import { GameBoardType } from './game-board-type';

// GameBoard.getScore is the arithmetic under every number the player sees: SelectedField.
// updateScore calls it once for the suitability map and once per consequence map, and
// ScoreService then sums those across fields. It had no direct coverage.

const field = (id: number, score: number) => new Field(id, new FieldType('#000'), score);

const board = (...fields: Field[]) =>
	new GameBoard('b', GameBoardType.SuitabilityMap, fields);

describe('GameBoard.getScore', () => {

	it('sums the scores of the requested fields', () => {
		expect(board(field(1, 3), field(2, 4), field(3, 5)).getScore([1, 3])).toBe(8);
	});

	it('is zero when nothing is requested', () => {
		expect(board(field(1, 3)).getScore([])).toBe(0);
	});

	it('is zero when no requested id is on the board', () => {
		expect(board(field(1, 3)).getScore([99])).toBe(0);
	});

	it('ignores ids that are not on the board', () => {
		expect(board(field(1, 3), field(2, 4)).getScore([1, 99])).toBe(3);
	});

	// The filter runs over the board's fields, not over the requested ids, so a duplicate in the
	// request cannot double-count a field. Worth pinning: an allocation is user-supplied.
	it('counts a field once even if its id is asked for twice', () => {
		expect(board(field(1, 3)).getScore([1, 1, 1])).toBe(3);
	});

	it('keeps negative scores rather than clamping them', () => {
		expect(board(field(1, 5), field(2, -8)).getScore([1, 2])).toBe(-3);
	});

	it('is zero for an empty board', () => {
		expect(board().getScore([1, 2])).toBe(0);
	});

	// A consequence map's contribution is negated by the caller, not here — getScore itself is
	// always a plain sum, whichever kind of board it belongs to.
	it('does not negate anything itself', () => {
		const consequence = new GameBoard('c', GameBoardType.ConsequenceMap, [field(1, 6)]);

		expect(consequence.getScore([1])).toBe(6);
	});
});

describe('GameBoard.isPositive', () => {
	it('is true only for a suitability map', () => {
		expect(new GameBoard('s', GameBoardType.SuitabilityMap, []).isPositive).toBe(true);
		expect(new GameBoard('c', GameBoardType.ConsequenceMap, []).isPositive).toBe(false);
		expect(new GameBoard('d', GameBoardType.DrawingMap, []).isPositive).toBe(false);
		expect(new GameBoard('b', GameBoardType.BackgroundMap, []).isPositive).toBe(false);
	});
});
