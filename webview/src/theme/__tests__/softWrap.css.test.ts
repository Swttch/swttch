/**
 * Structural guards for the soft-wrap layer in index.css (#179).
 *
 * The setting reaches the transcript as a single class on <html> that these
 * rules key off, and jsdom does no layout — so a component test can confirm the
 * class is applied and still miss a rule that never folds anything.
 */
import { describe, it, expect } from 'vitest';
// `?raw` rather than node:fs — the webview tsconfig targets DOM only. Requires
// index.css in `test.css.include` (vitest.config.ts).
import css from '../../index.css?raw';

/** Extracts the body of the first CSS block whose selector matches. */
function block(selectorStartsWith: string): string {
  const start = css.indexOf(selectorStartsWith);
  if (start === -1) throw new Error(`selector not found: ${selectorStartsWith}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('\n}', open);
  return css.slice(open + 1, close);
}

describe('soft wrap — stylesheet structure (#179)', () => {
  it('wraps and breaks long unbroken tokens when the setting is on', () => {
    const rule = block('.soft-wrap .diff-body-line,');
    expect(rule).toMatch(/white-space:\s*pre-wrap/);
    // Paths and JSON have long stretches with no spaces; breaking only at
    // spaces would leave them overflowing anyway.
    expect(rule).toMatch(/word-break:\s*break-all/);
  });

  it('releases the diff body\'s max-content floor when wrapping is on', () => {
    // That floor exists to keep every row as wide as the longest line so the
    // tint spans it. Left in place while wrapping, it would hold the box open
    // at the unwrapped text's width and the lines would never fold.
    expect(block('.soft-wrap .diff-body {')).toMatch(/min-width:\s*0/);
  });

  it('wraps the diff viewer used by the diff card', () => {
    const rule = block('.soft-wrap .diff-viewer .diff-code {');
    expect(rule).toMatch(/white-space:\s*pre-wrap/);
  });
});
