import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { GameService } from '../services/game.service';

@Component({
	selector: 'tro-loading-indicator',
	templateUrl: './loading-indicator.component.html',
	styleUrls: ['./loading-indicator.component.scss'],
	standalone: false,
	// `:host.show` in the SCSS is what makes the spinner visible, so this class is the whole
	// component. It used to be a plain field written from an rxjs subscriber:
	//
	//     @HostBinding('class.show') show = false;
	//     constructor(...) { gameService.loadingIndicatorObs.subscribe(s => this.show = s.length > 0); }
	//
	// which left the spinner covering the board forever whenever loading stopped from an error
	// callback. The subscriber did run — that was verified — but a host binding is evaluated by
	// the view that DECLARES the component, and assigning a field tells Angular nothing about
	// which view that is. From inside the zone something else happened to trigger a check and it
	// looked fine; from an error callback outside it, nothing did. `detectChanges()` on the
	// component's own ChangeDetectorRef cannot help either: that ref is the component's template
	// view, and its host bindings live in the parent's.
	//
	// A signal carries that information. Reading one inside a host binding registers the binding
	// as a consumer, so a write marks exactly the right view for traversal — no zone involved,
	// which is why this holds for the error path the old code could not reach.
	host: { '[class.show]': 'show()' }
})
export class LoadingIndicatorComponent {
	// inject() rather than a constructor parameter: field initializers run before the constructor
	// body, so `this.gameService` would still be undefined here if it were a parameter property.
	private readonly gameService = inject(GameService);

	protected readonly show = toSignal(
		this.gameService.loadingIndicatorObs.pipe(map(loading => loading.length > 0)),
		{ initialValue: false }
	);
}
