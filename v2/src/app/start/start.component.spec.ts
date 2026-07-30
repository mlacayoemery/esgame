import { StartComponent } from './start.component';

// The start page is where a game begins, so it is also where the previous one has to end:
// resetGame runs on construction. Getting that wrong would carry a finished board into the
// next session, which looks like a game that will not start rather than one that did not stop.

const setup = (opts: { langs?: string[], current?: string | null } = {}) => {
	const used: string[] = [];
	const navigated: string[] = [];
	const calls: string[] = [];
	const langs = opts.langs ?? ['en', 'nl', 'de'];
	const translateStub: any = {
		getLangs: () => langs,
		currentLang: () => ('current' in opts ? opts.current : 'nl'),
		use: (l: string) => used.push(l)
	};
	const gameStub: any = { resetGame: () => calls.push('reset') };
	const routerStub: any = { navigate: (p: any[]) => navigated.push(p[0]) };
	return { used, navigated, calls, langs, make: () => new StartComponent(translateStub, gameStub, routerStub) };
};

describe('StartComponent', () => {

	it('resets the game on arrival', () => {
		const { calls, make } = setup();

		make();

		expect(calls).toEqual(['reset']);
	});

	it('offers the configured languages', () => {
		const { make } = setup({ langs: ['en', 'pt'] });

		expect(make().languages).toEqual(['en', 'pt']);
	});

	// The spread matters: the component's list must not be the translate service's own array,
	// or a change here would reach into the service.
	it('copies the language list rather than sharing it', () => {
		const { langs, make } = setup();
		const c = make();

		c.languages.push('xx');

		expect(langs).not.toContain('xx');
	});

	it('starts on the active language', () => {
		const { make } = setup({ current: 'de' });

		expect(make().currentLanguage).toBe('de');
	});

	it('falls back to English when no language is active', () => {
		const { make } = setup({ current: null });

		expect(make().currentLanguage).toBe('en');
	});

	it('switches language on selection', () => {
		const { used, make } = setup();
		const c = make();

		c.changeLanguage({ value: 'nl' } as any);

		expect(used).toEqual(['nl']);
	});

	it('routes to the dynamic game', () => {
		const { navigated, make } = setup();

		make().loadDynamic();

		expect(navigated).toEqual(['dynamic-game']);
	});

	it('routes to the static game', () => {
		const { navigated, make } = setup();

		make().loadStatic();

		expect(navigated).toEqual(['static-game']);
	});
});
