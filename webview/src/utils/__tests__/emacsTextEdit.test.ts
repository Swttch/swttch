import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmacsTextKey } from '@/shared';
import { applyEmacsTextKey } from '../emacsTextEdit';
import { killRing } from '../killRing';
import { getSelectionRange, setSelectionRange } from '../domSelection';

/**
 * The fourteen macOS Emacs text keys applied to real DOM fields (issue #506).
 *
 * jsdom has no `document.execCommand` editing and no `Selection.modify`, so:
 * - `<input>` and `<textarea>` are asserted through the fallback path
 *   (`setRangeText` plus an `input` event) with execCommand refusing, and once
 *   through the native path with execCommand recorded;
 * - a contentEditable is asserted by recording the execCommand and
 *   `Selection.modify` calls together with the selection each was issued on.
 */

type ExecCall = { command: string; value: string | undefined; selection: { start: number; end: number } | null };

const originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand');
const originalModify = Object.getOwnPropertyDescriptor(Selection.prototype, 'modify');

let execCalls: ExecCall[];

/** Install a fake `document.execCommand` that records each call and answers `result`. */
function stubExecCommand(result: boolean, root: HTMLElement | null = null) {
  execCalls = [];
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    writable: true,
    value: (command: string, _showUi?: boolean, value?: string) => {
      execCalls.push({ command, value, selection: root ? getSelectionRange(root) : null });
      return result;
    },
  });
}

function restoreExecCommand() {
  if (originalExecCommand) {
    Object.defineProperty(document, 'execCommand', originalExecCommand);
  } else {
    delete (document as { execCommand?: Document['execCommand'] }).execCommand;
  }
}

const ALL_KEYS = Object.values(EmacsTextKey);
const EDIT_KEYS = [EmacsTextKey.D, EmacsTextKey.H, EmacsTextKey.K, EmacsTextKey.L, EmacsTextKey.O, EmacsTextKey.T, EmacsTextKey.Y];

/** Give an element the layout numbers jsdom does not compute. */
function layout(element: HTMLElement, { clientHeight, scrollHeight = clientHeight }: { clientHeight: number; scrollHeight?: number }) {
  let scrollTop = 0;
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: clientHeight });
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (next: number) => {
      scrollTop = Math.max(0, Math.min(next, scrollHeight - clientHeight));
    },
  });
}

beforeEach(() => {
  killRing.clear();
});

afterEach(() => {
  restoreExecCommand();
  document.body.innerHTML = '';
});

