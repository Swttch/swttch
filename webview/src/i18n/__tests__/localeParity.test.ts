import { describe, it, expect, afterAll } from 'vitest';
import i18n, { resources } from '../config';
import { DEFAULT_LOCALE } from '../languageMap';

/**
 * Every locale must carry every key English carries.
 *
 * Without this, a feature can ship its strings in en (+ whatever language the
 * author speaks) and every other locale silently falls back to English — the
 * rest of the suite stays green because no component test asserts on a
 * translated string. That is exactly how the account-pool strings and the
 * pairing/403 strings reached main translated in only one or two locales.
 *
 * Comparison is on the *base* key: i18next plural suffixes are per-language
 * (Arabic has six categories, Russian four, Korean/Japanese/Chinese one), so
 * `count_one` existing in en says nothing about what Korean needs.
 */

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const PLACEHOLDER = /\{\{\s*([\w.]+)[^}]*\}\}/g;

type Catalog = Record<string, unknown>;

function baseKey(key: string): string {
  return key.replace(PLURAL_SUFFIX, '');
}

/**
 * Plural forms other than `other` are excluded from the placeholder check:
 * Arabic's zero/one/two forms read naturally without the numeral ("no tasks"
 * rather than "0 tasks"), so a missing `{{count}}` there is intentional.
 */
function carriesTheCount(key: string): boolean {
  const match = PLURAL_SUFFIX.exec(key);
  return match === null || match[1] === 'other';
}

function placeholdersOf(value: string): Set<string> {
  return new Set(Array.from(value.matchAll(PLACEHOLDER), (m) => m[1]));
}

/** Flatten a catalog to `dotted.path -> string`, dropping non-string leaves. */
function flatten(catalog: Catalog, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(catalog)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of flatten(value as Catalog, path)) out.set(k, v);
    } else if (typeof value === 'string') {
      out.set(path, value);
    }
  }
  return out;
}

export interface ParityReport {
  missing: string[];
  unknown: string[];
  placeholderMismatch: string[];
}

/** Compare one locale namespace against the English one. */
export function compareCatalogs(reference: Catalog, target: Catalog): ParityReport {
  const ref = flatten(reference);
  const tgt = flatten(target);

  const refBases = new Set(Array.from(ref.keys(), baseKey));
  const tgtBases = new Set(Array.from(tgt.keys(), baseKey));

  const refPlaceholders = new Map<string, Set<string>>();
  for (const [key, value] of ref) {
    if (carriesTheCount(key)) refPlaceholders.set(baseKey(key), placeholdersOf(value));
  }

  const placeholderMismatch: string[] = [];
  for (const [key, value] of tgt) {
    if (!carriesTheCount(key)) continue;
    const expected = refPlaceholders.get(baseKey(key));
    if (!expected) continue;
    const actual = placeholdersOf(value);
    const same = expected.size === actual.size && Array.from(expected).every((p) => actual.has(p));
    if (!same) {
      placeholderMismatch.push(
        `${key}: expected {${Array.from(expected).sort().join(', ')}}, got {${Array.from(actual).sort().join(', ')}}`,
      );
    }
  }

  return {
    missing: Array.from(refBases).filter((k) => !tgtBases.has(k)).sort(),
    unknown: Array.from(tgtBases).filter((k) => !refBases.has(k)).sort(),
    placeholderMismatch: placeholderMismatch.sort(),
  };
}

