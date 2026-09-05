/**
 * The best board this dataset can reach, per round, as tools/optimizer/optimize.py found it.
 *
 * Recorded rather than solved in the browser. The search is an exact branch and bound over the
 * 756 anchors a 2 x 2 piece can take, and it is checked against exhaustive enumeration on a small
 * board and re-scored through tools/calculator's model — none of which belongs in a click handler.
 * What ships is the answer and the score it claims, both pinned by tools/optimizer/test_optimize.py.
 *
 * Keyed by level number as a string, because a round the optimiser said nothing about must be
 * distinguishable from one whose answer is "place nothing" — a missing key means the former.
 */
export interface OptimalSolution {
	dataset?: string;
	board?: { columns: number, rows: number, elementSize: number };
	rounds: { [levelNumber: string]: OptimalRound };
}

export interface OptimalRound {
	/** What this board scores, on the maps that round shows. */
	score: number;
	/** Each piece as its TOP-LEFT cell id, the same anchor GameService.selectField takes. */
	pieces: { productionType: string, id: number }[];
}
