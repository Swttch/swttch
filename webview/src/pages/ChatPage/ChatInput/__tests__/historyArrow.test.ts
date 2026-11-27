import { describe, it, expect, afterEach } from 'vitest';
import { ArrowMove, caretLength, historyArrow, readCaret, type ComposerCaret } from '../historyArrow';
import { CaretDirection } from '@/utils/domSelection';

const middle: ComposerCaret = { collapsed: true, atStart: false, atEnd: false, onFirstRow: false, onLastRow: false };
const up = (caret: Partial<ComposerCaret>) => historyArrow(CaretDirection.Backward, { ...middle, ...caret });
const down = (caret: Partial<ComposerCaret>) => historyArrow(CaretDirection.Forward, { ...middle, ...caret });

describe('historyArrow', () => {
  it('moves inside the text while there are rows left', () => {
    expect(up({})).toBe(ArrowMove.Native);
    expect(down({})).toBe(ArrowMove.Native);
  });

  it('goes to the start from the first row, and to the end from the last, before anything else', () => {
    expect(up({ onFirstRow: true })).toBe(ArrowMove.ToStart);
    expect(down({ onLastRow: true })).toBe(ArrowMove.ToEnd);
  });

  it('asks for the history only from the very start or the very end', () => {
    expect(up({ atStart: true, onFirstRow: true })).toBe(ArrowMove.Leave);
    expect(down({ atEnd: true, onLastRow: true })).toBe(ArrowMove.Leave);
    // The far edge is not the one this arrow leaves from.
    expect(up({ atEnd: true, onLastRow: true })).toBe(ArrowMove.Native);
    expect(down({ atStart: true, onFirstRow: true })).toBe(ArrowMove.Native);
  });

  it('leaves a selection to the browser', () => {
    // An arrow collapses a selection; it never recalls over the selected text (#396).
    expect(up({ collapsed: false, atStart: true })).toBe(ArrowMove.Native);
    expect(down({ collapsed: false, atEnd: true })).toBe(ArrowMove.Native);
  });
});

describe('readCaret', () => {
  let root: HTMLElement;

  function mount(...nodes: string[]): HTMLElement {
    root = document.createElement('div');
    root.contentEditable = 'plaintext-only';
    for (const text of nodes) root.appendChild(document.createTextNode(text));
    document.body.appendChild(root);
    return root;
  }
  function select(node: Node, from: number, to: number = from) {
    const range = document.createRange();
    range.setStart(node, from);
    range.setEnd(node, to);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
  }

  afterEach(() => {
    root?.remove();
    window.getSelection()?.removeAllRanges();
  });

  it('reads the edges and rows of a text with line breaks, across its nodes', () => {
    mount('first', '\n', 'second', '\n', 'third');

    select(root.childNodes[2], 3);
    expect(readCaret(root)).toMatchObject({ atStart: false, atEnd: false, onFirstRow: false, onLastRow: false });
    select(root.childNodes[0], 2);
    expect(readCaret(root)).toMatchObject({ atStart: false, onFirstRow: true, onLastRow: false });
    select(root.childNodes[4], 5);
    expect(readCaret(root)).toMatchObject({ atEnd: true, onLastRow: true, onFirstRow: false });
    select(root.childNodes[0], 0);
    expect(readCaret(root)).toMatchObject({ atStart: true, onFirstRow: true });
  });

  it('reads a point named by a child of the box, not only by a text node', () => {
    // The browser may name the caret as (box, child index). Read as offset 0, it would hand Up to the history from
    // the middle of the text.
    mount('first', '\n', 'second');

    select(root, 2);
    expect(readCaret(root)).toMatchObject({ atStart: false, onFirstRow: false });
  });

  it('counts the end before the newline kept for an empty last row', () => {
    mount('text', '\n');

    expect(caretLength(root)).toBe(4);
    select(root.childNodes[0], 4);
    expect(readCaret(root).atEnd).toBe(true);
  });

  it('takes both edges of an empty box', () => {
    mount();

    select(root, 0);
    expect(readCaret(root)).toMatchObject({ atStart: true, atEnd: true });
  });

  it('claims no edge for a selection, or for a caret outside the box', () => {
    mount('hello');
    select(root.childNodes[0], 0, 5);
    expect(readCaret(root).collapsed).toBe(false);

    window.getSelection()!.removeAllRanges();
    expect(readCaret(root)).toMatchObject({ collapsed: false, atStart: false, atEnd: false });
  });
});
