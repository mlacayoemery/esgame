import { TiffService } from 'src/app/services/tiff.service';
import { FieldType } from '../../shared/models/field-type';
import { Field } from '../models/field';
import { BehaviorSubject } from 'rxjs';
import gradiants from './gradiants';

export class V1GameBoard {
	private currentGameBoard = new BehaviorSubject<Field[] | null>(null);
	currentGameBoardObs = this.currentGameBoard.asObservable();


	constructor(private tiffService: TiffService) {
		this.tiffService = tiffService;
		this.loadFile();
	}

	getAE(id: number) {
		return new Field(id, new FieldType("#d2b188", "CONFIGURED"), 0);
	}

	getA1(id: number) {
		return new Field(id, new FieldType("#eef5fb", "CONFIGURED"), 75);
	}

	getA2(id: number) {
		return new Field(id, new FieldType("#b3dfe3", "CONFIGURED"), 150);
	}

	getA3(id: number) {
		return new Field(id, new FieldType("#61c3a3", "CONFIGURED"), 225);
	}

	getA4(id: number) {
		return new Field(id, new FieldType("#20a561", "CONFIGURED"), 300);
	}

	getA5(id: number) {
		return new Field(id, new FieldType("#0f6d33", "CONFIGURED"), 375);
	}

	loadFile() {
		this.tiffService.getTiffData(null).subscribe(data => {
			var uniqueValues = Array.from(new Set(data)).sort((a, b) => a - b);
			var gradiant = gradiants.get('blue')!;
			this.currentGameBoard.next(data.map((o, i) => {
				return new Field(i, new FieldType(gradiant.colors[(uniqueValues.indexOf(o))] as string, "CONFIGURED"), o);
			}));
		});
	}
}