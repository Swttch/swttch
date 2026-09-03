import { getSelectionRange, CaretDirection } from '@/utils/domSelection';

/**
 * Whether the caret has nowhere left to go in a direction, which is what makes an
 * arrow key free to mean something other than "move".
 *
 * The composer decides this by asking where the caret is, not by scanning the
 * text for "\n". The two disagree exactly where it matters: a soft-wrapped prompt
 * is a single run of text with no newline in it, so a scan calls every visual row
 * "the first line" and hands Up to the history while the user is still reading
 * their way up a paragraph. `moveCaretToBoundary` in utils/domSelection carries
 * the same warning, for the same reason, about the same mistake.
 *
 * "Nowhere left to go" is the *character* edge, not the row edge: from the top
 * row, Up still has one move left in it — to the very first character — and only
 * the press after that, which the composer would not act on at all, belongs to
 * the history. Down mirrors it at the last character.
 *
 * A range that is not collapsed is a selection, and an arrow key collapses it
 * rather than navigating anywhere, so neither edge counts as reached.
 */
export function caretIsAtStart(root: HTMLElement): boolean {
  const { start, end } = getSelectionRange(root);
  return start === 0 && end === 0;
}

export function caretIsAtEnd(root: HTMLElement): boolean {
  const length = (root.textContent ?? '').length;
  const { start, end } = getSelectionRange(root);
  return start === length && end === length;
}

/**
 * Whether an arrow key press is the composer asking for a prompt out of the
 * history, rather than asking to move.
 *
 * Two things have to hold, and the caret is only the second of them.
 *
 * **Shift means select, never recall.** In every text field there is, holding
 * Shift turns an arrow into a selection gesture, so the history has no claim on
 * the key at all. Leaving this out does not merely lose a selection — the recall
 * replaces what is in the composer, so pressing Shift+Up to start selecting a
 * prompt threw the prompt away instead ([#396](https://github.com/Swttch/swttch/issues/396)).
 *
 * The caret test alone hid this: from the middle of a line the selection grows
 * and stays non-collapsed, so nothing fires and Shift looks safe. It only bites
 * where the caret already sits on the edge with nothing selected — which is
 * exactly where a recalled prompt lands, so it bit while walking the history.
 */
export function arrowRecallsHistory(
  event: { shiftKey: boolean },
  root: HTMLElement,
  direction: CaretDirection,
): boolean {
  if (event.shiftKey) return false;
  return direction === CaretDirection.Backward ? caretIsAtStart(root) : caretIsAtEnd(root);
}
