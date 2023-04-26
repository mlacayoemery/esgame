import { TiffService } from 'src/app/services/tiff.service';
import { FieldType } from '../../shared/models/field-type';
import { Field } from '../models/field';
import { BehaviorSubject } from 'rxjs';
import gradiants from './gradiants';
import { Legend } from '../models/legend';

export class V1GameBoard {
	private currentGameBoard = new BehaviorSubject<Field[] | null>(null);
	private legend = new BehaviorSubject<Legend | null>(null);
	currentGameBoardObs = this.currentGameBoard.asObservable();
	legendObs = this.legend.asObservable();


	constructor(private tiffService: TiffService) {
		this.tiffService = tiffService;
	}

	loadFile() {
		this.tiffService.getTiffData(null).subscribe(data => {
			var uniqueValues = Array.from(new Set(data)).sort((a, b) => a - b);
			var gradiant = gradiants.get('green')!;
			var legend : Legend = { elements: [...uniqueValues.map((o, i) => ({ forValue: o, color: gradiant.colors[i]}))] };
			this.legend.next(legend)

			this.currentGameBoard.next(data.map((o, i) => {
				return new Field(i, new FieldType(gradiant.colors[(uniqueValues.indexOf(o))] as string, "CONFIGURED"), o);
			}));
		});
	}
}