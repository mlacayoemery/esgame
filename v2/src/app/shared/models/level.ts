import { ScoreEntry } from "src/app/services/score.service";
import { SpiderChartEntry } from "src/app/spider-chart/spider-chart.component";
import { SelectedField } from "./field";
import { GameBoard } from "./game-board";

export class Level {
	levelNumber: number;
	gameBoards: GameBoard[] = [];
	selectedFields: SelectedField[];
	isReadOnly = false;
	showConsequenceMaps = false;
	scores: ScoreEntry[];
	/**
	 * The five indicator scores as the calculator returned them, 0-100, for the spider chart.
	 *
	 * Distinct from `scores` above, which is the game's point system — negated and scaled by 100
	 * for the score board. The chart wants what the model actually said.
	 *
	 * This replaced `scoreImage: string`, a URL to a PNG the calculator rendered and served from
	 * its own pod. See SpiderChartComponent for why that had to go.
	 */
	indicatorScores: SpiderChartEntry[];
}