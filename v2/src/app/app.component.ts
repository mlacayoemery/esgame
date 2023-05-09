import { Component } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.scss']
})
export class AppComponent {
	title = 'Tradeoff-V2';
	
	constructor(private translate: TranslateService) {
		this.translate.addLangs(['de', 'en']);
		this.translate.setDefaultLang('de');
		this.translate.use('de');
	}
}