describe('applyEmacsTextKey in form fields (fallback path)', () => {
  let inputEvents: number;

  function makeField<T extends HTMLInputElement | HTMLTextAreaElement>(field: T, value: string, caret: number, end = caret): T {
    field.value = value;
    document.body.appendChild(field);
    field.focus();
    field.setSelectionRange(caret, end);
    field.addEventListener('input', () => inputEvents++);
    return field;
  }
  const input = (value: string, caret: number, end?: number) => makeField(document.createElement('input'), value, caret, end);
  const textarea = (value: string, caret: number, end?: number) => makeField(document.createElement('textarea'), value, caret, end);
  const selectionOf = (field: HTMLInputElement | HTMLTextAreaElement) => [field.selectionStart, field.selectionEnd];

  beforeEach(() => {
    inputEvents = 0;
    stubExecCommand(false);
  });

  it('d deletes the character after the caret and reports the change', () => {
    const field = input('hello world', 5);
    applyEmacsTextKey(field, EmacsTextKey.D, false);
    expect(field.value).toBe('helloworld');
    expect(selectionOf(field)).toEqual([5, 5]);
    expect(inputEvents).toBe(1);
    // The browser's own delete was tried first, then the browser delete of the
    // exact span, and only then the fallback.
    expect(execCalls.map((c) => c.command)).toEqual(['forwardDelete', 'delete']);
  });

  it('d does nothing at the very end', () => {
    const field = input('hello', 5);
    applyEmacsTextKey(field, EmacsTextKey.D, false);
    expect(field.value).toBe('hello');
    expect(inputEvents).toBe(0);
  });

  it('d and h delete a selection', () => {
    const field = input('hello world', 0, 6);
    applyEmacsTextKey(field, EmacsTextKey.D, false);
    expect(field.value).toBe('world');

    const other = input('hello world', 5, 11);
    applyEmacsTextKey(other, EmacsTextKey.H, false);
    expect(other.value).toBe('hello');
  });

  it('h deletes the character before the caret', () => {
    const field = input('hello world', 5);
    applyEmacsTextKey(field, EmacsTextKey.H, false);
    expect(field.value).toBe('hell world');
    expect(selectionOf(field)).toEqual([4, 4]);
  });

  it('h does nothing at the very start', () => {
    const field = input('hello', 0);
    applyEmacsTextKey(field, EmacsTextKey.H, false);
    expect(field.value).toBe('hello');
  });

  it('k cuts to the end of the paragraph and y puts it back', () => {
    const field = input('hello world', 5);
    applyEmacsTextKey(field, EmacsTextKey.K, false);
    expect(field.value).toBe('hello');
    expect(killRing.text()).toBe(' world');

    field.setSelectionRange(0, 0);
    applyEmacsTextKey(field, EmacsTextKey.Y, false);
    expect(field.value).toBe(' worldhello');
    expect(selectionOf(field)).toEqual([6, 6]);
  });

  it('consecutive k in a textarea take the line, its break and the next line, and y returns all of it', () => {
    const area = textarea('one\ntwo', 0);

    applyEmacsTextKey(area, EmacsTextKey.K, false);
    expect(area.value).toBe('\ntwo');
    applyEmacsTextKey(area, EmacsTextKey.K, false);
    expect(area.value).toBe('two');
    applyEmacsTextKey(area, EmacsTextKey.K, false);
    expect(area.value).toBe('');
    // At the very end there is nothing left to cut.
    applyEmacsTextKey(area, EmacsTextKey.K, false);
    expect(killRing.text()).toBe('one\ntwo');

    applyEmacsTextKey(area, EmacsTextKey.Y, false);
    expect(area.value).toBe('one\ntwo');
    expect(selectionOf(area)).toEqual([7, 7]);
  });

  it('another key between two k starts a new kill', () => {
    const area = textarea('one\ntwo', 0);
    applyEmacsTextKey(area, EmacsTextKey.K, false);
    applyEmacsTextKey(area, EmacsTextKey.F, false);
    applyEmacsTextKey(area, EmacsTextKey.B, false);
    applyEmacsTextKey(area, EmacsTextKey.K, false);
    expect(killRing.text()).toBe('\n');
  });

  it('y replaces a selection, and does nothing with an empty ring', () => {
    const field = input('abc', 1);
    applyEmacsTextKey(field, EmacsTextKey.Y, false);
    expect(field.value).toBe('abc');
    expect(inputEvents).toBe(0);

    killRing.recordKill({}, 'XY', 0, 'XY', '');
    field.setSelectionRange(0, 2);
    applyEmacsTextKey(field, EmacsTextKey.Y, false);
    expect(field.value).toBe('XYc');
    expect(selectionOf(field)).toEqual([2, 2]);
  });

  it('t swaps the characters around the caret', () => {
    const field = input('abcd', 2);
    applyEmacsTextKey(field, EmacsTextKey.T, false);
    expect(field.value).toBe('acbd');
    expect(selectionOf(field)).toEqual([3, 3]);
  });

  it('t at the end swaps the last two', () => {
    const field = input('abcd', 4);
    applyEmacsTextKey(field, EmacsTextKey.T, false);
    expect(field.value).toBe('abdc');
  });

  it('t does not swap across a line break', () => {
    const area = textarea('ab\ncd', 3);
    applyEmacsTextKey(area, EmacsTextKey.T, false);
    expect(area.value).toBe('ab\ncd');
  });

  it('o opens a line in a textarea, caret before the break', () => {
    const area = textarea('ab', 1);
    applyEmacsTextKey(area, EmacsTextKey.O, false);
    expect(area.value).toBe('a\nb');
    expect(selectionOf(area)).toEqual([1, 1]);
  });

  it('o does nothing in a single-line input', () => {
    const field = input('ab', 1);
    applyEmacsTextKey(field, EmacsTextKey.O, false);
    expect(field.value).toBe('ab');
  });

  it('v sends an input caret to its end, extending with Shift', () => {
    const field = input('hello world', 2);
    applyEmacsTextKey(field, EmacsTextKey.V, false);
    expect(selectionOf(field)).toEqual([11, 11]);

    field.setSelectionRange(2, 2);
    applyEmacsTextKey(field, EmacsTextKey.V, true);
    expect(selectionOf(field)).toEqual([2, 11]);
  });

  it('v moves a textarea caret down by the rows it shows', () => {
    const area = textarea('l0\nl1\nl2\nl3\nl4\nl5', 1);
    area.style.lineHeight = '20px';
    layout(area, { clientHeight: 60 });

    applyEmacsTextKey(area, EmacsTextKey.V, false);
    // Three rows fit, so line 0 column 1 goes to line 3 column 1.
    expect(selectionOf(area)).toEqual([10, 10]);

    applyEmacsTextKey(area, EmacsTextKey.V, true);
    expect(selectionOf(area)).toEqual([10, 17]);
  });

  it('l centres a textarea caret by its line', () => {
    const area = textarea(Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n'), 0);
    area.style.lineHeight = '20px';
    area.style.padding = '0';
    layout(area, { clientHeight: 100, scrollHeight: 600 });
    // Caret on line 20: its top is 400, its middle 410, the view's middle 50.
    const caret = area.value.indexOf('line 20');
    area.setSelectionRange(caret, caret);

    applyEmacsTextKey(area, EmacsTextKey.L, false);

    expect(area.scrollTop).toBe(360);
    expect(area.value).toContain('line 20');
  });

  it('l does nothing in an input', () => {
    const field = input('hello', 2);
    applyEmacsTextKey(field, EmacsTextKey.L, false);
    expect(field.value).toBe('hello');
    expect(selectionOf(field)).toEqual([2, 2]);
  });

  it('b and f step, extending with Shift', () => {
    const field = input('hello', 2);
    applyEmacsTextKey(field, EmacsTextKey.F, false);
    expect(selectionOf(field)).toEqual([3, 3]);
    applyEmacsTextKey(field, EmacsTextKey.B, true);
    expect(selectionOf(field)).toEqual([2, 3]);
  });

  it('a and e go to the paragraph edges, extending with Shift', () => {
    const area = textarea('one\ntwo three', 6);
    applyEmacsTextKey(area, EmacsTextKey.E, false);
    expect(selectionOf(area)).toEqual([13, 13]);
    applyEmacsTextKey(area, EmacsTextKey.A, true);
    expect(selectionOf(area)).toEqual([4, 13]);
  });

  it('n and p move by a line, extending with Shift', () => {
    const area = textarea('abc\ndef', 1);
    applyEmacsTextKey(area, EmacsTextKey.N, true);
    expect(selectionOf(area)).toEqual([1, 5]);
    applyEmacsTextKey(area, EmacsTextKey.P, false);
    expect(selectionOf(area)).toEqual([1, 1]);
  });

  it.each(EDIT_KEYS)('Shift+Ctrl+%s does nothing, as macOS binds nothing to it', (key) => {
    killRing.recordKill({}, 'ring', 0, 'ring', '');
    const area = textarea('ab\ncd', 2);
    area.style.lineHeight = '20px';
    layout(area, { clientHeight: 20, scrollHeight: 40 });

    applyEmacsTextKey(area, key, true);

    expect(area.value).toBe('ab\ncd');
    expect(selectionOf(area)).toEqual([2, 2]);
    expect(area.scrollTop).toBe(0);
    expect(killRing.text()).toBe('ring');
    expect(inputEvents).toBe(0);
    expect(execCalls).toEqual([]);
  });
});

describe('applyEmacsTextKey in form fields (native path)', () => {
  it('k selects the span and deletes it through the browser', () => {
    const area = document.createElement('textarea');
    area.value = 'hello world';
    document.body.appendChild(area);
    area.focus();
    area.setSelectionRange(5, 5);
    const seen: Array<[string, number | null, number | null]> = [];
    stubExecCommand(true);
    const record = document.execCommand;
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      writable: true,
      value: (command: string, showUi?: boolean, value?: string) => {
        seen.push([command, area.selectionStart, area.selectionEnd]);
        return record.call(document, command, showUi, value);
      },
    });

    applyEmacsTextKey(area, EmacsTextKey.K, false);

    expect(seen).toEqual([['delete', 5, 11]]);
    expect(killRing.text()).toBe(' world');
  });

  it('y inserts through insertText, newline and all', () => {
    const area = document.createElement('textarea');
    document.body.appendChild(area);
    area.focus();
    killRing.recordKill({}, 'a\nb', 0, 'a\nb', '');
    stubExecCommand(true);

    applyEmacsTextKey(area, EmacsTextKey.Y, false);

    expect(execCalls.map((c) => [c.command, c.value])).toEqual([['insertText', 'a\nb']]);
  });

  it('d and h leave the deleting to the browser', () => {
    const field = document.createElement('input');
    field.value = 'abc';
    document.body.appendChild(field);
    field.focus();
    field.setSelectionRange(1, 1);
    stubExecCommand(true);

    applyEmacsTextKey(field, EmacsTextKey.D, false);
    applyEmacsTextKey(field, EmacsTextKey.H, false);

    expect(execCalls.map((c) => c.command)).toEqual(['forwardDelete', 'delete']);
    // The fallback did not run on top of the browser's delete.
    expect(field.value).toBe('abc');
  });
});

