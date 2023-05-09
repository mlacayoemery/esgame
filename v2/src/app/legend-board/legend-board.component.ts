import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { LegendElement, Legend } from '../shared/models/legend';

@Component({
	selector: 'tro-legend-board',
	templateUrl: './legend-board.component.html',
	styleUrls: ['./legend-board.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class LegendBoardComponent {
	private _legendData: Legend;
	legendElements: LegendElement[];
	isNegative = false;

	@Input()
	set legendData(data: Legend) {
		if (data) {
			this._legendData = data;
			this.legendElements = data.elements.sort((a, b) => a.forValue - b.forValue).filter(o => o.forValue != 0);
			this.isNegative = data.isNegative;
		}
	}
}
