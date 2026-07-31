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
	// alert() is not implemented in jsdom.
	let alertSpy: any;
	beforeEach(() => {
		alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => { });
		vi.spyOn(console, 'error').mockImplementation(() => { });
	});
	afterEach(() => vi.restoreAllMocks());

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

		// JSON.parse used to be unguarded here, and because this runs inside FileReader.onload
		// the throw was asynchronous — no caller could catch it, so a wrong file was silently
		// indistinguishable from no file.
		it('loads nothing when the file is not valid JSON', async () => {
			const { component, loaded } = setup();

			component.onImport(changeEventWith('this is not json'));
			await flushFileReader();

			expect(loaded).toEqual([]);
		});

		it('tells the user when the file cannot be parsed', async () => {
			const { component } = setup();

			component.onImport(changeEventWith('{ broken'));
			await flushFileReader();

			expect(alertSpy).toHaveBeenCalled();
		});

		it('says nothing when the file parses fine', async () => {
			const { component } = setup();

			component.onImport(changeEventWith('{"mode":"GRID"}'));
			await flushFileReader();

			expect(alertSpy).not.toHaveBeenCalled();
		});

		// Parsing is not the same as being a configuration, and the try/catch only covers
		// parsing. `null` in particular gets all the way through: new Settings(ts, null) does
		// not throw — measured — it builds a game with no maps, no production types and an
		// undefined board width. The player gets an empty board and no explanation.
		for (const body of ['null', '[1,2,3]', '"a string"', '42']) {
			it(`refuses ${body}, which parses but is not a configuration`, async () => {
				const { component, loaded } = setup();

				component.onImport(changeEventWith(body));
				await flushFileReader();

				expect(loaded).toEqual([]);
				expect(alertSpy).toHaveBeenCalled();
			});
		}
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

		// start() used to subscribe for the component's lifetime, so the subscription outlived the
		// navigation and every later loadSettings navigated again — and the level components call
		// loadSettings on init, immediately after arriving.
		it('does not navigate again when the settings change later', () => {
			const { component, settings, navigated } = setup({ mode: 'GRID' });

			component.start();
			settings.next({ mode: 'SVG' });

			expect(navigated).toEqual(['static-game']);
		});

		it('navigates once per call, with nothing left listening', () => {
			const { component, settings, navigated } = setup({ mode: 'GRID' });

			component.start();
			component.start();
			settings.next({ mode: 'GRID' });

			expect(navigated).toEqual(['static-game', 'static-game']);
		});
	});
});
