/**
 * Split a proposed file change into hunks and rebuild it from the ones the
 * user kept — the "accept 8 of these 10 edits" ask in issue #109.
 *
 * A hunk here is a run of changed lines with its surrounding context, the same
 * unit `git add -p` offers. Anything finer (a single line of a paired
 * delete/insert) produces combinations that cannot be written; anything
 * coarser is the whole-file approve we already had.
 *
 * Implemented in plain TypeScript rather than pulling in a diff library: the
 * backend ships two runtime dependencies today, and the algorithm we need —
 * a line LCS plus grouping — is small enough that a dependency would cost more
 * than it saves.
 */

/** How many unchanged lines to keep either side of a change, as `git diff` does. */
const CONTEXT_LINES = 3;

// Defined in shared/ because the review screen reads the same entries this
// module produces. Imported for use below and re-exported so the callers that
// already reach for them here are unchanged.
import type { Hunk, AcceptedRange } from '../../shared';

export type { Hunk, AcceptedRange };

type Op = { type: 'equal' | 'delete' | 'insert'; line: string };

/**
 * Longest-common-subsequence diff over whole lines.
 *
 * Quadratic in the number of lines, which is fine for the file sizes a single
 * tool call touches; [bail] caps it so a generated megabyte-long file cannot
 * stall the permission prompt.
 */
function diffLines(oldLines: string[], newLines: string[], bail = 4_000_000): Op[] | null {
  const n = oldLines.length;
  const m = newLines.length;
  if ((n + 1) * (m + 1) > bail) return null;

  // lcs[i][j] = length of the LCS of oldLines[i:] and newLines[j:]
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = oldLines[i] === newLines[j]
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ type: 'equal', line: oldLines[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      ops.push({ type: 'delete', line: oldLines[i] });
      i++;
    } else {
      ops.push({ type: 'insert', line: newLines[j] });
      j++;
    }
  }
  while (i < n) ops.push({ type: 'delete', line: oldLines[i++] });
  while (j < m) ops.push({ type: 'insert', line: newLines[j++] });
  return ops;
}

/**
 * Split text into lines, remembering whether it ended with a newline so the
 * rebuild can restore the file exactly. A trailing newline would otherwise
 * come back as a phantom empty last line.
 */
function splitLines(text: string): { lines: string[]; trailingNewline: boolean } {
  if (text === '') return { lines: [], trailingNewline: false };
  const trailingNewline = text.endsWith('\n');
  const body = trailingNewline ? text.slice(0, -1) : text;
  return { lines: body.split('\n'), trailingNewline };
}

function joinLines(lines: string[], trailingNewline: boolean): string {
  if (lines.length === 0) return '';
  return lines.join('\n') + (trailingNewline ? '\n' : '');
}

/**
 * The hunks between [oldContent] and [newContent].
 *
 * Returns an empty list when the two are identical, and null when the diff was
 * too large to compute — callers treat null as "offer whole-file approval
 * only" rather than showing a partial or wrong split.
 */
export function computeHunks(oldContent: string, newContent: string): Hunk[] | null {
  const oldSide = splitLines(oldContent);
  const newSide = splitLines(newContent);
  const ops = diffLines(oldSide.lines, newSide.lines);
  if (ops === null) return null;

  const hunks: Hunk[] = [];
  let oldLineNo = 1;
  let newLineNo = 1;
  let cursor = 0;

  while (cursor < ops.length) {
    if (ops[cursor].type === 'equal') {
      oldLineNo++;
      newLineNo++;
      cursor++;
      continue;
    }

    // Walk back over the context that precedes this change.
    let start = cursor;
    let leading = 0;
    while (start > 0 && ops[start - 1].type === 'equal' && leading < CONTEXT_LINES) {
      start--;
      leading++;
    }

    // Extend through the change, absorbing short runs of context that sit
    // between two changes — splitting there would offer the user two hunks
    // they could only sensibly accept together.
    let end = cursor;
    let trailingRun = 0;
    while (end < ops.length) {
      if (ops[end].type === 'equal') {
        trailingRun++;
        if (trailingRun > CONTEXT_LINES * 2) break;
      } else {
        trailingRun = 0;
      }
      end++;
    }
    // Drop context beyond the allowance from the tail of the hunk.
    let tail = end;
    let kept = 0;
    while (tail > cursor && ops[tail - 1].type === 'equal') {
      if (kept >= CONTEXT_LINES) tail--;
      else { kept++; tail--; }
    }
    end = Math.max(cursor + 1, tail + kept);

    const slice = ops.slice(start, end);
    const oldStart = oldLineNo - leading;
    const newStart = newLineNo - leading;
    let oldCount = 0;
    let newCount = 0;
    const lines: string[] = [];
    for (const op of slice) {
      if (op.type === 'equal') {
        lines.push(' ' + op.line);
        oldCount++;
        newCount++;
      } else if (op.type === 'delete') {
        lines.push('-' + op.line);
        oldCount++;
      } else {
        lines.push('+' + op.line);
        newCount++;
      }
    }

    hunks.push({
      index: hunks.length,
      oldStart: Math.max(1, oldStart),
      oldLines: oldCount,
      newStart: Math.max(1, newStart),
      newLines: newCount,
      lines,
    });

    // Advance the line counters past everything this hunk consumed.
    for (let k = cursor; k < end; k++) {
      if (ops[k].type !== 'insert') oldLineNo++;
      if (ops[k].type !== 'delete') newLineNo++;
    }
    cursor = end;
  }

  return hunks;
}

