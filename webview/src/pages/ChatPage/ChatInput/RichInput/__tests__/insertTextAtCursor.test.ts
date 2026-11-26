/**
 * Tests for insertTextAtCursor.
 *
 * The behaviour these guard was measured in a real `plaintext-only` editable,
 * because jsdom implements no editing command at all:
 *
 * - `insertText` with "a\nb" gives `a<div>b</div>`, and a textContent of "ab".
 *   The composer reads its value from textContent, so the line break is gone from
 *   the screen and from the sent message (#430, #751).
 * - `insertHTML` with the escaped text puts real "\n" characters in, as one undo
 *   step, and takes a few milliseconds for thousands of lines.
 * - Alternating `insertText` and `insertLineBreak` also keeps the breaks, but
 *   took about ten seconds for three thousand lines, so it is only the fallback.
 *
 * The tests pin which commands are asked for.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { insertTextAtCursor } from '../insertTextAtCursor';

// jsdom leaves document.execCommand undefined, so vi.spyOn cannot attach to it.
type ExecCommandHost = { execCommand?: Document['execCommand'] };
function setExecCommand(fn: unknown): void {
  (document as ExecCommandHost).execCommand = fn as Document['execCommand'];
}

describe('insertTextAtCursor', () => {
  afterEach(() => {
    delete (document as ExecCommandHost).execCommand;
    document.body.innerHTML = '';
  });

  it('keeps a single-line insert to one insertText call', () => {
    const exec = vi.fn().mockReturnValue(true);
    setExecCommand(exec);

    expect(insertTextAtCursor('no breaks <here>')).toBe(true);

    expect(exec.mock.calls).toEqual([['insertText', false, 'no breaks <here>']]);
  });

  it('inserts empty text through insertText, which clears the selected range', () => {
    const exec = vi.fn().mockReturnValue(true);
    setExecCommand(exec);

    insertTextAtCursor('');

    expect(exec.mock.calls).toEqual([['insertText', false, '']]);
  });

  it('inserts text with line breaks in one command, so one undo takes it back', () => {
    const exec = vi.fn().mockReturnValue(true);
    setExecCommand(exec);

    expect(insertTextAtCursor('first\n\nthird\n')).toBe(true);

    expect(exec.mock.calls).toEqual([['insertHTML', false, 'first\n\nthird\n']]);
  });

  /**
   * A "\n" at the very end of an editable draws no line of its own, so the browser
   * left the caret before it and what was typed next landed on the previous line.
   * Enter handles this by keeping one more "\n" after the caret, and so does this.
   */
  describe('text that ends with a line break', () => {
    /** An editable holding `text`, with the caret `offset` characters in. */
    function editableWithCaret(text: string, offset: number): void {
      const el = document.createElement('div');
      el.setAttribute('contenteditable', 'plaintext-only');
      el.textContent = text;
      document.body.appendChild(el);
      document.getSelection()!.collapse(el.firstChild!, offset);
    }

    it('adds the break that keeps the caret on the new line, when nothing follows it', () => {
      const exec = vi.fn().mockReturnValue(true);
      setExecCommand(exec);
      editableWithCaret('typed ', 6);

      insertTextAtCursor('a\nb\n');

      expect(exec.mock.calls).toEqual([['insertHTML', false, 'a\nb\n\n']]);
    });

    it('adds nothing in the middle of the text, where it would be a blank line', () => {
      const exec = vi.fn().mockReturnValue(true);
      setExecCommand(exec);
      editableWithCaret('XY', 1);

      insertTextAtCursor('a\nb\n');

      expect(exec.mock.calls).toEqual([['insertHTML', false, 'a\nb\n']]);
    });

    it('adds nothing for text that ends inside a line', () => {
      const exec = vi.fn().mockReturnValue(true);
      setExecCommand(exec);
      editableWithCaret('typed ', 6);

      insertTextAtCursor('a\nb');

      expect(exec.mock.calls).toEqual([['insertHTML', false, 'a\nb']]);
    });
  });

  /**
   * The browser scrolls to the caret after a paste of its own, but not after an
   * insert from script, so long text left the box showing its first lines.
   */
  describe('keeping the caret in view', () => {
    /** An editable 100 high holding 500 of content, with the caret `offset` characters into "one two". */
    function scrollingEditable(offset: number): HTMLElement {
      const el = document.createElement('div');
      el.setAttribute('contenteditable', 'plaintext-only');
      el.textContent = 'one two';
      Object.defineProperty(el, 'scrollHeight', { value: 500, configurable: true });
      el.getBoundingClientRect = () => ({ top: 0, bottom: 100 }) as DOMRect;
      document.body.appendChild(el);
      document.getSelection()!.collapse(el.firstChild!, offset);
      return el;
    }

    /** What the caret's rectangle reads as; jsdom does no layout of its own. */
    function caretAt(top: number, bottom: number): void {
      Object.defineProperty(Range.prototype, 'getClientRects', {
        configurable: true,
        value: () => [{ top, bottom }],
      });
    }

    afterEach(() => {
      delete (Range.prototype as { getClientRects?: unknown }).getClientRects;
    });

    it('goes to the bottom when the text went in at the end', () => {
      setExecCommand(vi.fn().mockReturnValue(true));
      const el = scrollingEditable(7);

      insertTextAtCursor('a\nb');

      expect(el.scrollTop).toBe(500);
    });

    it('scrolls down by what the caret sits below the box', () => {
      setExecCommand(vi.fn().mockReturnValue(true));
      const el = scrollingEditable(3);
      caretAt(130, 150);

      insertTextAtCursor('a\nb');

      expect(el.scrollTop).toBe(50);
    });

    it('stays put when the caret is already in view', () => {
      setExecCommand(vi.fn().mockReturnValue(true));
      const el = scrollingEditable(3);
      el.scrollTop = 20;
      caretAt(40, 60);

      insertTextAtCursor('a\nb');

      expect(el.scrollTop).toBe(20);
    });

    it('leaves the scroll alone when the browser declined the edit', () => {
      setExecCommand(vi.fn().mockReturnValue(false));
      const el = scrollingEditable(7);

      insertTextAtCursor('a');

      expect(el.scrollTop).toBe(0);
    });
  });

  it('escapes what HTML would read as markup, so the text arrives as typed', () => {
    const exec = vi.fn().mockReturnValue(true);
    setExecCommand(exec);

    insertTextAtCursor('<b>bold</b> &amp;\n"quoted"');

    expect(exec.mock.calls).toEqual([
      ['insertHTML', false, '&lt;b&gt;bold&lt;/b&gt; &amp;amp;\n"quoted"'],
    ]);
  });

  it('turns CRLF and a lone CR into "\\n", which is what the composer counts as a break', () => {
    const exec = vi.fn().mockReturnValue(true);
    setExecCommand(exec);

    insertTextAtCursor('one\r\ntwo\rthree');

    expect(exec.mock.calls).toEqual([['insertHTML', false, 'one\ntwo\nthree']]);
  });

  describe('when the browser declines insertHTML', () => {
    it('alternates insertText and insertLineBreak instead', () => {
      const exec = vi.fn().mockImplementation((command: string) => command !== 'insertHTML');
      setExecCommand(exec);

      expect(insertTextAtCursor('first\n\nthird')).toBe(true);

      expect(exec.mock.calls.slice(1)).toEqual([
        ['insertText', false, 'first'],
        ['insertLineBreak'],
        ['insertLineBreak'],
        ['insertText', false, 'third'],
      ]);
    });

    it('stops and reports false when a line break is declined too', () => {
      const exec = vi.fn().mockImplementation((command: string) => command === 'insertText');
      setExecCommand(exec);

      expect(insertTextAtCursor('first\nsecond')).toBe(false);
    });
  });

  it('reports false when execCommand throws', () => {
    setExecCommand(() => {
      throw new Error('not implemented');
    });

    expect(insertTextAtCursor('a\nb')).toBe(false);
  });

  it('reports false when execCommand is absent entirely', () => {
    expect(insertTextAtCursor('a')).toBe(false);
  });
});
