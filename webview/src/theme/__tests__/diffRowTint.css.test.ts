/**
 * Structural guards for the diff row tint in index.css (#179).
 *
 * jsdom does no layout, so a component test can confirm the elements and classes
 * are in place and still miss the actual defect: rows sized to their own text end
 * up with different widths, and each row's tint then stops wherever that line
 * ends. That was found by measuring widths in a real browser — 15 rows ranging
 * from 1227px to 4704px inside one 4704px-wide block — and these assertions pin
 * the stylesheet shape that fixed it.
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

describe('diff row tint — stylesheet structure (#179)', () => {
  it('sizes the shared box to the longest line', () => {
    // `max-content`, not `fit-content`: the box has to outgrow the scroll
    // container so the rows inside have something wider than the viewport to
    // fill. Without this the rows resolve against the visible width again.
    expect(block('.diff-body {')).toMatch(/min-width:\s*max-content/);
  });

  it('makes every row fill that box rather than its own text', () => {
    const rule = block('.diff-body-line {');
    expect(rule).toMatch(/min-width:\s*100%/);
    // `width: fit-content` was the original attempt and is the bug: it sizes
    // each row to its own text, so rows of different lengths end at different
    // points and their tints stop early.
    expect(rule).not.toMatch(/width:\s*fit-content/);
  });
});
