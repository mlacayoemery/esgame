import de from '../../assets/i18n/de.json';
import en from '../../assets/i18n/en.json';
import nl from '../../assets/i18n/nl.json';
import pt from '../../assets/i18n/pt.json';

// The translation files drifted and nothing noticed. On 2026-08-14 `nl` and `pt` were each missing
// SEVENTEEN keys that `en` and `de` had, and ngx-translate renders a missing key as the key itself
// — so a Dutch player saw the literal string "Select minimum fields" where the instruction
// "Selecteer ten minste 5% van alle velden" belonged, and the language picker offered "pt" rather
// than a language name. Three of the seventeen were on the game screen; the rest were in the
// configurator, where the keys are slugs like `remove-color-set` and read as nonsense.
//
// Nothing here checks that a translation is GOOD — only that one exists and is structurally sound.
// A native speaker is the only check for the first thing.

const locales: Record<string, Record<string, string>> = { de, en, nl, pt };

/** `{{value}}`-style interpolations ngx-translate substitutes at render time. */
const placeholders = (s: string): string[] =>
	(s.match(/\{\{\s*[^}]+\s*\}\}/g) ?? []).map(p => p.replace(/\s+/g, '')).sort();

describe('translations', () => {
	const names = Object.keys(locales);

	it('every locale carries the same keys', () => {
		const reference = Object.keys(en).sort();
		for (const name of names) {
			expect(Object.keys(locales[name]).sort(), `${name}.json`).toEqual(reference);
		}
	});

	// A dropped placeholder is worse than a missing translation: the string renders, in the right
	// language, with the number silently gone — "Select at least % of all fields". Nothing else
	// here would catch that, and it is exactly the kind of thing a hand-edit does.
	it('keeps every {{placeholder}} the English string has', () => {
		for (const [key, english] of Object.entries(en)) {
			const want = placeholders(english);
			if (!want.length) { continue; }
			for (const name of names) {
				expect(placeholders(locales[name][key] ?? ''), `${name}.json: ${key}`).toEqual(want);
			}
		}
	});

	// Guards the two above from passing on nothing: an empty or renamed file would make both of
	// them vacuously true, since "every locale has the same keys as {}" holds.
	it('is checking a real set of locales and keys', () => {
		expect(names.length).toBeGreaterThanOrEqual(4);
		expect(Object.keys(en).length).toBeGreaterThan(50);
		expect(placeholders(en['Select minimum fields'] ?? '')).toEqual(['{{current}}', '{{value}}']);
	});
});