// ── The checker itself, proven against a synthetic catalog ────────────────────
// A parity test that cannot fail is worse than no parity test, so assert that
// each defect is actually reported before trusting the real-catalog result.
describe('compareCatalogs', () => {
  const reference = {
    greeting: 'Hello',
    nested: { kept: 'Kept', dropped: 'Dropped' },
    itemCount_one: '{{count}} item',
    itemCount_other: '{{count}} items',
    withValue: 'Pool {{value}}',
  };

  it('reports a key the locale is missing', () => {
    const report = compareCatalogs(reference, {
      greeting: '안녕하세요',
      nested: { kept: '유지' },
      itemCount: '{{count}}개',
      withValue: '풀 {{value}}',
    });
    expect(report.missing).toEqual(['nested.dropped']);
    expect(report.unknown).toEqual([]);
    expect(report.placeholderMismatch).toEqual([]);
  });

  it('accepts a single-plural-category locale that only has the base key', () => {
    const report = compareCatalogs(
      { itemCount_one: '{{count}} item', itemCount_other: '{{count}} items' },
      { itemCount: '{{count}}개' },
    );
    expect(report.missing).toEqual([]);
  });

  it('reports a key the locale has but English does not', () => {
    const report = compareCatalogs({ greeting: 'Hello' }, { greeting: '안녕', leftover: '잔재' });
    expect(report.unknown).toEqual(['leftover']);
  });

  it('reports a dropped interpolation placeholder', () => {
    const report = compareCatalogs({ withValue: 'Pool {{value}}' }, { withValue: '풀' });
    expect(report.placeholderMismatch).toHaveLength(1);
    expect(report.placeholderMismatch[0]).toContain('withValue');
  });

  it('allows a non-"other" plural form to drop the count (Arabic zero/one/two)', () => {
    const report = compareCatalogs(
      { tasks_one: '{{count}} task', tasks_other: '{{count}} tasks' },
      { tasks_zero: 'لا توجد مهام', tasks_other: 'المهام: {{count}}' },
    );
    expect(report.placeholderMismatch).toEqual([]);
  });
});

// ── The real catalogs ─────────────────────────────────────────────────────────
describe('locale catalogs are in parity with English', () => {
  const englishCatalogs = resources[DEFAULT_LOCALE];
  const otherLocales = Object.keys(resources).filter((lng) => lng !== DEFAULT_LOCALE);

  it('bundles at least the English catalog and one translation', () => {
    expect(englishCatalogs).toBeDefined();
    expect(otherLocales.length).toBeGreaterThan(0);
  });

  it.each(otherLocales)('%s carries every namespace English carries', (locale) => {
    expect(Object.keys(resources[locale]).sort()).toEqual(Object.keys(englishCatalogs).sort());
  });

  // Key presence is not resolution: languages with a single plural category
  // store the bare key (`accountCount`) while English stores `accountCount_other`.
  // Assert i18next actually falls back to the bare key, so the convention the
  // parity check accepts is the same one that renders on screen.
  describe('a counted key resolves in every locale', () => {
    const previousLanguage = i18n.language;
    afterAll(() => i18n.changeLanguage(previousLanguage));

    // Control: an unresolved key comes back as the key itself, which is what the
    // assertion below rules out. Without this, `not.toBe(key)` could be vacuous.
    it('returns the key itself when nothing resolves', async () => {
      await i18n.changeLanguage(DEFAULT_LOCALE);
      expect(i18n.t('settings:account.pool.noSuchKey', { count: 3 })).toBe('account.pool.noSuchKey');
    });

    it.each(Object.keys(resources))('%s renders account.pool.accountCount', async (locale) => {
      await i18n.changeLanguage(locale);
      const rendered = i18n.t('settings:account.pool.accountCount', { count: 3 });
      expect(rendered).not.toBe('account.pool.accountCount');
      expect(rendered).toContain('3');
    });
  });

  it.each(otherLocales)('%s has no missing, unknown, or malformed keys', (locale) => {
    const problems: string[] = [];
    for (const namespace of Object.keys(englishCatalogs)) {
      const target = resources[locale][namespace];
      if (!target) continue;
      const report = compareCatalogs(englishCatalogs[namespace], target);
      for (const key of report.missing) problems.push(`${namespace}: missing ${key}`);
      for (const key of report.unknown) problems.push(`${namespace}: unknown ${key}`);
      for (const detail of report.placeholderMismatch) problems.push(`${namespace}: ${detail}`);
    }
    expect(problems).toEqual([]);
  });
});
