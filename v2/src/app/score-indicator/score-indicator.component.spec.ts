import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { ScoreIndicatorComponent } from './score-indicator.component';

// The score indicator is the number a player sees while deciding where to place — the running
// total for the field currently under the cursor. Small, but it is read constantly, and a
// regression would show a plausible wrong number rather than break anything visibly.

const cdRefStub: any = { markForCheck: () => { } };

const field = (...scores: number[]) => ({ scores: scores.map((score, i) => ({ id: `m${i}`, score })) });

const setup = () => {
	const selected = new BehaviorSubject<any>(null);
	const gameStub: any = { currentlySelectedFieldObs: selected };
	return { selected, make: () => TestBed.runInInjectionContext(() => new ScoreIndicatorComponent(gameStub, cdRefStub)) };
};

describe('ScoreIndicatorComponent', () => {

	it('shows nothing when no field is selected', () => {
		const { make } = setup();

		expect(make().score).toBeNull();
	});

	it('sums the selected field\'s scores', () => {
		const { selected, make } = setup();
		const c = make();

		selected.next(field(10, -4, 2));

		expect(c.score).toBe(8);
	});

	// A suitability score less its consequence costs can legitimately be negative; that is the
	// signal the player is meant to act on, so it must not be clamped or hidden.
	it('keeps a negative total', () => {
		const { selected, make } = setup();
		const c = make();

		selected.next(field(3, -11));

		expect(c.score).toBe(-8);
	});

	it('shows zero for a field with no scores', () => {
		const { selected, make } = setup();
		const c = make();

		selected.next(field());

		expect(c.score).toBe(0);
	});

	it('replaces the total as the selection moves', () => {
		const { selected, make } = setup();
		const c = make();

		selected.next(field(5));
		selected.next(field(9, 1));

		expect(c.score).toBe(10);
	});

	// Zero and "nothing selected" are different states — 0 is a real score.
	it('goes back to nothing when the selection is cleared', () => {
		const { selected, make } = setup();
		const c = make();
		selected.next(field(7));

		selected.next(null);

		expect(c.score).toBeNull();
	});
});
