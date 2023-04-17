import { TiffService } from 'src/app/services/tiff.service';
import { FieldType } from '../../shared/models/field-type';
import { Field } from '../models/field';
import { BehaviorSubject } from 'rxjs';

export class V1GameBoard {
	private currentGameBoard = new BehaviorSubject<Field[] | null>(null);
	currentGameBoardObs = this.currentGameBoard.asObservable();


	constructor(private tiffService: TiffService) {
		this.tiffService = tiffService;
		this.getAgricultureFromTxt();
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

	getAgricultureFromTxt() {
		this.tiffService.getTiffData(null).subscribe(data => {
			this.currentGameBoard.next(data.map((o, i) => {
				switch (o) {
					case 75: return this.getA1(i);
					case 150: return this.getA2(i);
					case 225: return this.getA3(i);
					case 300: return this.getA4(i);
					case 375: return this.getA5(i);
					default: return this.getAE(i);
				}
			}));
		});
	}
}