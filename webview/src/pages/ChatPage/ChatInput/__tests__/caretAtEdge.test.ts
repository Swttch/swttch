import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { caretIsAtStart, caretIsAtEnd } from '../caretAtEdge';

let root: HTMLElement;

function mount(text: string): HTMLElement {
  const el = document.createElement('div');
  el.contentEditable = 'plaintext-only';
  el.textContent = text;
  document.body.appendChild(el);
  return el;
}

function putCaret(el: HTMLElement, offset: number): void {
  const node = el.firstChild ?? el;
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function select(el: HTMLElement, start: number, end: number): void {
  const node = el.firstChild ?? el;
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

afterEach(() => {
  root?.remove();
  window.getSelection()?.removeAllRanges();
});

describe('caretIsAtStart / caretIsAtEnd', () => {
  beforeEach(() => {
    root = mount('hello world');
  });

  it('reports the character edges, not the row edges', () => {
    putCaret(root, 0);
    expect(caretIsAtStart(root)).toBe(true);
    expect(caretIsAtEnd(root)).toBe(false);

    putCaret(root, 'hello world'.length);
    expect(caretIsAtStart(root)).toBe(false);
    expect(caretIsAtEnd(root)).toBe(true);
  });

  it('reports neither edge from the middle', () => {
    putCaret(root, 5);
    expect(caretIsAtStart(root)).toBe(false);
    expect(caretIsAtEnd(root)).toBe(false);
  });

  it('reports both edges for an empty composer', () => {
    root.remove();
    root = mount('');
    putCaret(root, 0);
    expect(caretIsAtStart(root)).toBe(true);
    expect(caretIsAtEnd(root)).toBe(true);
  });

  it('reports neither edge while text is selected', () => {
    // An arrow key collapses a selection rather than navigating, so a range that
    // merely touches an edge has not reached it.
    select(root, 0, 5);
    expect(caretIsAtStart(root)).toBe(false);

    select(root, 5, 'hello world'.length);
    expect(caretIsAtEnd(root)).toBe(false);
  });
});

describe('a prompt that only wraps', () => {
  // The defect this replaced: the old guard scanned for "\n" and so treated a
  // soft-wrapped paragraph — one run of text, no newline anywhere in it — as
  // being entirely on "the first line", handing Up to the history while the
  // caret sat in the middle of the third visual row.
  const wrapped = 'Use the Write tool to add the single line comment "// reviewed" as the very first line of src/cart.js, and then do the same for src/inventory.js. Change nothing else.';

  beforeEach(() => {
    root = mount(wrapped);
  });

  it('does not count a mid-paragraph caret as the start', () => {
    // Roughly where the screenshot's caret sat: just after "of src/cart.js, ".
    putCaret(root, wrapped.indexOf('and then'));
    expect(caretIsAtStart(root)).toBe(false);
    expect(caretIsAtEnd(root)).toBe(false);
  });

  it('counts the first and last characters, and nothing else', () => {
    putCaret(root, 0);
    expect(caretIsAtStart(root)).toBe(true);

    putCaret(root, 1);
    expect(caretIsAtStart(root)).toBe(false);

    putCaret(root, wrapped.length - 1);
    expect(caretIsAtEnd(root)).toBe(false);

    putCaret(root, wrapped.length);
    expect(caretIsAtEnd(root)).toBe(true);
  });

  it('has no newline to scan for, which is why scanning failed', () => {
    expect(wrapped.includes('\n')).toBe(false);
  });
});

describe('a prompt with real line breaks', () => {
  const hard = 'first line\nsecond line\nthird line';

  beforeEach(() => {
    root = mount(hard);
  });

  it('still requires the caret to reach the text edges', () => {
    // Start of the second line: an edge of a line, but not of the text, so Up
    // belongs to the composer.
    putCaret(root, hard.indexOf('second'));
    expect(caretIsAtStart(root)).toBe(false);

    // End of the second line, likewise.
    putCaret(root, hard.indexOf('\nthird'));
    expect(caretIsAtEnd(root)).toBe(false);

    putCaret(root, 0);
    expect(caretIsAtStart(root)).toBe(true);
    putCaret(root, hard.length);
    expect(caretIsAtEnd(root)).toBe(true);
  });
});
