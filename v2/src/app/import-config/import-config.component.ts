import { Component } from '@angular/core';
import { FormControl } from '@angular/forms';
import { GameService } from '../services/game.service';

@Component({
  selector: 'tro-import-config',
  templateUrl: './import-config.component.html',
  styleUrls: ['./import-config.component.scss']
})
export class ImportConfigComponent {

	constructor(private gameService: GameService) {

	}

	fileInput = new FormControl();

	onImport(e: Event) {
		let input = e.currentTarget as HTMLInputElement;
		let files = input.files;
		if (files && files.length) {
			let fileReader = new FileReader();
			fileReader.onload = (e) => {
				let result = fileReader.result;
				if (result) {
					this.gameService.loadSettings(JSON.parse(result.toString()));
				}
				//console.log(fileReader.result);
			}
			fileReader.readAsText(files[0]);
		}
	}
}
