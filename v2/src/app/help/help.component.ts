import { Component } from '@angular/core';

@Component({
  selector: 'tro-help',
  templateUrl: './help.component.html',
  styleUrls: ['./help.component.scss']
})
export class HelpComponent {
	isOpen = false;

	onOpen() {
		this.isOpen = true;
	}

	onClose() {
		this.isOpen = false;
	}
}
