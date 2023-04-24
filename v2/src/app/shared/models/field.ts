import { FieldType } from "./field-type";
import { ProductionType } from "./production-type";

export class Field {
	editable = false;
	type: FieldType;
	assigned = false;
	productionType: ProductionType | null;
	score: number;
	id: number;

	constructor(id: number, type: FieldType, score: number, productionType: ProductionType | null = null, editable = false, assigned = false) {
		this.id = id;
		this.type = type;
		this.productionType = productionType;
		this.score = score;
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
	score: number;

	constructor(ids: HighlightField[], productionType: ProductionType, score: number) {
		this.fields = ids;
		this.productionType = productionType;
		this.score = score;
	}
}
