/**
 * Telling a declined hunk from a rewritten one (#359).
 *
 * Both leave the applied text differing from what the model proposed, and the
 * diff between the two reads the same either way. They mean opposite things,
 * though: a decline says the reviewer wants the file left as it was, while a
 * rewrite says they want something else written. Told only "the user edited
 * this", the assistant reads a declined hunk as work that went missing and
 * proposes it again, which makes the reviewer refuse the same change twice.
 *
 * The signal is what the applied text KEPT. A declined hunk leaves the original
 * lines untouched, so those lines are still in the result. A rewritten one puts
 * the reviewer's own text there instead.
 */
import type { StoredPreview } from './diffPreview';
import type { AcceptedRange } from './hunks';

/**
 * Whether the reviewer left any proposed change out by NOT accepting it.
 *
 * The applied text alone cannot answer this. A line the reviewer declined and a
 * line they typed back to its original value come out identical, and they mean
 * opposite things — measured: a reviewer edited one constant and left another
 * at the value it already had, and reading the result alone called that a
 * decline.
 *
 * The accepted ranges are what separates them. Declining removes a region from
 * that list; typing does not. So a proposed change whose lines no accepted
 * range covers is one the reviewer turned down.
 *
 * Line-based because the ranges are lines. Counting hunks against the ranges
 * does not work: the backend and the IDE split a change differently, so the two
 * counts are not comparable.
 */
export function declinedAnything(
  preview: Pick<StoredPreview, 'oldContent' | 'newContent'>,
  accepted: readonly AcceptedRange[],
  /**
   * The proposed side as the reviewer left it, when they typed in it (#305).
   *
   * Present means they rewrote the proposal, and the answer is their text
   * rather than a selection of hunks — so the ranges no longer describe what
   * happened. They name hunks of a proposal that has since been replaced.
   * Measured: a reviewer applied all three hunks and retyped two of them, and
   * judging by ranges alone reported that as a decline.
   */
  edited?: string,
): boolean {
  if (edited !== undefined) return false;

  const original = splitLines(preview.oldContent);
  const proposed = splitLines(preview.newContent);

  // A proposal that added or removed lines shifts everything after it, so line
  // numbers on the two sides no longer name the same place. Falling back to
  // "not a decline" keeps the wording that was there before this existed, which
  // is wrong only in the direction that says less rather than more.
  if (proposed.length !== original.length) return false;

  for (let i = 0; i < original.length; i++) {
    if (proposed[i] === original[i]) continue;
    if (!coveredBy(accepted, i)) return true;
  }
  return false;
}

/** Whether any accepted range spans [line], counted on the proposed side. */
function coveredBy(accepted: readonly AcceptedRange[], line: number): boolean {
  return accepted.some((range) => line >= range.newStart && line < range.newEnd);
}

/**
 * Split without the phantom last line a trailing newline would otherwise add,
 * so line N here is line N in the file.
 */
function splitLines(text: string): string[] {
  if (text === '') return [];
  return (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n');
}
