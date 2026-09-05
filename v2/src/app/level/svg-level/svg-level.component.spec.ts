import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import { SvgLevelComponent } from './svg-level.component';
import { ScoreService } from 'src/app/services/score.service';

// SvgLevelComponent gates whether a round may be submitted at all (minSelected) and decides
// when the instructions open. Both are game rules rather than presentation, and neither had
// unit coverage — the help behaviour was only covered end to end.

const setup = (opts: { minSelected?: number, percentage?: number } = {}) => {
	const level = new BehaviorSubject<any>(null);
	const settings = new BehaviorSubject<any>({
		minSelected: opts.minSelected ?? 0,
		visualOptions: {}
	});
	const calls: string[] = [];
	let percentage = opts.percentage ?? 0;
	const gameStub: any = {
		currentLevelObs: level,
		settingsObs: settings,
		selectedProductionTypeObs: new BehaviorSubject(null),
		focusedGameBoardObs: new BehaviorSubject(null),
		productionTypesObs: new BehaviorSubject([]),
		selectGameBoard: () => { },
		getPercentageSelectedFields: () => percentage,
		goToNextLevel: () => calls.push('next'),
		goToPreviousLevel: () => calls.push('prev'),
		openHelp: () => calls.push('help'),
		loadSettings: () => { },
		initialiseSVGMode: () => { }
	};
	const configStub: any = { getGameData: () => of({}) };
	// The real thing: it is a pure sum over the fields it is handed, with no dependencies of its
	// own, so a stub here would only be a second implementation to keep in step.
	const scoreStub: any = new ScoreService();
	// Grouping keys off the translated map name; the identity is enough to group by id here.
	const translateStub: any = { instant: (k: string) => k };

	// nextLevel() reaches for a <dialog> by id when the board is too empty.
	const dialog: any = { shown: 0, showModal() { this.shown += 1; } };
	const originalGetElementById = document.getElementById;
	document.getElementById = ((id: string) =>
		id === 'svg-level-dialog' ? dialog : originalGetElementById.call(document, id)) as any;

	const component = TestBed.runInInjectionContext(() => new SvgLevelComponent(gameStub, configStub, scoreStub, translateStub));
	return {
		component, level, settings, calls, dialog,
		setPercentage: (p: number) => { percentage = p; },
		restore: () => { document.getElementById = originalGetElementById; }
	};
};

describe('SvgLevelComponent', () => {

	describe('minSelected gate', () => {
		it('submits the round when enough of the board is filled', () => {
			const { component, calls, restore } = setup({ minSelected: 10, percentage: 0.25 });

			component.nextLevel();
			restore();

			expect(calls).toContain('next');
		});

		it('refuses and shows the dialog when too little is filled', () => {
			const { component, calls, dialog, restore } = setup({ minSelected: 10, percentage: 0.05 });

			component.nextLevel();
			restore();

			expect(calls).not.toContain('next');
			expect(dialog.shown).toBe(1);
		});

		// minSelected is a percentage in settings but compared against a fraction, hence /100.
		// Exactly on the threshold counts as enough.
		it('accepts exactly the minimum', () => {
			const { component, calls, restore } = setup({ minSelected: 10, percentage: 0.1 });

			component.nextLevel();
			restore();

			expect(calls).toContain('next');
		});

		it('reports the percentage it measured', () => {
			const { component, restore } = setup({ minSelected: 50, percentage: 0.123 });

			component.nextLevel();
			restore();

			expect(component.currentlySelectedPercentage).toBe('12.3');
		});

		it('always submits when no minimum is configured', () => {
			const { component, calls, restore } = setup({ minSelected: 0, percentage: 0 });

			component.nextLevel();
			restore();

			expect(calls).toContain('next');
		});
	});

	describe('instructions', () => {
		// Regression cover for the dialog that re-opened itself. `level` is consumed by seven
		// `| async` pipes in the template and the auto-open lives in a tap, so it runs once per
		// SUBSCRIBER; the null -> level-1 transition then fired it a second time, on top of
		// whatever the player had just clicked.
		it('opens once per level however many times the observable is read', async () => {
			const { component, level, calls, restore } = setup();
			const readLevel = () => new Promise(r => component.level.subscribe(r));

			level.next({ levelNumber: 1, isReadOnly: false, gameBoards: [] });
			await readLevel();
			await readLevel();
			await readLevel();
			restore();

			expect(calls.filter(c => c === 'help')).toHaveLength(1);
		});

		it('does not open before a level exists', async () => {
			const { component, calls, restore } = setup();

			await new Promise(r => component.level.subscribe(r));
			restore();

			expect(calls).not.toContain('help');
		});

		it('opens again on the next level', async () => {
			const { component, level, calls, restore } = setup();
			const readLevel = () => new Promise(r => component.level.subscribe(r));

			level.next({ levelNumber: 1, isReadOnly: false, gameBoards: [] });
			await readLevel();
			level.next({ levelNumber: 2, isReadOnly: false, gameBoards: [] });
			await readLevel();
			restore();

			expect(calls.filter(c => c === 'help')).toHaveLength(2);
		});

		// Instructions are for the first two levels only.
		it('stops opening past level two', async () => {
			const { component, level, calls, restore } = setup();
			const readLevel = () => new Promise(r => component.level.subscribe(r));

			level.next({ levelNumber: 3, isReadOnly: false, gameBoards: [] });
			await readLevel();
			restore();

			expect(calls).not.toContain('help');
		});

		it('does not open on a frozen level', async () => {
			const { component, level, calls, restore } = setup();

			level.next({ levelNumber: 1, isReadOnly: true, gameBoards: [] });
			await new Promise(r => component.level.subscribe(r));
			restore();

			expect(calls).not.toContain('help');
		});
	});

	describe('visual options', () => {
		it('defaults to esgame\'s look when a deployment sets nothing', () => {
			const { component, restore } = setup();
			restore();

			expect(component.highlightFocusedBoard).toBe(false);
			expect(component.neutralScoreColors).toBe(false);
		});

		it('follows the deployment\'s visualOptions', () => {
			const { component, settings, restore } = setup();

			settings.next({ minSelected: 0, visualOptions: { highlightFocusedBoard: true, neutralScoreColors: true } });
			restore();

			expect(component.highlightFocusedBoard).toBe(true);
			expect(component.neutralScoreColors).toBe(true);
		});
	});

	it('toggles the spider-plot expansion', () => {
		const { component, restore } = setup();
		restore();

		expect(component.imageExpand).toBe(false);
		component.switchExpand();
		expect(component.imageExpand).toBe(true);
		component.switchExpand();
		expect(component.imageExpand).toBe(false);
	});
});
