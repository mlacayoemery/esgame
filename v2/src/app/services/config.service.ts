import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, firstValueFrom, map, of } from 'rxjs';

export interface AppConfig {
	/** URL (relative to <base href>) of the grid / "static" game settings JSON. */
	staticDataUrl: string;
	/** URL (relative to <base href>) of the SVG / "dynamic" game settings JSON. */
	dynamicDataUrl: string;
	/**
	 * Optional override for the calculation backend URL. When present it replaces the
	 * `calcUrl` baked into the game data, so the same build can target any backend (or none).
	 * An empty string forces fully client-side play (no backend) — used by the static GitHub Pages deployment.
	 */
	calcUrl?: string;
	/**
	 * Which game the site root (`/`) launches: the client-side grid game (`static`, the default) or
	 * the SVG/backend game (`dynamic`). The start page stays at `/config` either way.
	 */
	defaultMode?: 'static' | 'dynamic';
	/** Optional SVG-mode cell border (grid line) color, overriding the game data / built-in default. */
	gridLineColor?: string;
	/** Optional SVG-mode cell border (grid line) width, e.g. "0.05px". */
	gridLineWidth?: string;
}

const DEFAULT_CONFIG: AppConfig = {
	staticDataUrl: 'assets/dataGridExample.json',
	dynamicDataUrl: 'assets/data.json',
	defaultMode: 'static'
};

/**
 * Loads deployment configuration (`assets/config.json`) at runtime instead of baking it into the
 * bundle. This lets a single build / container image serve any deployment by mounting or overriding
 * `assets/config.json` and the referenced data files — no rebuild required.
 */
@Injectable({ providedIn: 'root' })
export class ConfigService {
	private config: AppConfig = DEFAULT_CONFIG;

	constructor(private http: HttpClient) { }

	/** Resolved once at startup via APP_INITIALIZER. Falls back to defaults if config.json is absent. */
	load(): Promise<void> {
		return firstValueFrom(
			this.http.get<Partial<AppConfig>>('assets/config.json').pipe(
				catchError(() => of({} as Partial<AppConfig>))
			)
		).then(cfg => { this.config = { ...DEFAULT_CONFIG, ...cfg }; });
	}

	get appConfig(): AppConfig { return this.config; }

	/** Fetch the game settings JSON for the given mode, applying any overrides from config.json. */
	getGameData(mode: 'static' | 'dynamic'): Observable<any> {
		const url = mode === 'static' ? this.config.staticDataUrl : this.config.dynamicDataUrl;
		return this.http.get<any>(url).pipe(
			map(data => {
				const out = { ...data };
				if (this.config.calcUrl !== undefined) out.calcUrl = this.config.calcUrl;
				if (this.config.gridLineColor !== undefined) out.gridLineColor = this.config.gridLineColor;
				if (this.config.gridLineWidth !== undefined) out.gridLineWidth = this.config.gridLineWidth;
				return out;
			})
		);
	}
}
