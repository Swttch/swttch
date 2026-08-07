/**
 * Structural guards for the IDE theme sync layer in index.css (issue #267).
 *
 * These assert properties of the stylesheet itself rather than rendered output,
 * because the failure they protect against is invisible to jsdom: jsdom does
 * not resolve `var()` fallback chains, so a broken chain still "passes" any
 * component test. Both bugs below were found by evaluating computed styles in a
 * real browser, and would otherwise have shipped.
 */
import { describe, it, expect } from 'vitest';
// `?raw` rather than node:fs — the webview tsconfig targets DOM only and has no
// Node type declarations, so importing node:fs fails `wv-lint`. This requires
// index.css to be listed in `test.css.include` (vitest.config.ts); vitest
// replaces non-included stylesheets with an empty string.
import css from '../../index.css?raw';

/** Extracts the body of the first CSS block whose selector matches. */
function block(selectorStartsWith: string): string {
  const start = css.indexOf(selectorStartsWith);
  if (start === -1) throw new Error(`selector not found: ${selectorStartsWith}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('\n}', open);
  return css.slice(open + 1, close);
}

const SYNC_SELECTOR = "html.ide-theme-sync[data-ide-colors='available']";

describe('IDE theme sync — stylesheet structure (issue #267)', () => {
  it('gates the override on both the opt-in class and injected colors', () => {
    // Dropping the attribute check would apply the layer with no variables set
    // when the toggle is on but Kotlin failed to read the IDE colors.
    expect(css).toContain(SYNC_SELECTOR);
  });

  it('never falls back to a color literal inside the sync block', () => {
    // A literal here resolves to the same value in light and dark. Writing the
    // light values made dark mode render near-black text on a near-black IDE
    // background when a theme supplied only a background color.
    const body = block(SYNC_SELECTOR);
    const declarations = body
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.startsWith('--') && l.includes('var(--ccg-ide-'));

    expect(declarations.length).toBeGreaterThan(0);
    for (const line of declarations) {
      // Every fallback must be another var(), i.e. the per-palette --own-* alias.
      const fallback = line.slice(line.indexOf('var(--ccg-ide-'));
      expect(fallback, `hard-coded fallback in: ${line}`).toContain('var(--own-');
      // Guard the specific shape that broke: `, <r> <g> <b>)` or `, #hex)`.
      expect(line, `numeric literal fallback in: ${line}`).not.toMatch(/,\s*\d+\s+\d+\s+\d+\s*\)/);
      expect(line, `hex literal fallback in: ${line}`).not.toMatch(/,\s*#[0-9a-fA-F]{3,8}\s*\)/);
    }
  });

  it('defines every --own-* alias as a literal, not a back-reference', () => {
    // The sync block redefines the same tokens these aliases would point at, so
    // `--own-text-primary-rgb: var(--text-primary-rgb)` is a cycle: CSS voids
    // the whole chain and the token resolves to an empty string.
    for (const selector of [':root {', '.dark {']) {
      const body = block(selector);
      const ownLines = body
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.startsWith('--own-'));

      expect(ownLines.length, `no --own-* aliases in ${selector}`).toBeGreaterThan(0);
      for (const line of ownLines) {
        expect(line, `cyclic alias in ${selector}: ${line}`).not.toContain('var(');
      }
    }
  });

  it('declares the same --own-* alias set in :root and .dark', () => {
    // A name present in only one palette silently leaves the other palette's
    // fallback undefined.
    const names = (selector: string) =>
      (block(selector).match(/--own-[a-z0-9-]+/g) ?? []).sort();

    const light = names(':root {');
    const dark = names('.dark {');
    expect(light.length).toBeGreaterThan(0);
    expect(dark).toEqual(light);
  });

  it('backs every --own-* alias referenced by the sync block with a definition', () => {
    const referenced = new Set(
      (block(SYNC_SELECTOR).match(/var\(--own-[a-z0-9-]+/g) ?? [])
        .map(m => m.replace('var(', '')),
    );
    const defined = new Set(block(':root {').match(/--own-[a-z0-9-]+/g) ?? []);

    expect(referenced.size).toBeGreaterThan(0);
    for (const name of referenced) {
      expect(defined.has(name), `${name} referenced but never defined`).toBe(true);
    }
  });
});