describe('applyEmacsTextKey in a contentEditable', () => {
  let root: HTMLDivElement;
  let modifyCalls: Array<[string, string, string]>;

  function editable(text: string, start: number, end = start) {
    root = document.createElement('div');
    root.setAttribute('contenteditable', 'plaintext-only');
    root.textContent = text;
    document.body.appendChild(root);
    root.focus();
    setSelectionRange(root, start, end);
    return root;
  }

  beforeEach(() => {
    modifyCalls = [];
    Object.defineProperty(Selection.prototype, 'modify', {
      configurable: true,
      writable: true,
      value: (alter: string, direction: string, granularity: string) => {
        modifyCalls.push([alter, direction, granularity]);
      },
    });
  });

  afterEach(() => {
    if (originalModify) {
      Object.defineProperty(Selection.prototype, 'modify', originalModify);
    } else {
      delete (Selection.prototype as { modify?: Selection['modify'] }).modify;
    }
  });

  it.each([
    [EmacsTextKey.A, 'backward', 'paragraphboundary'],
    [EmacsTextKey.E, 'forward', 'paragraphboundary'],
    [EmacsTextKey.B, 'backward', 'character'],
    [EmacsTextKey.F, 'forward', 'character'],
    [EmacsTextKey.P, 'backward', 'line'],
    [EmacsTextKey.N, 'forward', 'line'],
  ])('Ctrl+%s asks the engine to move %s by %s, extending with Shift', (key, direction, granularity) => {
    editable('hello', 2);
    applyEmacsTextKey(root, key, false);
    applyEmacsTextKey(root, key, true);
    expect(modifyCalls).toEqual([
      ['move', direction, granularity],
      ['extend', direction, granularity],
    ]);
  });

  it('v moves down by the rows that fit, extending with Shift', () => {
    editable('a\nb\nc\nd\ne', 0);
    root.style.lineHeight = '20px';
    layout(root, { clientHeight: 60 });

    applyEmacsTextKey(root, EmacsTextKey.V, false);
    applyEmacsTextKey(root, EmacsTextKey.V, true);

    expect(modifyCalls).toEqual([
      ['move', 'forward', 'line'],
      ['move', 'forward', 'line'],
      ['move', 'forward', 'line'],
      ['extend', 'forward', 'line'],
      ['extend', 'forward', 'line'],
      ['extend', 'forward', 'line'],
    ]);
  });

  it('d and h use the browser delete on the current selection', () => {
    editable('hello', 2);
    stubExecCommand(true, root);

    applyEmacsTextKey(root, EmacsTextKey.D, false);
    applyEmacsTextKey(root, EmacsTextKey.H, false);

    expect(execCalls).toEqual([
      { command: 'forwardDelete', value: undefined, selection: { start: 2, end: 2 } },
      { command: 'delete', value: undefined, selection: { start: 2, end: 2 } },
    ]);
  });

  it('d does nothing when the browser cannot edit', () => {
    editable('hello', 2);
    stubExecCommand(false, root);

    applyEmacsTextKey(root, EmacsTextKey.D, false);

    expect(root.textContent).toBe('hello');
    expect(execCalls.map((c) => c.command)).toEqual(['forwardDelete']);
  });

  it('k selects to the paragraph end, deletes it and keeps it for y', () => {
    editable('first line\nsecond', 6);
    stubExecCommand(true, root);

    applyEmacsTextKey(root, EmacsTextKey.K, false);

    expect(execCalls).toEqual([{ command: 'insertText', value: '', selection: { start: 6, end: 10 } }]);
    expect(killRing.text()).toBe('line');
  });

  it('k keeps nothing when the browser cannot edit', () => {
    editable('first line', 6);
    stubExecCommand(false, root);

    applyEmacsTextKey(root, EmacsTextKey.K, false);

    expect(killRing.text()).toBe('');
    expect(root.textContent).toBe('first line');
  });

  it('y inserts a multi-line kill with insertLineBreak, never a newline inside insertText', () => {
    editable('xy', 1);
    killRing.recordKill({}, 'a\nb', 0, 'a\nb', '');
    stubExecCommand(true, root);

    applyEmacsTextKey(root, EmacsTextKey.Y, false);

    expect(execCalls.map((c) => [c.command, c.value])).toEqual([
      ['insertText', 'a'],
      ['insertLineBreak', undefined],
      ['insertText', 'b'],
    ]);
    expect(execCalls[0]?.selection).toEqual({ start: 1, end: 1 });
  });

  it('o inserts a line break and puts the caret back before it', () => {
    editable('ab', 1);
    stubExecCommand(true, root);

    applyEmacsTextKey(root, EmacsTextKey.O, false);

    expect(execCalls.map((c) => [c.command, c.value])).toEqual([
      ['insertText', ''],
      ['insertLineBreak', undefined],
    ]);
    expect(getSelectionRange(root)).toEqual({ start: 1, end: 1 });
  });

  it('t selects the pair and writes it swapped', () => {
    editable('abcd', 2);
    stubExecCommand(true, root);

    applyEmacsTextKey(root, EmacsTextKey.T, false);

    expect(execCalls).toEqual([{ command: 'insertText', value: 'cb', selection: { start: 1, end: 3 } }]);
  });

  it('l scrolls the scroller so the caret sits in the middle', () => {
    editable('hello', 2);
    root.style.overflowY = 'auto';
    layout(root, { clientHeight: 200, scrollHeight: 1000 });
    root.getBoundingClientRect = () => ({ top: 100, bottom: 300, left: 0, right: 200, width: 200, height: 200, x: 0, y: 100, toJSON: () => ({}) });
    const caretRect = { top: 300, bottom: 320, left: 0, right: 1, width: 1, height: 20, x: 0, y: 300, toJSON: () => ({}) };
    const originalRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
    const getClientRects = vi.fn(() => [caretRect]);
    Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, writable: true, value: getClientRects });
    stubExecCommand(true, root);

    try {
      applyEmacsTextKey(root, EmacsTextKey.L, false);
    } finally {
      if (originalRects) {
        Object.defineProperty(Range.prototype, 'getClientRects', originalRects);
      } else {
        delete (Range.prototype as { getClientRects?: Range['getClientRects'] }).getClientRects;
      }
    }

    // Caret top 200 inside the scroller, middle 210, the view's middle 100.
    expect(getClientRects).toHaveBeenCalled();
    expect(root.scrollTop).toBe(110);
    expect(execCalls).toEqual([]);
  });

  it.each(EDIT_KEYS)('Shift+Ctrl+%s does nothing', (key) => {
    editable('ab\ncd', 2);
    stubExecCommand(true, root);

    applyEmacsTextKey(root, key, true);

    expect(execCalls).toEqual([]);
    expect(modifyCalls).toEqual([]);
    expect(root.textContent).toBe('ab\ncd');
  });

  it('every key is handled without throwing', () => {
    for (const key of ALL_KEYS) {
      editable('ab\ncd', 2);
      stubExecCommand(true, root);
      expect(() => applyEmacsTextKey(root, key, false)).not.toThrow();
      root.remove();
    }
  });
});
