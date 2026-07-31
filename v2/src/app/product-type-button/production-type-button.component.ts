import { ChangeDetectionStrategy, Component, DestroyRef, HostBinding, HostListener, Input, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ProductionType } from '../shared/models/production-type';
import { GameService } from '../services/game.service';

@Component({
    selector: 'tro-production-type-button',
    templateUrl: './production-type-button.component.html',
    styleUrls: ['./production-type-button.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class ProductionTypeButtonComponent implements OnInit {
	@Input() productionType: ProductionType;

	@HostBinding('class.--active') isActive = false;
	@HostBinding('class.--image-mode') isImageMode = false;
	backgroundColor = '';

	private readonly destroyRef = inject(DestroyRef);

	constructor(private gameService: GameService) {
	}

	ngOnInit(): void {
		this.gameService.settingsObs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(o => {
			this.isImageMode = o.imageMode;
			this.backgroundColor = this.productionType.fieldColor;
		});
		this.gameService.selectedProductionTypeObs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(o => {
			this.isActive = o == this.productionType;
		});
	}

	@HostListener('click')
	onClick() {
		this.gameService.setSelectedProductionType(this.productionType);
	}
}
