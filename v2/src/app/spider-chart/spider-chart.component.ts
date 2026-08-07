import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

/** One axis of the chart: a consequence-map id, and its 0-100 score for this round. */
export interface SpiderChartEntry {
	id: string;
	score: number;
}

/**
 * The five indicator scores, drawn as a radar chart.
 *
 * This used to be a PNG. tools/R/calculator.r rendered a ggplot to a 394x394 raster, wrote it to
 * the calculation pod's local /app/data, and served it back through plumber's `@assets` mount
 * with a URL built from `req$HTTP_HOST`. That is why the calculation deployment could not be
 * scaled: with more than one replica a plot GET can land on a pod that never wrote the file, so
 * a player gets a 404 for a chart of their own round.
 *
 * The chart is a pure function of five numbers the calculator already returns, so there is
 * nothing to store or serve. Beyond unblocking the replicas, that buys three things the raster
 * could not have: it scales with the panel instead of being a fixed size, the axis labels come
 * from `map_name_<id>` and so are translated (the PNG's were baked in English), and it carries
 * a text description for anyone not looking at it.
 *
 * Labels are resolved with `TranslateService.instant`, matching ScoreBoardComponent — the same
 * `map_name_<id>` keys settings.ts registers from data.json.
 */
@Component({
	selector: 'tro-spider-chart',
	templateUrl: './spider-chart.component.html',
	styleUrls: ['./spider-chart.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: false
})
export class SpiderChartComponent {
	/**
	 * The viewBox is WIDER THAN TALL, and sized by the labels rather than by the circle.
	 *
	 * A square 200x200 box was the obvious choice and was wrong: "Water availability" is about
	 * 71px at this font size, and anchored outside a radius-62 ring it ran to x=254 and was
	 * clipped. Every unit test still passed — the geometry was correct, the text was simply
	 * outside the box — which is why this was only caught by looking at a screenshot.
	 *
	 * Worst case is the widest label on each side: left is "Recreational value" ending at
	 * cx - radius - labelGap - width, right is "Water availability" ending at
	 * cx + radius + labelGap + width. Both fit with room to spare at these numbers.
	 */
	readonly viewWidth = 320;
	readonly viewHeight = 230;
	readonly cx = 160;
	readonly cy = 100;
	readonly radius = 58;
	/** Gap between the outer ring and the start of a label. */
	readonly labelGap = 18;
	/** Grid rings behind the polygon, as fractions of `radius`. */
	readonly rings = [0.25, 0.5, 0.75, 1];

	private _entries: SpiderChartEntry[] = [];

	@Input() set entries(value: SpiderChartEntry[] | null | undefined) {
		this._entries = value ?? [];
	}
	get entries(): SpiderChartEntry[] {
		return this._entries;
	}

	constructor(private translateService: TranslateService) {}

	/** Nothing to draw — the template omits the chart rather than rendering an empty frame. */
	get isEmpty(): boolean {
		return this._entries.length === 0;
	}

	label(i: number): string {
		return this.translateService.instant('map_name_' + this._entries[i].id) as string;
	}

	/**
	 * The angle of axis `i`, from straight up, going clockwise — so the first indicator is at the
	 * top, which is where the ggplot version put it and where a reader expects it.
	 */
	private angle(i: number): number {
		return (Math.PI * 2 * i) / Math.max(1, this._entries.length) - Math.PI / 2;
	}

	private point(i: number, r: number): { x: number; y: number } {
		const a = this.angle(i);
		return { x: this.cx + Math.cos(a) * r, y: this.cy + Math.sin(a) * r };
	}

	/**
	 * A score clamped to the 0-100 the axes are drawn for.
	 *
	 * A non-finite score becomes 0 rather than being dropped. The calculator used to return NaN
	 * for a landscape with no agriculture; tools/R/model.R scores that 0 now, but a chart that
	 * silently omitted an axis would hide a broken round instead of showing it.
	 */
	private clamped(score: number): number {
		if (!Number.isFinite(score)) { return 0; }
		return Math.max(0, Math.min(100, score));
	}

	/** One grid ring, drawn as a polygon so it lines up with the spokes. */
	ringPoints(fraction: number): string {
		return this._entries
			.map((_, i) => {
				const p = this.point(i, this.radius * fraction);
				return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
			})
			.join(' ');
	}

	/** The filled polygon of this round's scores. */
	get scorePoints(): string {
		return this._entries
			.map((e, i) => {
				const p = this.point(i, (this.radius * this.clamped(e.score)) / 100);
				return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
			})
			.join(' ');
	}

	/** The outer end of the spoke for axis `i`. */
	spoke(i: number): { x: number; y: number } {
		return this.point(i, this.radius);
	}

	/** Where the score dot for axis `i` sits. */
	dot(i: number): { x: number; y: number } {
		return this.point(i, (this.radius * this.clamped(this._entries[i].score)) / 100);
	}

	/** Label position, pushed outside the outer ring. */
	labelAt(i: number): { x: number; y: number } {
		return this.point(i, this.radius + this.labelGap);
	}

	/**
	 * Horizontal anchoring, from where the label sits around the circle. Without it, labels on
	 * the left overlap the chart: a middle-anchored string is centred on a point already at the
	 * edge of the drawing.
	 */
	labelAnchor(i: number): 'start' | 'middle' | 'end' {
		const x = Math.cos(this.angle(i));
		if (x > 0.2) { return 'start'; }
		if (x < -0.2) { return 'end'; }
		return 'middle';
	}

	/** The number shown beside each label. Rounded, because the calculator rounds too. */
	displayScore(i: number): number {
		return Math.round(this.clamped(this._entries[i].score));
	}

	/** A one-line description of the chart, for anyone not looking at it. */
	get summary(): string {
		return this._entries
			.map((_, i) => `${this.label(i)}: ${this.displayScore(i)} of 100`)
			.join(', ');
	}

	trackById(_index: number, entry: SpiderChartEntry): string {
		return entry.id;
	}
}
