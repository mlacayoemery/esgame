import { FieldType } from "./field-type";
import { ProductionType } from "./production-type";

export class Field {
	editable = false;
	type: FieldType;
	assigned = false;
	productionType: ProductionType | null;
	score: number;

	constructor(type: FieldType, score: number, productionType: ProductionType | null = null, editable = false, assigned = false) {
		this.type = type;
		this.productionType = productionType;
		this.score = score;
	}
}