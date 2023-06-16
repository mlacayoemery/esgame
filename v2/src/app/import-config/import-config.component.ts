import { Component } from '@angular/core';
import { FormControl } from '@angular/forms';

@Component({
  selector: 'tro-import-config',
  templateUrl: './import-config.component.html',
  styleUrls: ['./import-config.component.scss']
})
export class ImportConfigComponent {
	fileInput = new FormControl();

	onImport(e: Event) {
		let input = e.currentTarget as HTMLInputElement;
		let files = input.files;
		if (files && files.length) {
			let fileReader = new FileReader();
			fileReader.onload = (e) => {
				//console.log(fileReader.result);
			}
			fileReader.readAsText(files[0]);
		}
	}
}
