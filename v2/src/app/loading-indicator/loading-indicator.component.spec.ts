import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { LoadingIndicatorComponent } from './loading-indicator.component';
import { GameService } from '../services/game.service';

// The spinner is driven by a host binding — `:host.show` in the SCSS is what makes it visible —
// and a host binding is evaluated by the view that DECLARES the component, not by the component
// itself. So the question that matters is not "does the subscriber run" (it does) but "does
// anything mark the declaring view dirty when the value changes".
//
// That distinction is why this was reported as unfixable: the subscriber was observed running
// with length 0 while the class stayed on the element.
describe('LoadingIndicatorComponent', () => {
	let fixture: ComponentFixture<LoadingIndicatorComponent>;
	let loading: BehaviorSubject<boolean[]>;
	let host: HTMLElement;

	beforeEach(async () => {
		loading = new BehaviorSubject<boolean[]>([]);
		await TestBed.configureTestingModule({
			declarations: [LoadingIndicatorComponent],
			imports: [MatProgressSpinnerModule],
			providers: [{ provide: GameService, useValue: { loadingIndicatorObs: loading.asObservable() } }]
		}).compileComponents();

		fixture = TestBed.createComponent(LoadingIndicatorComponent);
		// autoDetectChanges attaches the fixture to ApplicationRef, which is the arrangement a
		// real app is in: something ticks when Angular is told the view is dirty. Without it the
		// fixture is detached and NOTHING but an explicit detectChanges() can ever refresh it —
		// not ApplicationRef.tick(), not a scheduled task — so the test would measure the
		// harness rather than the component. That was measured, not assumed.
		fixture.autoDetectChanges();
		host = fixture.nativeElement;   // the <tro-loading-indicator> element itself
	});

	it('is hidden with nothing loading', () => {
		expect(host.classList.contains('show')).toBe(false);
	});

	it('shows while something is loading', async () => {
		loading.next([true]);
		await fixture.whenStable();
		expect(host.classList.contains('show')).toBe(true);
	});

	// The regression. failLevel() clears the counter from an error callback — outside Angular's
	// zone, with nothing else scheduling a check. Nothing here calls detectChanges() after the
	// emission, which is the situation in the app: if the component does not itself cause the
	// declaring view to be refreshed, the class never goes and the spinner covers the board
	// forever. In a deployment this is one failed coverage fetch away.
	it('clears when loading stops outside the zone, with no external change detection', async () => {
		loading.next([true]);
		await fixture.whenStable();
		expect(host.classList.contains('show')).toBe(true);

		TestBed.inject(NgZone).runOutsideAngular(() => loading.next([]));
		await fixture.whenStable();

		expect(host.classList.contains('show')).toBe(false);
	});
});
