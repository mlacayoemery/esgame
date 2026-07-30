import { FieldType } from "./field-type";
import { ProductionType } from "./production-type";

export class Field {
	editable = false;
	type: FieldType;
	assigned = false;
	productionType: ProductionType | null;
	score: number;
	id: number;
	path: string;
	startPos: number;

	constructor(id: number, type: FieldType, score: number, productionType: ProductionType | null = null, editable = false, assigned = false, path: string = "", startPos: number = 0) {
		this.id = id;
		this.type = type;
		this.productionType = productionType;
		this.score = score;
		this.path = path;
		this.editable = editable;
		this.assigned = assigned;
		this.startPos = startPos;
	}
}

export enum HighlightSide {
	ALLSIDES = "--all-sides",
	TOP = "--top",
	BOTTOM = "--bottom",
	LEFT = "--left",
	RIGHT = "--right",
	TOPLEFT = "--top-left",
	TOPRIGHT = "--top-right",
	BOTTOMLEFT = "--bottom-left",
	BOTTOMRIGHT = "--bottom-right",
	NONE = ""
}

export class HighlightField {
	id: number;
	side: HighlightSide;
}

export class SelectedField {
	fields: HighlightField[];
	productionType: ProductionType;
	scores: { score: number, id: string }[] = [];

	constructor(ids: HighlightField[], productionType: ProductionType) {
		this.fields = ids;
		this.productionType = productionType;
		this.updateScore();
	}

	updateScore() {
		// Recompute, do not append. game.service calls this on every selected field at the end of
		// every round, and this used to push a fresh set alongside the old one — so `scores` grew
		// by (1 + consequenceMaps) entries per level, per field, for the whole game.
		//
		// It also left a trap: ScoreService.calculateScore reads with `find`, which takes the
		// FIRST match, so a stale entry shadowed the new one for any map id whose data had been
		// replaced. No number on screen was wrong because of it — grid mode only ever adds maps
		// with new ids, and svg mode switches to the calculator's own scores after round one —
		// but it was one refactor away from being wrong, and silently so.
		this.scores = [];
		var idsOnly = this.fields.map(o => o.id);
		if (this.productionType?.suitabilityMap) {
			this.scores.push({
				id: this.productionType.suitabilityMap.id,
				score: this.productionType.suitabilityMap.getScore(idsOnly)
			});

			this.productionType.consequenceMaps.forEach(o => {
				this.scores.push({
					id: o.id,
					score: o.getScore(idsOnly) * -1
				});
			});
		}
	}
}
