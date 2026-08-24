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
// Markdown code blocks are styled in streaming.css, not index.css — the wrap
// rule for them lives next to the rest of their styling.
import streamingCss from '../../pages/ChatPage/streaming.css?raw';

/** Extracts the body of the first CSS block whose selector matches. */
function blockIn(source: string, selectorStartsWith: string): string {
  const start = source.indexOf(selectorStartsWith);
  if (start === -1) throw new Error(`selector not found: ${selectorStartsWith}`);
  const open = source.indexOf('{', start);
  const close = source.indexOf('\n}', open);
  return source.slice(open + 1, close);
}

function block(selectorStartsWith: string): string {
  return blockIn(css, selectorStartsWith);
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
    const rule = block('.soft-wrap .diff-viewer .diff-code,');
    expect(rule).toMatch(/white-space:\s*pre-wrap/);
  });
});

/**
 * The per-block toggle (#179 follow-up) puts the same classes on the block
 * instead of on <html>, so every selector needs both forms. A rule written only
 * as `.soft-wrap .x` silently does nothing when the class lands on `.x` itself
 * — which is how the first attempt shipped a toggle that flipped its label and
 * changed no layout.
 */
describe('soft wrap — the classes work on the block itself, not just as an ancestor', () => {
  const carriers = [
    ['.diff-body-line', 'soft-wrap'],
    ['.monospace-block', 'soft-wrap'],
    ['.diff-body-line', 'soft-wrap-off'],
    ['.monospace-block', 'soft-wrap-off'],
  ] as const;

  it.each(carriers)('selects %s when it carries .%s itself', (target, cls) => {
    expect(css).toContain(`${target}.${cls}`);
  });

  it('selects the diff viewer both ways', () => {
    expect(css).toContain('.soft-wrap .diff-viewer .diff-code');
    expect(css).toContain('.diff-viewer.soft-wrap .diff-code');
  });

  it('undoes the fold when a block opts out while the setting is on', () => {
    const rule = block('.soft-wrap-off .diff-body-line,');
    expect(rule).toMatch(/white-space:\s*pre\b/);
    expect(rule).toMatch(/word-break:\s*normal/);
    // Back to scrolling — the text no longer fits the box.
    expect(rule).toMatch(/overflow-x:\s*auto/);
  });

  it('restores the diff body floor when a block opts out', () => {
    expect(block('.soft-wrap-off .diff-body {')).toMatch(/min-width:\s*max-content/);
  });
});

/**
 * The button first shipped with no backdrop, so the glyph floated over the code
 * with nothing marking it as a control, and the two states looked identical.
 */
describe('soft wrap — the button reads as a control, and as on or off', () => {
  it('takes the copy button\'s chip by variable, not by copied value', () => {
    // Copying the values would let the two drift apart the next time either is
    // retuned, and light/dark each define their own.
    const rule = block('.wrap-toggle-button {');
    expect(rule).toMatch(/background:\s*var\(--md-code-copy-btn-bg\)/);
    expect(rule).toMatch(/color:\s*var\(--md-code-copy-btn-fg\)/);
    expect(block('.wrap-toggle-button:hover {'))
      .toMatch(/background:\s*var\(--md-code-copy-btn-bg-hover\)/);
  });

  it('washes the chip with the accent when wrapping is on', () => {
    // One glyph, two backdrops — the state lives here, not in the drawing. Held
    // under full strength: one chip sits on every block, and a saturated one
    // pulls the eye off the code underneath.
    const rule = block(".wrap-toggle-button[aria-pressed='true'] {");
    const bg = rule.match(/background:\s*([^;]+);/)?.[1] ?? '';
    expect(bg).toContain('var(--accent-primary-rgb)');
    const alpha = Number(bg.match(/\/\s*([\d.]+)\s*\)/)?.[1]);
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(1);
    expect(rule).toMatch(/color:\s*var\(--accent-primary-fg\)/);
  });
});

/**
 * The reporter turned the setting on and still hit a block that scrolled
 * sideways: a fenced code block in an assistant message. Streamdown renders it
 * as its own <pre data-streamdown="code-block-body">, which carries none of the
 * classes the rules above select, so the setting never reached it.
 */
describe('soft wrap — markdown code blocks (#179 follow-up)', () => {
  it('folds the fenced block Streamdown renders', () => {
    const rule = blockIn(streamingCss, '.soft-wrap [data-streamdown="code-block-body"] {');
    expect(rule).toMatch(/white-space:\s*pre-wrap/);
    expect(rule).toMatch(/word-break:\s*break-all/);
    // The <pre> is the scroll container; leaving it scrollable would keep a
    // sideways scrollbar under text that no longer overflows.
    expect(rule).toMatch(/overflow-x:\s*hidden/);
  });

  it('keeps a wrapped continuation clear of the line-number gutter', () => {
    // Each line is a <span class="block"> whose line number sits in a ::before
    // of `w-6 mr-4` (1.5rem + 1rem). Without the hanging indent the folded part
    // of a line starts under those numbers.
    const rule = blockIn(
      streamingCss,
      '.soft-wrap [data-streamdown="code-block-body"] > code > span {',
    );
    expect(rule).toMatch(/padding-left:\s*2\.5rem/);
    expect(rule).toMatch(/text-indent:\s*-2\.5rem/);
  });

  it('lets one code block opt back out while the setting is on', () => {
    const rule = blockIn(streamingCss, '.soft-wrap-off [data-streamdown="code-block-body"] {');
    expect(rule).toMatch(/white-space:\s*pre\b/);
    expect(rule).toMatch(/overflow-x:\s*auto/);
    // The hanging indent only makes sense while lines fold.
    const lines = blockIn(
      streamingCss,
      '.soft-wrap-off [data-streamdown="code-block-body"] > code > span {',
    );
    expect(lines).toMatch(/padding-left:\s*0/);
    expect(lines).toMatch(/text-indent:\s*0/);
  });
});
