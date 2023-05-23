import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostBinding, HostListener, Input, OnDestroy, QueryList, Renderer2, ViewChildren } from '@angular/core';
import { GameService } from '../services/game.service';
import { Field, HighlightField, SelectedField } from '../shared/models/field';
import { GameBoard, GameBoardClickMode } from '../shared/models/game-board';
import { Settings } from '../shared/models/settings';
import { Legend } from '../shared/models/legend';
import { SubSink } from 'subsink';

@Component({
	template: '',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class GameBoardBaseComponent implements OnDestroy {
	protected _boardData: GameBoard;
	protected _hideLegend = false;
	protected _clickMode = GameBoardClickMode.Field;
	protected _selectedFields: SelectedField[] = [];
	protected _highlightedFields: HighlightField[] = [];
	protected _sink = new SubSink();
	protected _listeners: (() => void)[] = [];

	fields: Field[] = [];
	settings: Settings;
	board: GameBoard | undefined;
	legend: Legend;
	GameBoardClickMode = GameBoardClickMode;
	@Input() set clickMode(mode: GameBoardClickMode) {
		this._clickMode = mode;
		if (mode == GameBoardClickMode.SelectBoard) {
			this.addClickListener();
		}
	}

	get clickMode() { return this._clickMode; }

	@HostBinding('style.grid-template-columns') fieldColumns: string;

	@Input()
	set boardData(data: GameBoard | null) {
		if (data) {
			this._boardData = data;
			this.fields = data.fields;
			this.legend = data.legend;
			this.board = data;
		}
	}

	get boardData() { return this._boardData; }

	@Input() set hideLegend(value: any) {
		if (value === false) this._hideLegend = false;
		else this._hideLegend = true;
	}

	get hideLegend() { return this._hideLegend; }

	constructor(
		protected gameService: GameService,
		protected renderer: Renderer2,
		protected elementRef: ElementRef,
		protected cdRef: ChangeDetectorRef
	) {
		this._sink.sink = this.gameService.settingsObs.subscribe(settings => {
			this.settings = settings;
		});
	}

	@HostListener('mouseleave')
	onLeave() {
		this.gameService.removeHighlight();
	}

	private addClickListener() {
		this._listeners.push(this.renderer.listen(this.elementRef.nativeElement, 'click', () => {
			if (this.boardData) {
				this.gameService.selectGameBoard(this.boardData);
			}
		}));
	}

	ngOnDestroy(): void {
		this._sink.unsubscribe();
		this._listeners.forEach(fn => fn());
	}
}
