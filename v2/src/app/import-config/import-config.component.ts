import { Component } from '@angular/core';
import { GameService } from '../services/game.service';
import { Router } from '@angular/router';
import { take } from 'rxjs';

@Component({
    selector: 'tro-import-config',
    templateUrl: './import-config.component.html',
    styleUrls: ['./import-config.component.scss'],
    standalone: false
})
export class ImportConfigComponent {

	constructor(private gameService: GameService, private router: Router) {

	}

	onImport(e: Event) {
		let input = e.currentTarget as HTMLInputElement;
		let files = input.files;
		if (files && files.length) {
			let fileReader = new FileReader();
			fileReader.onload = _ => {
				let result = fileReader.result;
				if (result) {
					// JSON.parse was unguarded here. Because this runs in FileReader.onload the
					// throw is asynchronous, so no caller could catch it: choosing the wrong file
					// looked exactly like choosing no file at all — nothing loaded, nothing said.
					//
					// Parsing successfully is not the same as being a configuration, and the
					// catch below only covered parsing. Anything else that got through was
					// stopped by `new Settings(...)` happening to throw, which is incidental —
					// and `null` does not throw at all: it builds a game with no maps, no
					// production types and an undefined board width. Measured, not assumed.
					try {
						const parsed = JSON.parse(result.toString());
						if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
							throw new Error(
								`a game configuration must be a JSON object, got ` +
								`${Array.isArray(parsed) ? 'an array' : typeof parsed}`);
						}
						this.gameService.loadSettings(parsed);
					} catch (err) {
						console.error(err);
						alert("That file could not be read as a game configuration.");
					}
				}
			}
			fileReader.readAsText(files[0]);
		}
	}

	start() {
		// take(1): this used to subscribe for the lifetime of the component, so the subscription
		// outlived the navigation and every later loadSettings re-ran it and navigated again —
		// and the level components call loadSettings on init, immediately after arriving here.
		// Two clicks left two live subscriptions, and each settings change fired both.
		this.gameService.settingsObs.pipe(take(1)).subscribe(settings => {
			if (settings.mode == 'GRID') {
				this.router.navigate(['static-game']);
			} else {
				this.router.navigate(['dynamic-game']);
			}
		});
	}
}
