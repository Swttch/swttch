/**
 * Structural guard for the composer's scrollbar gutter in index.css (#329).
 *
 * RichInput stacks two layers that must wrap at the same points: the editable
 * div (real text, transparent glyphs) and the mirror behind it (visible glyphs).
 * Only the editable layer scrolls, so where the platform draws a classic,
 * space-taking scrollbar — Windows/Linux JCEF & Chromium, unlike macOS overlay
 * scrollbars — its content box narrows once the text overflows while the
 * clipped mirror stays full width. The layers then wrap differently and the
 * same glyph lands a line apart, which surfaces the moment ::selection paints
 * the editable glyphs opaque.
 *
 * Reserving the gutter on BOTH layers keeps their content widths equal in every
 * state. jsdom does no layout, so a component test cannot catch a regression
 * here — only the rule itself can be guarded.
 */
import { describe, it, expect } from 'vitest';
// `?raw` rather than node:fs — the webview tsconfig targets DOM only. Requires
// index.css in `test.css.include` (vitest.config.ts).
import css from '../../index.css?raw';

/** Selector lists of every rule that reserves a stable scrollbar gutter. */
function stableGutterSelectors(): string[] {
  // Comments first: the prose above a rule would otherwise be captured as part
  // of its selector list and no selector would ever match.
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [
    ...withoutComments.matchAll(/([^{}]+)\{[^{}]*scrollbar-gutter\s*:\s*stable[^{}]*\}/g),
  ].map((m) => m[1]);
}

/** Whether some stable-gutter rule applies to exactly this selector. */
function hasStableGutter(selector: string): boolean {
  return stableGutterSelectors().some((list) =>
    list.split(',').some((s) => s.trim() === selector),
  );
}

describe('RichInput scrollbar gutter — stylesheet structure (#329)', () => {
  it('reserves the gutter on the editable layer', () => {
    expect(hasStableGutter('.richInputEditable')).toBe(true);
  });

  it('reserves the gutter on the mirror layer too', () => {
    // The mirror never scrolls, so it is the easy one to forget — and forgetting
    // it is exactly the bug: only the editable layer would lose width.
    expect(hasStableGutter('.richInputMirror')).toBe(true);
  });
});
