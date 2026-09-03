import { getSelectionRange } from '@/utils/domSelection';

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