/**
 * Rebuild the file with only [acceptedIndices] applied, leaving every other
 * hunk as it was in [oldContent].
 *
 * Accepting all of them reproduces the full proposal; accepting none
 * reproduces the original exactly, trailing newline and all.
 */
export function applySelectedHunks(
  oldContent: string,
  newContent: string,
  acceptedIndices: readonly number[],
): string | null {
  const oldSide = splitLines(oldContent);
  const newSide = splitLines(newContent);
  const ops = diffLines(oldSide.lines, newSide.lines);
  if (ops === null) return null;

  const hunks = computeHunks(oldContent, newContent);
  if (hunks === null) return null;

  const accepted = new Set(acceptedIndices);

  // Which hunk owns each original line, so a changed op can be traced back to
  // the choice the user made about it. Insertions carry no original line of
  // their own, so they take the hunk spanning the position they sit at.
  const ownerByOldLine = new Map<number, number>();
  for (const hunk of hunks) {
    for (let line = hunk.oldStart; line <= hunk.oldStart + hunk.oldLines; line++) {
      if (!ownerByOldLine.has(line)) ownerByOldLine.set(line, hunk.index);
    }
  }

  const result: string[] = [];
  let oldLineNo = 1;

  for (const op of ops) {
    const owner = ownerByOldLine.get(oldLineNo);
    const keep = owner !== undefined && accepted.has(owner);

    if (op.type === 'equal') {
      result.push(op.line);
      oldLineNo++;
    } else if (op.type === 'delete') {
      // Rejecting the hunk means the original line stays.
      if (!keep) result.push(op.line);
      oldLineNo++;
    } else if (keep) {
      result.push(op.line);
    }
  }

  // The trailing newline follows whichever side supplied the last line.
  const trailing = accepted.size === 0 ? oldSide.trailingNewline : newSide.trailingNewline;
  return joinLines(result, trailing);
}

/**
 * Rebuild the file keeping only [accepted], with every other region left as it
 * is in [oldContent].
 *
 * Ranges must not overlap and must be in ascending order, which is what the
 * IDE's own change list gives. See {@link AcceptedRange} for why the unit is a
 * range rather than a hunk number.
 */
export function applyAcceptedRanges(
  oldContent: string,
  newContent: string,
  accepted: readonly AcceptedRange[],
): string | null {
  const oldSide = splitLines(oldContent);
  const newSide = splitLines(newContent);

  const sorted = [...accepted].sort((a, b) => a.oldStart - b.oldStart);
  const result: string[] = [];
  let oldCursor = 0;

  for (const range of sorted) {
    if (range.oldStart < oldCursor) return null; // overlapping — refuse to guess
    if (range.oldStart > oldSide.lines.length) return null;
    if (range.newStart > newSide.lines.length) return null;

    // Everything before this accepted region stays as it is on disk.
    result.push(...oldSide.lines.slice(oldCursor, range.oldStart));
    // The region itself takes the proposed lines.
    result.push(...newSide.lines.slice(range.newStart, range.newEnd));
    oldCursor = range.oldEnd;
  }

  result.push(...oldSide.lines.slice(oldCursor));

  // The trailing newline follows the proposal only when the last line came
  // from it; otherwise the original decides.
  const lastRange = sorted[sorted.length - 1];
  const endsWithProposal = lastRange !== undefined && lastRange.oldEnd >= oldSide.lines.length;
  const trailing = endsWithProposal ? newSide.trailingNewline : oldSide.trailingNewline;
  return joinLines(result, trailing);
}
