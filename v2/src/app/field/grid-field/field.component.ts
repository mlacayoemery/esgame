import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostBinding, HostListener, Input, OnDestroy, Renderer2 } from '@angular/core';
import { SubSink } from 'subsink';
import { FieldBaseComponent } from '../field-base.component';
import { HighlightSide } from 'src/app/shared/models/field';
import { GameService } from 'src/app/services/game.service';
import { ProductionType } from 'src/app/shared/models/production-type';

@Component({
	selector: 'tro-field',
	templateUrl: './field.component.html',
	styleUrls: ['./field.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldComponent extends FieldBaseComponent implements OnDestroy {
	private _imageMode = false;
	private _sink = new SubSink();
	private _listeners: (() => void)[] = [];

	@Input() set imageMode(mode: any) {
		if (mode === false) this._imageMode = false;
		else this._imageMode = true;
	}

	@Input() set clickable(clickable: any) {
		if (clickable === false) return;
		else {
			this.addClickListener();
			this.addHoverListener();
		};
	}

	get imageMode() { return this._imageMode; }

	private _size: number = 10;

	@HostBinding('style.width') private fieldWidth: string;
	@HostBinding('style.height') private fieldHeight: string;
	@HostBinding('style.background-color') private backgroundColor: string;
	@HostBinding('class') highlightSide = HighlightSide.NONE;
	@HostBinding('class.--has-image') showProductionImage = false;

	imageSize = 0;
	elementSize: number;

	constructor(
		gameService: GameService,
		renderer: Renderer2,
		elementRef: ElementRef,
		private cdRef: ChangeDetectorRef
	) {
		super(gameService, renderer, elementRef);
		this._sink.sink = this.gameService.settingsObs.subscribe(settings => {
			this.elementSize = settings.elementSize;
			this.imageMode = settings.imageMode;
		});
	}

	addClickListener() {
		this._listeners.push(this.renderer.listen(this.elementRef.nativeElement, 'click', () => {
			if (this.field.assigned) this.gameService.deselectField(this.field.id);
			else this.gameService.selectField(this.field.id);
		}));
	}

	addHoverListener() {
		this._listeners.push(this.renderer.listen(this.elementRef.nativeElement, 'mouseenter', () => {
			this.gameService.highlightOnOtherFields(this._field.id);
		}));
	}

	@Input() set size(size: number | null) {
		size = size ?? 10;
		this._size = size;
		this.fieldWidth = size + 'px';
		this.fieldHeight = size + 'px';
	}

	setColor() {
		if (this.field) {
			if (this.field.productionType && !this.imageMode) {
				this.backgroundColor = this.field.productionType.fieldColor;
			} else {
				this.backgroundColor = this.field.type.fieldColor;
			}
		}
	}

	highlight(side: HighlightSide) {
		this.isHighlighted = true;
		this.highlightSide = side;
	}

	removeHighlight() {
		this.isHighlighted = false;
	}

	assign(productionType: ProductionType, side: HighlightSide) {
		this.field.assigned = this.isAssigned = true;
		this.field.productionType = productionType;
		this.highlightSide = side;
		if (this.imageMode == false) {
			this.setColor();
		}
		this.gameService.removeHighlight();
		this.cdRef.markForCheck();
	}

	unassign() {
		this._field.assigned = this.isAssigned = false;
		this._field.productionType = null;
		this.showProductionImage = false;
		this.highlightSide = HighlightSide.NONE;
		if (this.imageMode == false) {
			this.setColor();
		}
		this.cdRef.markForCheck();
	}

	showProductionTypeImage() {
		this.showProductionImage = true;
	}

	ngOnDestroy(): void {
		this._sink.unsubscribe();
		this._listeners.forEach(fn => fn());
	}
}
