/**
 * What an Up or Down arrow does in the composer: move inside the text, or step through the history (#735).
 *
 * Moving comes first. The history only gets the key once the caret stands at the very start of the text (Up) or at
 * its very end (Down). The step from the first row to the start, and from the last row to the end, is taken here and
 * not left to the browser: Chromium takes it on macOS and Linux and does not on Windows, where the key would then
 * do nothing at all.
 *
 * Rows are the rows on screen, a soft wrap included. Scanning the text for "\n" calls every row of a wrapped
 * paragraph the first one, which handed Up to the history while the reader was still on their way up.
 */
import { CaretDirection } from '@/utils/domSelection';

/** Where the caret stands in the composer. Nothing is "at" an edge while text is selected. */
export interface ComposerCaret {
  collapsed: boolean;
  atStart: boolean;
  atEnd: boolean;
  onFirstRow: boolean;
  onLastRow: boolean;
}

export enum ArrowMove {
  /** The browser moves the caret, or the selection, as it would in any text field. */
  Native = 'native',
  /** Move the caret to the start of the text. */
  ToStart = 'toStart',
  /** Move the caret to the end of the text. */
  ToEnd = 'toEnd',
  /** The caret has nowhere left to go: the key asks for the history. */
  Leave = 'leave',
}

export function historyArrow(direction: CaretDirection, caret: ComposerCaret): ArrowMove {
  if (!caret.collapsed) return ArrowMove.Native;
  if (direction === CaretDirection.Backward) {
    if (caret.atStart) return ArrowMove.Leave;
    return caret.onFirstRow ? ArrowMove.ToStart : ArrowMove.Native;
  }
  if (caret.atEnd) return ArrowMove.Leave;
  return caret.onLastRow ? ArrowMove.ToEnd : ArrowMove.Native;
}

/**
 * How long the text is as a place for the caret. The newline Chromium keeps after a trailing line break, so that the
 * empty row can hold a caret, is not a place one can stand behind.
 */
export function caretLength(root: HTMLElement): number {
  const text = root.textContent ?? '';
  return text.endsWith('\n') ? text.length - 1 : text.length;
}

/** The character offset of a point of the selection, whichever kind of node it names. */
function offsetOf(root: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

/**
 * The offset of the start or the end of the row the caret is on. Asked of the engine that laid the text out, by moving
 * there and putting the selection back. Where there is no `Selection.modify` (the test DOM), rows are the lines the
 * text has.
 */
function rowEdge(root: HTMLElement, selection: Selection, direction: CaretDirection, caret: number): number {
  const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
  if (typeof selection.modify !== 'function' || !anchorNode || !focusNode) {
    const text = root.textContent ?? '';
    if (direction === CaretDirection.Backward) return caret === 0 ? 0 : text.lastIndexOf('\n', caret - 1) + 1;
    const next = text.indexOf('\n', caret);
    return next === -1 ? text.length : next;
  }
  selection.modify('move', direction, 'lineboundary');
  const edge = selection.focusNode ? offsetOf(root, selection.focusNode, selection.focusOffset) : caret;
  selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
  return edge;
}

/**
 * Where the caret is. A selection that is not in the composer counts as a caret in the middle of the text, so that no
 * key is taken for the history on a guess.
 */
export function readCaret(root: HTMLElement): ComposerCaret {
  const nowhere = { collapsed: false, atStart: false, atEnd: false, onFirstRow: false, onLastRow: false };
  const selection = window.getSelection();
  if (!selection?.focusNode || !root.contains(selection.focusNode)) return nowhere;
  if (!selection.isCollapsed) return nowhere;

  const caret = offsetOf(root, selection.focusNode, selection.focusOffset);
  const length = caretLength(root);
  const atStart = caret === 0;
  const atEnd = caret >= length;
  return {
    collapsed: true,
    atStart,
    atEnd,
    onFirstRow: atStart || rowEdge(root, selection, CaretDirection.Backward, caret) === 0,
    onLastRow: atEnd || rowEdge(root, selection, CaretDirection.Forward, caret) >= length,
  };
}
