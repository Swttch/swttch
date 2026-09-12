/**
 * Tests for replaceRangeWithText.
 *
 * The regression this guards (issue #286): mention autocomplete used to write
 * its result straight into the composer's value, which re-rendered the editable
 * node. That bypassed the browser's undo history, so Cmd/Ctrl+Z could not undo
 * an inserted mention, and it also invalidated the entries for text typed
 * before it. Routing the edit through execCommand keeps it in that history.
 *
 * jsdom does not implement `document.execCommand`, so the tests exercise both
 * paths: the browser accepting the edit (mocked true), and declining it, where
 * the caller must report the value itself.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { replaceRangeWithText } from '../replaceRangeWithText';

// jsdom leaves document.execCommand undefined, so vi.spyOn cannot attach to it.
// Assign a stub per test and remove it afterwards, as insertNewlineAtCursor's
// tests do.
type ExecCommandHost = { execCommand?: Document['execCommand'] };
function setExecCommand(fn: Document['execCommand']): void {
  (document as ExecCommandHost).execCommand = fn;
}
function clearExecCommand(): void {
  delete (document as ExecCommandHost).execCommand;
}

function makeEditable(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.textContent = text;
  document.body.appendChild(el);
  return el;
}

describe('replaceRangeWithText', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    clearExecCommand();
    vi.restoreAllMocks();
  });

  it('asks the browser to insert the replacement text', () => {
    const el = makeEditable('check @src');
    const exec = vi.fn().mockReturnValue(true);
    setExecCommand(exec as unknown as Document['execCommand']);

    replaceRangeWithText(el, 6, 10, '@src/cart.js ');

    expect(exec).toHaveBeenCalledWith('insertText', false, '@src/cart.js ');
  });

  it('reports true when the browser performs the edit, so the caller stays out', () => {
    const el = makeEditable('check @src');
    setExecCommand(vi.fn().mockReturnValue(true) as unknown as Document['execCommand']);

    expect(replaceRangeWithText(el, 6, 10, '@src/cart.js ')).toBe(true);
  });

  it('reports false when the browser declines, so the caller writes the value', () => {
    const el = makeEditable('check @src');
    setExecCommand(vi.fn().mockReturnValue(false) as unknown as Document['execCommand']);

    expect(replaceRangeWithText(el, 6, 10, '@src/cart.js ')).toBe(false);
  });

  it('reports false when execCommand throws (jsdom "not implemented")', () => {
    const el = makeEditable('check @src');
    setExecCommand((() => {
      throw new Error('not implemented');
    }) as unknown as Document['execCommand']);

    expect(replaceRangeWithText(el, 6, 10, '@src/cart.js ')).toBe(false);
  });

  it('reports false when execCommand is absent entirely', () => {
    const el = makeEditable('check @src');
    clearExecCommand();

    expect(replaceRangeWithText(el, 6, 10, '@src/cart.js ')).toBe(false);
  });

  /**
   * Issue #430 — pasting a saved prompt lost its line breaks.
   *
   * Chromium does not treat a `\n` inside insertText as a line break: it wraps
   * the remainder in a `<div>`, which contributes no newline to `textContent`,
   * the very thing the composer reads its value from. Measured in a real
   * `plaintext-only` editable, inserting "a\nb" produced `a<div>b</div>` and a
   * textContent of "ab" — two lines on screen, one run-on sentence in the value.
   *
   * The fix alternates insertText with insertLineBreak, the same command a
   * single Enter already uses.
   */
  describe('text containing line breaks', () => {
    it('inserts each line with a real line break between them', () => {
      const el = makeEditable('!!');
      const exec = vi.fn().mockReturnValue(true);
      setExecCommand(exec as unknown as Document['execCommand']);

      replaceRangeWithText(el, 0, 2, 'first\nsecond\nthird');

      expect(exec.mock.calls).toEqual([
        ['insertText', false, 'first'],
        ['insertLineBreak'],
        ['insertText', false, 'second'],
        ['insertLineBreak'],
        ['insertText', false, 'third'],
      ]);
    });

    it('never hands a "\\n" to insertText, which is what produced the <div>', () => {
      const el = makeEditable('!!');
      const exec = vi.fn().mockReturnValue(true);
      setExecCommand(exec as unknown as Document['execCommand']);

      replaceRangeWithText(el, 0, 2, 'first\nsecond');

      const insertedStrings = exec.mock.calls
        .filter((call) => call[0] === 'insertText')
        .map((call) => call[2] as string);
      expect(insertedStrings.some((text) => text.includes('\n'))).toBe(false);
    });

    it('keeps a single-line insert to one call, as it always was', () => {
      const el = makeEditable('!!');
      const exec = vi.fn().mockReturnValue(true);
      setExecCommand(exec as unknown as Document['execCommand']);

      replaceRangeWithText(el, 0, 2, 'no breaks here');

      expect(exec.mock.calls).toEqual([['insertText', false, 'no breaks here']]);
    });

    it('asks for a break without a following insert when a line is empty', () => {
      const el = makeEditable('!!');
      const exec = vi.fn().mockReturnValue(true);
      setExecCommand(exec as unknown as Document['execCommand']);

      replaceRangeWithText(el, 0, 2, 'first\n\nthird');

      expect(exec.mock.calls).toEqual([
        ['insertText', false, 'first'],
        ['insertLineBreak'],
        ['insertLineBreak'],
        ['insertText', false, 'third'],
      ]);
    });

    it('stops and reports false when the browser declines a line break', () => {
      const el = makeEditable('!!');
      const exec = vi.fn().mockImplementation((command: string) => command !== 'insertLineBreak');
      setExecCommand(exec as unknown as Document['execCommand']);

      expect(replaceRangeWithText(el, 0, 2, 'first\nsecond')).toBe(false);
    });
  });

  it('selects exactly the span being replaced, so surrounding text survives', () => {
    const el = makeEditable('check @src tail');
    let selectedText: string | null = null;
    setExecCommand(vi.fn().mockImplementation(() => {
      // Capture what the browser would have replaced at the moment of the call.
      selectedText = window.getSelection()?.toString() ?? null;
      return true;
    }) as unknown as Document['execCommand']);

    // Offsets 6..10 cover "@src" and nothing else.
    replaceRangeWithText(el, 6, 10, '@src/cart.js ');

    expect(selectedText).toBe('@src');
  });
});
