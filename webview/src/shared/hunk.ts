/**
 * One run of changed lines with its surrounding context — the unit
 * `git add -p` offers, and the unit a reviewer picks by.
 *
 * Shared because both sides read it: the backend splits the change into these
 * and stores them with the pending request, and the review screen draws one
 * accept/reject control per entry.
 *
 * Anything finer (a single line of a paired delete/insert) produces
 * combinations that cannot be written; anything coarser is the whole-file
 * approve that already existed.
 */
export interface Hunk {
  /** Stable identity for the WebView to select by; index in the hunk list. */
  index: number;
  /** 1-based first line of this hunk in the original file. */
  oldStart: number;
  /** Number of original lines this hunk spans. */
  oldLines: number;
  /** 1-based first line of this hunk in the proposed file. */
  newStart: number;
  /** Number of proposed lines this hunk spans. */
  newLines: number;
  /** Unified-diff body: ' ' context, '-' removed, '+' added. */
  lines: string[];
}

/**
 * A region of the proposed file the reviewer chose to keep, in 0-based
 * end-exclusive lines.
 *
 * Ranges rather than hunk numbers, because the surfaces that draw the controls
 * do not agree on where a change divides — the IDE's own diff counted four
 * where our splitter counted two on a real file. A number only means something
 * if both sides share the split; a range carries its own meaning, so whoever
 * draws the controls decides the units.
 */
export interface AcceptedRange {
  /** First proposed line kept, 0-based. */
  newStart: number;
  /** One past the last proposed line kept. */
  newEnd: number;
  /** First original line this replaces, 0-based. */
  oldStart: number;
  /** One past the last original line it replaces. */
  oldEnd: number;
}

/**
 * The first proposed line [hunk] actually changes, 1-based.
 *
 * NOT `newStart`, which is where the hunk begins — three lines of context
 * earlier, as `git diff` writes them. Anchoring a control there puts it beside
 * a line the hunk does not touch, which is what shipped first: the tick sat two
 * rows above the change it decided.
 *
 * Falls back to `newStart` for a hunk that only deletes: it adds no proposed
 * line to point at, so the control goes where those lines used to be.
 */
export function firstChangedLine(hunk: Hunk): number {
  let line = hunk.newStart;
  for (const entry of hunk.lines) {
    if (entry.startsWith('+')) return line;
    // Only context and additions advance the proposed side's line count.
    if (!entry.startsWith('-')) line++;
  }
  return hunk.newStart;
}

/**
 * The last proposed line [hunk] changes, 1-based.
 *
 * Where the decision control goes: at the bottom of the change, so it reads as
 * belonging to the whole block rather than to the line it happens to sit on.
 *
 * Falls back to {@link firstChangedLine} for a hunk that only deletes, which
 * adds no proposed line to anchor to.
 */
export function lastChangedLine(hunk: Hunk): number {
  let line = hunk.newStart;
  let last: number | undefined;
  for (const entry of hunk.lines) {
    if (entry.startsWith('+')) last = line;
    // Only context and additions advance the proposed side's line count.
    if (!entry.startsWith('-')) line++;
  }
  return last ?? firstChangedLine(hunk);
}

/**
 * The region [hunk] covers, as an {@link AcceptedRange}.
 *
 * Bridges the two coordinate systems in one place: a hunk counts from 1 and
 * carries a length, a range counts from 0 and ends one past its last line.
 * Doing this at each call site is how an off-by-one gets written to a file.
 */
export function hunkToAcceptedRange(hunk: Hunk): AcceptedRange {
  return {
    oldStart: hunk.oldStart - 1,
    oldEnd: hunk.oldStart - 1 + hunk.oldLines,
    newStart: hunk.newStart - 1,
    newEnd: hunk.newStart - 1 + hunk.newLines,
  };
}
