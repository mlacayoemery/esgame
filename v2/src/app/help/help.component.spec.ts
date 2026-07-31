import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { HelpComponent } from './help.component';

// The instructions panel picks which text and which image to show from the level, and it is the
// only thing that tells a new player what the game is. Untested until now.

const cdRefStub: any = { markForCheck: () => { } };

const setup = (settingsValue: any = {
	basicInstructionsImageUrl: 'basic.png',
	advancedInstructionsImageUrl: 'advanced.png'
}) => {
	const helpWindow = new BehaviorSubject<boolean>(false);
	const level = new BehaviorSubject<any>(null);
	const settings = new BehaviorSubject<any>(settingsValue);
	const closed: boolean[] = [];
	const gameStub: any = {
		helpWindowObs: helpWindow,
		currentLevelObs: level,
		settingsObs: settings,
		openHelp: (close = false) => closed.push(close)
	};
	return { helpWindow, level, settings, closed, component: TestBed.runInInjectionContext(() => new HelpComponent(gameStub, cdRefStub)) };
};

describe('HelpComponent', () => {

	describe('open state', () => {
		it('starts closed', () => {
			expect(setup().component.isOpen).toBe(false);
		});

		it('follows the service', () => {
			const { component, helpWindow } = setup();

			helpWindow.next(true);
			expect(component.isOpen).toBe(true);

			helpWindow.next(false);
			expect(component.isOpen).toBe(false);
		});

		// openHelp(true) is "close" — the argument is inverted, so passing nothing would reopen
		// the dialog the player just dismissed.
		it('asks the service to close, not to open', () => {
			const { component, closed } = setup();

			component.onClose();

			expect(closed).toEqual([true]);
		});
	});

	describe('which instructions', () => {
		it('shows the basic text before any level exists', () => {
			expect(setup().component.helpText).toBe('basic_instructions');
		});

		it('shows the basic text on level 1', () => {
			const { component, level } = setup();

			level.next({ levelNumber: 1 });

			expect(component.helpText).toBe('basic_instructions');
		});

		it('switches to the advanced text from level 2', () => {
			const { component, level } = setup();

			level.next({ levelNumber: 2 });

			expect(component.helpText).toBe('advanced_instructions');
		});

		it('stays on the advanced text for later levels', () => {
			const { component, level } = setup();

			level.next({ levelNumber: 7 });

			expect(component.helpText).toBe('advanced_instructions');
		});

		// Going back a level should put the basic text back, since prevLevel is reachable.
		it('returns to the basic text if the level goes back to 1', () => {
			const { component, level } = setup();
			level.next({ levelNumber: 3 });

			level.next({ levelNumber: 1 });

			expect(component.helpText).toBe('basic_instructions');
		});
	});

	describe('which image', () => {
		it('uses the basic image on level 1', async () => {
			const { component, level } = setup();

			level.next({ levelNumber: 1 });

			expect(await firstValueFrom(component.imageUrl)).toBe('basic.png');
		});

		it('uses the advanced image from level 2', async () => {
			const { component, level } = setup();

			level.next({ levelNumber: 2 });

			expect(await firstValueFrom(component.imageUrl)).toBe('advanced.png');
		});

		it('follows a later settings change', async () => {
			const { component, level, settings } = setup();
			level.next({ levelNumber: 2 });

			settings.next({ basicInstructionsImageUrl: 'b2.png', advancedInstructionsImageUrl: 'a2.png' });

			expect(await firstValueFrom(component.imageUrl)).toBe('a2.png');
		});

		it('yields undefined when the deployment configures no image', async () => {
			const { component, level } = setup({});

			level.next({ levelNumber: 1 });

			expect(await firstValueFrom(component.imageUrl)).toBeUndefined();
		});
	});
});
