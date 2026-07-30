import { BehaviorSubject } from 'rxjs';
import { ImportConfigComponent } from './import-config.component';

// Importing a config is the one place the app takes a file from the user, and start() is what
// sends them into the game afterwards. Neither had coverage.

const setup = (initialSettings: any = { mode: 'GRID' }) => {
	const settings = new BehaviorSubject<any>(initialSettings);
	const loaded: any[] = [];
	const navigated: any[] = [];
	const gameStub: any = {
		settingsObs: settings,
		loadSettings: (s: any) => loaded.push(s)
	};
	const routerStub: any = { navigate: (path: any[]) => navigated.push(path[0]) };
	return { settings, loaded, navigated, component: new ImportConfigComponent(gameStub, routerStub) };
};

// A change event carrying a file, shaped the way the component reads it.
const changeEventWith = (text: string): Event => ({
	currentTarget: { files: [new File([text], 'config.json', { type: 'application/json' })] }
} as any);

const flushFileReader = () => new Promise(resolve => setTimeout(resolve, 20));

describe('ImportConfigComponent', () => {

	describe('onImport', () => {
		it('loads the parsed file into the game', async () => {
			const { component, loaded } = setup();

			component.onImport(changeEventWith('{"mode":"SVG","title":"x"}'));
			await flushFileReader();

			expect(loaded).toEqual([{ mode: 'SVG', title: 'x' }]);
		});

		it('does nothing when no file was chosen', async () => {
			const { component, loaded } = setup();

			component.onImport({ currentTarget: { files: [] } } as any);
			await flushFileReader();

			expect(loaded).toEqual([]);
		});

		it('does nothing when the input has no files at all', async () => {
			const { component, loaded } = setup();

			component.onImport({ currentTarget: { files: null } } as any);
			await flushFileReader();

			expect(loaded).toEqual([]);
		});

		// JSON.parse is unguarded, inside FileReader.onload. A malformed file therefore throws
		// asynchronously, where no caller can catch it: nothing loads, nothing navigates, and the
		// user gets no indication beyond a console error. Recorded as current behaviour.
		it('loads nothing when the file is not valid JSON', async () => {
			const { component, loaded } = setup();
			const onError = vi.fn();
			window.addEventListener('error', onError);

			component.onImport(changeEventWith('this is not json'));
			await flushFileReader();

			window.removeEventListener('error', onError);
			expect(loaded).toEqual([]);
		});
	});

	describe('start', () => {
		it('sends a grid config to the static game', () => {
			const { component, navigated } = setup({ mode: 'GRID' });

			component.start();

			expect(navigated).toEqual(['static-game']);
		});

		it('sends anything else to the dynamic game', () => {
			const { component, navigated } = setup({ mode: 'SVG' });

			component.start();

			expect(navigated).toEqual(['dynamic-game']);
		});

		// start() subscribes to settingsObs and never unsubscribes, so the subscription outlives
		// the navigation. Every later loadSettings — and the level components call it on init —
		// re-runs this and navigates again. Recorded rather than fixed here.
		it('keeps navigating on later settings changes', () => {
			const { component, settings, navigated } = setup({ mode: 'GRID' });

			component.start();
			settings.next({ mode: 'SVG' });

			expect(navigated).toEqual(['static-game', 'dynamic-game']);
		});

		it('adds another live subscription every time it is called', () => {
			const { component, settings, navigated } = setup({ mode: 'GRID' });

			component.start();
			component.start();
			settings.next({ mode: 'GRID' });

			// Two from the calls, then two more because both subscriptions are still listening.
			expect(navigated).toHaveLength(4);
		});
	});
});
