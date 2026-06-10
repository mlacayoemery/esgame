import { ScoreService } from './score.service';

describe('ScoreService.calculateScore', () => {
	it('sums each board\'s per-field scores across all selected fields', () => {
		const service = new ScoreService();
		const scores = [{ id: 'a', score: 0 }, { id: 'b', score: 0 }];
		const fields: any = [
			{ scores: [{ id: 'a', score: 5 }, { id: 'b', score: 2 }] },
			{ scores: [{ id: 'a', score: 3 }] } // contributes nothing to 'b'
		];

		service.calculateScore(scores, fields);

		expect(scores[0].score).toBe(8); // a: 5 + 3
		expect(scores[1].score).toBe(2); // b: 2 + 0
	});
});
