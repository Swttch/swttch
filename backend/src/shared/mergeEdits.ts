/**
 * Carry the reviewer's typing across a rebuilt proposal (#359).
 *
 * When the file moves on disk and the review is refreshed, the backend restates
 * the proposal against current content. That is a change to the ORIGINAL side.
 * Anything the reviewer typed lives on the PROPOSED side. They are different
 * axes, so unless they land on the same line there is no reason to lose one to
 * save the other — dropping the typing wholesale was measured in QA: an edit
 * from `CLAUDE` to `CLAUDE22` vanished on Refresh with nothing said about it.
 *
 * Merged per line, three ways:
 *
 *  - the reviewer did not touch it  → the new proposal wins
 *  - only the reviewer changed it   → their text wins
 *  - both changed it                → a conflict; the caller is told and the
 *                                     new proposal wins, because it is the one
 *                                     stated against content that exists
 *
 * Line-based rather than character-based on purpose. A line is the unit the
 * review already speaks in — hunks, ranges and the editor's own change events
 * are all lines — and a finer merge would invent resolutions no one can check
 * against what is on screen.
 */

export interface MergedEdits {
  /** The proposed side to seed the refreshed review with. */
  contents: string;
  /** 1-based lines where both sides changed, so the reviewer's text was dropped. */
  conflicts: number[];
  /** Whether any of the reviewer's typing survived into [contents]. */
  carried: boolean;
}

/**
 * Merge [edited] onto [nextProposal], using [previousProposal] as the base that
 * says which side changed what.
 *
 * All three are the PROPOSED side at different moments: what Claude first
 * proposed, what the reviewer made of it, and what Claude proposes now that the
 * file has moved.
 */
export function mergeEdits(
  previousProposal: string,
  edited: string,
  nextProposal: string,
): MergedEdits {
  // Nothing was typed, so there is nothing to carry and no conflict to report.
  if (edited === previousProposal) {
    return { contents: nextProposal, conflicts: [], carried: false };
  }

  const before = splitLines(previousProposal);
  const mine = splitLines(edited);
  const next = splitLines(nextProposal);

  /*
   * A merge only makes sense while the lines still correspond.
   *
   * Typing that adds or removes lines shifts every line after it, and so does a
   * rebuilt proposal; with both shifted there is no honest way to say which of
   * my line 40 matches which of its line 40. Rather than guess, the new
   * proposal is taken whole and the whole edit is reported as conflicting, so
   * the reviewer is told rather than quietly overruled.
   */
  if (mine.length !== before.length || next.length !== before.length) {
    return {
      contents: nextProposal,
      conflicts: changedLines(before, mine),
      carried: false,
    };
  }

  const merged: string[] = [];
  const conflicts: number[] = [];
  let carried = false;

  for (let i = 0; i < before.length; i++) {
    const base = before[i];
    const typed = mine[i];
    const proposed = next[i];

    const iChangedIt = typed !== base;
    const itChangedToo = proposed !== base;

    if (iChangedIt && itChangedToo && typed !== proposed) {
      // Both sides rewrote this line differently. The new proposal wins because
      // it is the one stated against content that actually exists, and the
      // reviewer is told which line they lost.
      merged.push(proposed);
      conflicts.push(i + 1);
      continue;
    }

    if (iChangedIt) {
      merged.push(typed);
      carried = true;
      continue;
    }

    merged.push(proposed);
  }

  return {
    contents: joinLines(merged, previousProposal.endsWith('\n')),
    conflicts,
    carried,
  };
}

/** 1-based line numbers where [b] differs from [a], for reporting a loss. */
function changedLines(a: readonly string[], b: readonly string[]): number[] {
  const lines: number[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) lines.push(i + 1);
  }
  return lines;
}

/**
 * Split without the phantom last line a trailing newline would otherwise add,
 * so line N here is line N on screen.
 */
function splitLines(text: string): string[] {
  if (text === '') return [];
  return (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n');
}

function joinLines(lines: readonly string[], trailingNewline: boolean): string {
  if (lines.length === 0) return '';
  return lines.join('\n') + (trailingNewline ? '\n' : '');
}
