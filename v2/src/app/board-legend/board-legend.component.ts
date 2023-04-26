import { Component, Input } from '@angular/core';
import { LegendElement, Legend } from '../shared/models/legend';

@Component({
  selector: 'tro-board-legend',
  templateUrl: './board-legend.component.html',
  styleUrls: ['./board-legend.component.scss']
})
export class BoardLegendComponent {
  private _legendData: Legend;
  legendElements: LegendElement[];

  @Input()
	set legendData(data: Legend) {
		this._legendData = data;
    this.legendElements = data.elements.sort((a,b) => a.forValue - b.forValue);
	}
}
