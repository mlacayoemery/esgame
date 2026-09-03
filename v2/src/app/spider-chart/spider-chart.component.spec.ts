import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { SpiderChartComponent } from './spider-chart.component';

// The chart replaced a PNG the calculator rendered, so nothing downstream validates it any more
// — the geometry here IS the output. These check the things that can be wrong without anything
// throwing: a polygon with the wrong number of corners, a score plotted at the wrong radius, a
// NaN silently dropping an axis.

/** Minimal stand-in: `map_name_<id>` -> a label, the same keys settings.ts registers. */
const LABELS: Record<string, string> = {
	map_name_11: 'Human health',
	map_name_22: 'Nutrient pollution',
	map_name_33: 'Water availability',
	map_name_44: 'Habitat cohesion',
	map_name_55: 'Recreational value'
};

const FIVE = [
	{ id: '11', score: 65 },
	{ id: '22', score: 60 },
	{ id: '33', score: 72 },
	{ id: '44', score: 66 },
	{ id: '55', score: 68 }
];

/** Parse a `points` attribute into numeric pairs. */
const pts = (s: string) => s.trim().split(/\s+/).map(p => p.split(',').map(Number) as [number, number]);
const dist = (c: SpiderChartComponent, [x, y]: [number, number]) =>
	Math.hypot(x - c.cx, y - c.cy);

describe('SpiderChartComponent', () => {
	let fixture: ComponentFixture<SpiderChartComponent>;
	let component: SpiderChartComponent;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			declarations: [SpiderChartComponent],
			providers: [{
				provide: TranslateService,
				useValue: { instant: (k: string) => LABELS[k] ?? k }
			}]
		}).compileComponents();

		fixture = TestBed.createComponent(SpiderChartComponent);
		component = fixture.componentInstance;
	});

	it('draws nothing at all when there are no scores', () => {
		component.entries = [];
		fixture.detectChanges();

		expect(component.isEmpty).toBe(true);
		expect(fixture.nativeElement.querySelector('svg')).toBeNull();
	});

	it('treats null and undefined as empty rather than throwing', () => {
		component.entries = null;
		expect(component.isEmpty).toBe(true);
		component.entries = undefined;
		expect(component.isEmpty).toBe(true);
	});

	it('gives the score polygon one corner per indicator', () => {
		component.entries = FIVE;
		expect(pts(component.scorePoints).length).toBe(5);
		expect(pts(component.ringPoints(1)).length).toBe(5);
	});

	it('puts a score of 100 on the outer ring and 0 at the centre', () => {
		component.entries = [{ id: '11', score: 100 }, { id: '22', score: 0 }];
		const [full, none] = pts(component.scorePoints);

		expect(dist(component, full)).toBeCloseTo(component.radius, 5);
		expect(dist(component, none)).toBeCloseTo(0, 5);
	});

	it('places a score at a radius proportional to it', () => {
		component.entries = [{ id: '11', score: 50 }];
		expect(dist(component, pts(component.scorePoints)[0])).toBeCloseTo(component.radius / 2, 5);
	});

	it('starts the first axis at the top', () => {
		component.entries = FIVE;
		const [x, y] = pts(component.ringPoints(1))[0];

		expect(x).toBeCloseTo(component.cx, 5);
		expect(y).toBeCloseTo(component.cy - component.radius, 5);
	});

	it('clamps out-of-range scores instead of drawing outside the chart', () => {
		component.entries = [{ id: '11', score: 250 }, { id: '22', score: -40 }];
		const [over, under] = pts(component.scorePoints);

		expect(dist(component, over)).toBeCloseTo(component.radius, 5);
		expect(dist(component, under)).toBeCloseTo(0, 5);
		expect(component.displayScore(0)).toBe('100%');
		expect(component.displayScore(1)).toBe('0%');
	});

	it('shows a NaN score as 0 rather than dropping the axis', () => {
		// The calculator used to return NaN for a landscape with no agriculture. An axis that
		// vanished would make a broken round look like a four-indicator game.
		component.entries = [{ id: '11', score: NaN }, { id: '22', score: 50 }];

		expect(pts(component.scorePoints).length).toBe(2);
		expect(dist(component, pts(component.scorePoints)[0])).toBeCloseTo(0, 5);
		expect(component.displayScore(0)).toBe('0%');
	});

	it('labels the axes from the map_name_<id> translations', () => {
		component.entries = FIVE;
		fixture.detectChanges();

		expect(component.label(0)).toBe('Human health');
		expect(component.label(4)).toBe('Recreational value');
		expect(fixture.nativeElement.textContent).toContain('Water availability');
	});

	it('describes itself for a reader who cannot see it', () => {
		component.entries = FIVE;
		fixture.detectChanges();

		const svg: SVGElement = fixture.nativeElement.querySelector('svg');
		expect(svg.getAttribute('role')).toBe('img');
		// Every indicator and its number, so the chart is not a blank to a screen reader the way
		// the PNG was.
		expect(svg.getAttribute('aria-label')).toContain('Human health: 65%');
		expect(svg.getAttribute('aria-label')).toContain('Recreational value: 68%');
	});

	it('anchors labels so the left-hand ones do not run over the chart', () => {
		component.entries = FIVE;

		// index 0 is straight up; the left-hand axes must be end-anchored and the right-hand
		// ones start-anchored.
		expect(component.labelAnchor(0)).toBe('middle');
		expect(component.labelAnchor(1)).toBe('start');
		expect(component.labelAnchor(4)).toBe('end');
	});

	it('renders one spoke, dot and label per indicator', () => {
		component.entries = FIVE;
		fixture.detectChanges();
		const el = fixture.nativeElement;

		expect(el.querySelectorAll('.spider-chart__spoke').length).toBe(5);
		expect(el.querySelectorAll('.spider-chart__dot').length).toBe(5);
		expect(el.querySelectorAll('.spider-chart__label').length).toBe(5);
		expect(el.querySelectorAll('.spider-chart__ring').length).toBe(component.rings.length);
	});

	it('leaves room in the viewBox for the widest labels', () => {
		// A square box clipped "Water availability" and "Recreational value" — every other test
		// passed, because the geometry was right and only the text fell outside. Assert the
		// horizontal room explicitly so the box cannot quietly go back to square.
		component.entries = FIVE;
		const widest = 75; // px at this font size, measured from the rendered chart
		expect(component.cx - component.radius - component.labelGap).toBeGreaterThan(widest);
		expect(component.viewWidth - (component.cx + component.radius + component.labelGap))
			.toBeGreaterThan(widest - 5);
		expect(component.viewWidth).toBeGreaterThan(component.viewHeight);
	});

	it('scales with its container rather than being a fixed raster', () => {
		component.entries = FIVE;
		fixture.detectChanges();
		const svg: SVGElement = fixture.nativeElement.querySelector('svg');

		// A viewBox and no width/height is what makes it responsive; the PNG was 394x394.
		expect(svg.getAttribute('viewBox')).toBe(`0 0 ${component.viewWidth} ${component.viewHeight}`);
		expect(svg.getAttribute('width')).toBeNull();
		expect(svg.getAttribute('height')).toBeNull();
	});
});
