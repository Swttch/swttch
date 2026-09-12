import { setSelectionRange } from '@/utils/domSelection';

/**
 * Replace the text between two plain-text offsets of a focused contentEditable
 * with `text`, going through the browser's own editing pipeline so the edit is
 * recorded in its undo history.
 *
 * Why not just write the new string through React state (issue #286): a
 * contentEditable only records an undo entry when the browser itself performs
 * the edit. Assigning `textContent`, or re-rendering the editor from a new
 * `value`, changes what the user sees but leaves the browser's history
 * untouched, so Ctrl/Cmd+Z has nothing to undo. Worse, replacing the whole node
 * this way invalidates the entries already there, which is why an autocomplete
 * insert could strip undo from text typed before it.
 *
 * Selecting the span first and then inserting is what makes this one atomic
 * edit: the browser records "this range became that text", so a single undo
 * restores exactly the state before the insert, with surrounding text intact.
 *
 * Returns whether the browser performed the edit. `false` means the caller must
 * report the resulting value itself, because no native `input` event will
 * follow (execCommand is unavailable in jsdom, and can be disabled elsewhere).
 *
 * Assumes `root` is focused; offsets are relative to `root.textContent`.
 */
export function replaceRangeWithText(
  root: HTMLElement,
  start: number,
  end: number,
  text: string,
): boolean {
  setSelectionRange(root, start, end);

  // A `\n` inside `insertText` is NOT a line break to Chromium: it wraps the
  // remainder in a `<div>` instead. The composer reads its value from
  // `textContent`, where that `<div>` contributes no newline at all — so the
  // screen showed two lines while the value had the sentences run together
  // (issue #430). Measured in a `plaintext-only` editable: inserting
  // "a\nb" yields `a<div>b</div>` and a textContent of "ab".
  //
  // Alternating insertText with insertLineBreak — the same command
  // insertNewlineAtCursor uses for a single Enter — produces real `\n`
  // characters and no wrapper, and keeps every step inside the browser's
  // editing pipeline so the undo history above still holds.
  const lines = text.split('\n');

  try {
    // The first segment also deletes the selected range, including when it is
    // empty (measured: insertText with "" returns true and clears the range).
    if (!document.execCommand('insertText', false, lines[0] ?? '')) return false;

    for (let index = 1; index < lines.length; index++) {
      if (!document.execCommand('insertLineBreak')) return false;
      const line = lines[index] as string;
      if (line !== '' && !document.execCommand('insertText', false, line)) return false;
    }
    return true;
  } catch {
    return false;
  }
}
