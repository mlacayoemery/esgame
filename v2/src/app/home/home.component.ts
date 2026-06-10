import { Component } from '@angular/core';
import { ConfigService } from '../services/config.service';

/**
 * Site-root (`/`) landing. Renders the client-side grid game or the dynamic SVG game depending on
 * `config.json` `defaultMode` (default `static`), keeping the clean `/` URL either way. The start /
 * configuration page stays at `/config`.
 */
@Component({
    selector: 'tro-home',
    template: `
		<tro-svg-level *ngIf="dynamic"></tro-svg-level>
		<tro-grid-level *ngIf="!dynamic"></tro-grid-level>
	`,
    standalone: false
})
export class HomeComponent {
	dynamic: boolean;

	constructor(config: ConfigService) {
		this.dynamic = config.appConfig.defaultMode === 'dynamic';
	}
}
