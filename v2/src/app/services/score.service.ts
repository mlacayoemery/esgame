import { Injectable } from "@angular/core";
import { Level } from "../shared/models/level";
import { SelectedField } from "../shared/models/field";

export class ScoreEntry {
	id: string;
	score: number;
}

@Injectable({
	providedIn: 'root'
})
export class ScoreService {

	createEmptyScoreEntry(level: Level | null) {
		if (level) {
			let scores: ScoreEntry[] = [];
			level?.gameBoards.forEach(gameBoard => {
				if (scores.some(o => o.id == gameBoard.id) == false) {
					scores.push(
						{ id: gameBoard.id, score: 0 }
					);
				}
			});
			return scores;
		}
		return [];
	}

	calculateScore(scores: ScoreEntry[], fields: SelectedField[]) {
		scores.forEach(score => {
			score.score = fields.reduce((a, b) => a + (b.scores.find(o => o.id == score.id)?.score ?? 0), 0)
		});
	}
}