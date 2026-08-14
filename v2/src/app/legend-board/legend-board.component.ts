import { ChangeDetectionStrategy, Component, HostBinding, Input } from '@angular/core';
import { LegendElement, Legend } from '../shared/models/legend';

@Component({
    selector: 'tro-legend-board',
    templateUrl: './legend-board.component.html',
    styleUrls: ['./legend-board.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class LegendBoardComponent {
	legendElements: LegendElement[];
	isNegative = false;
	isRoundRelative = false;
	gradient: string = ""


	@HostBinding('class.is-small') @Input() isSmall: boolean = false;
	@HostBinding('class.is-gradient') @Input() isGradient: boolean = false;

	@Input()
	set legendData(data: Legend) {
		if (data) {
			this.legendElements = data.elements.sort((a, b) => a.forValue - b.forValue);
			this.isNegative = data.isNegative;
			this.isGradient = data.isGradient;
			this.isRoundRelative = data.isRoundRelative;
			if (data.isGradient) {
				// A gradient needs two stops. With fewer, this used to index elements[1] and throw
				// "Cannot read properties of undefined (reading 'color')" — and because this setter
				// runs during change detection, that took out the view binding the legend rather
				// than merely rendering it wrong. One entry now renders as a solid bar of its own
				// colour, which is what a one-value gradient means; none renders nothing.
				const [first, second] = this.legendElements;
				this.gradient = first
					? `linear-gradient(90deg, #${first.color}, #${(second ?? first).color})`
					: '';
			} else
				this.legendElements = this.legendElements.filter(o => o.forValue != 0)
		}
	}
}
