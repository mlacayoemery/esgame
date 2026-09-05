import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
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
	/** Optional SVG-mode hover-highlight border width (board units), e.g. "1". */
	highlightWidth?: string;
}

const DEFAULT_CONFIG: AppConfig = {
	staticDataUrl: 'assets/dataStaticGridRect.json',
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

	/**
	 * Resolved once at startup via APP_INITIALIZER. Falls back to defaults if config.json is
	 * absent — a build with no config.json is a supported deployment, so a 404 is quiet.
	 *
	 * Everything else is not. This file IS the deployment mechanism: one image retargeted by
	 * mounting a config over it. A 500, or a config.json served as index.html by a server
	 * without an assets rule, or one with a trailing comma, used to be indistinguishable from
	 * absent — the app booted on defaults, pointing at a different backend than intended, and
	 * said nothing at all.
	 *
	 * It still boots on defaults, because refusing to start would be worse. It is no longer
	 * silent about why.
	 */
	load(): Promise<void> {
		return firstValueFrom(
			this.http.get<Partial<AppConfig>>('assets/config.json').pipe(
				catchError((err: HttpErrorResponse) => {
					if (err.status !== 404) {
						// status 0 is a network failure or CORS; HttpClient reports a body that did
						// not parse as JSON with status 200 and the parse error in err.message.
						console.error(
							`[esgame] assets/config.json could not be loaded (status ${err.status}` +
							`${err.statusText ? ' ' + err.statusText : ''}): ${err.message}. ` +
							`Starting with built-in defaults — calcUrl and defaultMode are NOT the ` +
							`ones you configured.`);
					}
					return of({} as Partial<AppConfig>);
				})
			)
		).then(cfg => { this.config = { ...DEFAULT_CONFIG, ...this.asConfigObject(cfg) }; });
	}

	/**
	 * Spreading whatever came back is not safe. `{...DEFAULT_CONFIG, ...cfg}` assumes cfg is an
	 * object, and a string spreads CHARACTER BY CHARACTER — a config.json served as index.html
	 * produced a config whose keys were "0", "1", "2", …, with no error anywhere. An array or a
	 * bare `null` merge to nothing just as quietly.
	 *
	 * Anything that is not a plain object is a broken config, not a config.
	 */
	private asConfigObject(cfg: unknown): Partial<AppConfig> {
		if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) return cfg as Partial<AppConfig>;
		console.error(
			`[esgame] assets/config.json did not contain a JSON object (got ` +
			`${Array.isArray(cfg) ? 'an array' : typeof cfg}: ` +
			`${JSON.stringify(cfg)?.slice(0, 80) ?? String(cfg)}). ` +
			`Starting with built-in defaults — calcUrl and defaultMode are NOT the ones you ` +
			`configured. A server answering every path with index.html does exactly this.`);
		return {};
	}

	get appConfig(): AppConfig { return this.config; }

	/**
	 * Fetch the game settings JSON for the given mode, applying any overrides from config.json.
	 *
	 * The shape is checked for the same reason it is in load(): `{ ...data }` on a string spreads
	 * it character by character, so a data file served as index.html produced a Settings object
	 * built from { "0": "<", "1": "!", … } — a board with no maps and no production types, and
	 * nothing anywhere saying why. An HTTP failure already errors with a usable message; this
	 * covers the 200 that is not what it claims to be.
	 */
	getGameData(mode: 'static' | 'dynamic'): Observable<any> {
		const url = mode === 'static' ? this.config.staticDataUrl : this.config.dynamicDataUrl;
		return this.http.get<any>(url).pipe(
			map(data => {
				if (!data || typeof data !== 'object' || Array.isArray(data)) {
					throw new Error(
						`${url} did not contain a JSON object (got ` +
						`${Array.isArray(data) ? 'an array' : typeof data}: ` +
						`${JSON.stringify(data)?.slice(0, 80) ?? String(data)}). ` +
						`A server answering every path with index.html does exactly this.`);
				}
				const out = { ...data };
				if (this.config.calcUrl !== undefined) out.calcUrl = this.config.calcUrl;
				if (this.config.gridLineColor !== undefined) out.gridLineColor = this.config.gridLineColor;
				if (this.config.gridLineWidth !== undefined) out.gridLineWidth = this.config.gridLineWidth;
				if (this.config.highlightWidth !== undefined) out.highlightWidth = this.config.highlightWidth;
				return out;
			})
		);
	}
}
