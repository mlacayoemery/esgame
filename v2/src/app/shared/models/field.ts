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