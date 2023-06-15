import { ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { GameService } from '../services/game.service';
import { Settings } from '../shared/models/settings';

@Component({
  selector: 'tro-help',
  templateUrl: './help.component.html',
  styleUrls: ['./help.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HelpComponent {
	isOpen = false;

	constructor(
		private gameService: GameService,
		private cdRef: ChangeDetectorRef) {
		this.gameService.helpWindowObs.subscribe(o => {
			this.isOpen = o;
			this.cdRef.markForCheck();
		});
	}

	onClose() {
		this.gameService.openHelp(true);
	}
}
