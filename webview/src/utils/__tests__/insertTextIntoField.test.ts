/**
 * Tests for insertTextIntoField.
 *
 * The behaviour these guard was measured in real fields, because jsdom implements no
 * editing command:
 *
 * - `insertText` into a textarea keeps the lines but fires `input` once per line, and
 *   took about ten seconds for three thousand lines. `insertHTML` with the escaped
 *   text took 60 ms, as one undo step.
 * - After `insertHTML` of text that ends with a line break, the caret sits before
 *   that break.
 * - An insert from script scrolls neither a textarea nor an input to the caret.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { insertTextIntoField } from '../insertTextIntoField';

type ExecCommandHost = { execCommand?: Document['execCommand'] };

/** Edits the focused field the way the browser was measured to. */
function fakeEditing(options: { declineHtml?: boolean } = {}) {
  const exec = vi.fn((command: string, _ui?: boolean, value = '') => {
    if (command === 'insertHTML' && options.declineHtml) return false;
    const field = document.activeElement as HTMLTextAreaElement;
    const text = command === 'insertHTML'
      ? value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
      : value;
    const start = field.selectionStart ?? 0;
    const end = field.selectionEnd ?? 0;
    field.value = field.value.slice(0, start) + text + field.value.slice(end);
    const quirk = command === 'insertHTML' && text.endsWith('\n') ? 1 : 0;
    field.setSelectionRange(start + text.length - quirk, start + text.length - quirk);
    return true;
  });
  (document as ExecCommandHost).execCommand = exec as unknown as Document['execCommand'];
  return exec;
}

function focused<T extends 'input' | 'textarea'>(tag: T, value = '', caret = value.length) {
  const field = document.createElement(tag);
  field.value = value;
  document.body.appendChild(field);
  field.focus();
  field.setSelectionRange(caret, caret);
  return field;
}

describe('insertTextIntoField', () => {
  afterEach(() => {
    delete (document as ExecCommandHost).execCommand;
    delete (HTMLElement.prototype as { scrollHeight?: unknown }).scrollHeight;
    document.body.innerHTML = '';
  });

  it('gives an input its text through insertText, line breaks and all, for the browser to flatten', () => {
    const exec = fakeEditing();

    expect(insertTextIntoField(focused('input'), 'a\r\nb')).toBe(true);

    expect(exec.mock.calls).toEqual([['insertText', false, 'a\nb']]);
  });

  it('keeps one line of a textarea to insertText', () => {
    const exec = fakeEditing();

    insertTextIntoField(focused('textarea'), 'one line <b>');

    expect(exec.mock.calls).toEqual([['insertText', false, 'one line <b>']]);
  });

  it('gives a textarea several lines as escaped HTML, in one command', () => {
    const exec = fakeEditing();
    const field = focused('textarea', 'X');

    insertTextIntoField(field, '<b>\n&amp; "q"');

    expect(exec.mock.calls).toEqual([['insertHTML', false, '&lt;b&gt;\n&amp;amp; &quot;q&quot;']]);
    expect(field.value).toBe('X<b>\n&amp; "q"');
  });

  it('falls back to insertText where insertHTML is declined', () => {
    fakeEditing({ declineHtml: true });
    const field = focused('textarea');

    expect(insertTextIntoField(field, 'a\nb')).toBe(true);

    expect(field.value).toBe('a\nb');
  });

  it('leaves the caret right after the text, also when it ends with a line break', () => {
    fakeEditing();
    const field = focused('textarea', 'XY', 1);

    insertTextIntoField(field, 'a\nb\n');

    expect(field.value).toBe('Xa\nb\nY');
    expect(field.selectionStart).toBe(5);
  });

  it('ends the run of typing before the insert, so one undo takes only the insert', () => {
    fakeEditing();
    const field = focused('input', 'typed');
    const select = vi.spyOn(field, 'setSelectionRange');

    insertTextIntoField(field, 'pasted');

    expect(select.mock.calls[0]).toEqual([5, 5]);
  });

  it('inserts into a number field, which tells no selection', () => {
    const exec = vi.fn().mockReturnValue(true);
    (document as ExecCommandHost).execCommand = exec as unknown as Document['execCommand'];
    const field = document.createElement('input');
    field.type = 'number';
    document.body.appendChild(field);

    expect(insertTextIntoField(field, '42')).toBe(true);

    expect(exec.mock.calls).toEqual([['insertText', false, '42']]);
  });

  it.each([
    ['declines', () => false],
    ['throws', () => { throw new Error('not implemented'); }],
  ])('reports false when the browser %s the edit', (_name, run) => {
    (document as ExecCommandHost).execCommand = run as unknown as Document['execCommand'];

    expect(insertTextIntoField(focused('input'), 'x')).toBe(false);
  });

  describe('keeping the caret in view', () => {
    /** Ten units of height per line of whatever a field holds. */
    function lineHeights(): void {
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
        configurable: true,
        get(this: HTMLTextAreaElement) {
          return (this.value ?? '').split('\n').length * 10;
        },
      });
    }

    function tall(value: string, caret: number): HTMLTextAreaElement {
      const field = focused('textarea', value, caret);
      Object.defineProperty(field, 'clientHeight', { value: 30, configurable: true });
      return field;
    }

    it('goes to the bottom when the text went in at the end', () => {
      lineHeights();
      fakeEditing();
      const field = tall('a\nb\nc\n', 6);

      insertTextIntoField(field, 'd\ne');

      expect(field.scrollTop).toBe(50);
    });

    it('scrolls to the caret when the text went in above what follows', () => {
      lineHeights();
      fakeEditing();
      const field = tall('top\nrest\nrest\nrest', 3);

      insertTextIntoField(field, '\n1\n2\n3\n4');

      // The caret is on the fifth line: 50 down, in a box 30 high.
      expect(field.scrollTop).toBe(20);
      expect(document.querySelectorAll('textarea')).toHaveLength(1);
    });

    it('stays put when the caret is already in view', () => {
      lineHeights();
      fakeEditing();
      const field = tall('top\nrest\nrest\nrest', 3);

      insertTextIntoField(field, '!');

      expect(field.scrollTop).toBe(0);
    });
  });
});
