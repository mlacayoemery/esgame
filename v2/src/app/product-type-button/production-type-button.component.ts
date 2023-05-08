import { AfterViewInit, ChangeDetectionStrategy, Component, HostBinding, HostListener, Input } from '@angular/core';
import { ProductionType } from '../shared/models/production-type';
import { GameService } from '../services/game.service';

@Component({
  selector: 'tro-production-type-button',
  templateUrl: './production-type-button.component.html',
  styleUrls: ['./production-type-button.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductionTypeButtonComponent implements AfterViewInit {
	@Input() productionType: ProductionType;

	@HostBinding('class.--active') isActive = false;

	@HostBinding('class.layout2')
	private _isLayout2 = false;

	@Input() set layout2(layout2: any) {
		if (layout2 === false) this._isLayout2 = false;
		else this._isLayout2 = true;
	}

	constructor(private gameService: GameService) {
	}

	ngAfterViewInit() {
		this.gameService.selectedProductionTypeObs.subscribe(o => {
			this.isActive = o == this.productionType;
		});
	}

	@HostListener('click')
	onClick() {
		this.gameService.setSelectedProductionType(this.productionType);
	}
}
