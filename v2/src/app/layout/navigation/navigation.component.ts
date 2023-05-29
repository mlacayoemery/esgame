import { Component } from '@angular/core';
import { MatSelectChange } from '@angular/material/select';
import { TranslateService } from '@ngx-translate/core';
import { GameService } from 'src/app/services/game.service';

@Component({
  selector: 'tro-navigation',
  templateUrl: './navigation.component.html',
  styleUrls: ['./navigation.component.scss']
})
export class NavigationComponent {

	constructor(
		private translate: TranslateService,
		private gameService: GameService
	) {
		this.gameService.resetGame();
	}

	changeLanguage(event: MatSelectChange) {
		this.translate.use(event.value);
	}
}
