import { Fragment, type ReactNode } from 'react';
import { markHunk, type MarkedLine } from '../diffMarks';

/** The lines of a text; a trailing newline ends the last line, it does not start one more. */
function linesOf(text: string): string[] {
  const lines = text.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** One line of text with its marked words on a chip. An empty line keeps its height with a zero-width space. */
function Line({ line, chip }: { line: MarkedLine; chip: string }): ReactNode {
  if (line.tokens.length === 0) return '​';
  return line.tokens.map((token, index) =>
    line.marks[index] ? (
      <span key={index} data-testid="permission-diff-chip" className={`rounded-[0.1875rem] px-[0.125rem] ${chip}`}>
        {token}
      </span>
    ) : (
      <Fragment key={index}>{token}</Fragment>
    ),
  );
}

// The bar at the start of a row: hatched pink for a removed line, solid green for an added one (from the desktop app's frames).
const BAR = "relative before:absolute before:inset-y-0 before:start-0 before:w-[0.4375rem] before:content-['']";
const REMOVED_ROW = `${BAR} bg-[rgb(44,28,30)] before:[background:repeating-linear-gradient(135deg,rgb(206,97,118)_0_2px,rgb(94,1,20)_2px_4px)]`;
const ADDED_ROW = `${BAR} bg-[rgb(37,56,38)] before:bg-[rgb(55,169,68)]`;

interface Props {
  /** What the text was, for an edit. Left out for a new file, which has only what is written. */
  before?: string;
  after: string;
}

/**
 * The change a file edit or a new file would make, drawn inside the permission card the way the desktop app
 * draws it: the removed lines in red with a hatched bar, the added lines in green with a solid bar, the changed
 * words on a chip. A new file has no removed lines and numbers its lines instead.
 */
export function PermissionDiffBlock({ before, after }: Props) {
  const isNewFile = before === undefined;
  const removedText = isNewFile ? [] : linesOf(before);
  const addedText = linesOf(after);
  const hunk = markHunk(removedText, isNewFile ? [] : addedText);
  // A new file has no partner for any line, so no chip: its lines are all plain.
  const addedLines: MarkedLine[] = isNewFile
    ? addedText.map((text) => ({ tokens: text === '' ? [] : [text], marks: [false] }))
    : hunk.added;

  return (
    <div
      data-testid="permission-diff"
      dir="ltr"
      // px here are before the page's 0.9 zoom: 21.1 is the desktop app's 19px row, 6.67 its 6px, 16.7 its 15px.
      className="mt-[1.0437rem] overflow-hidden rounded-[0.25rem] border border-text-primary/[0.04] py-[0.4169rem] font-mono text-[0.8461rem] leading-[1.3188rem] text-text-primary"
    >
      {hunk.removed.map((line, row) => (
        <div key={`r${row}`} data-testid="permission-diff-removed" className={`whitespace-pre-wrap break-words ps-[1.0625rem] ${REMOVED_ROW}`}>
          <Line line={line} chip="bg-[rgb(96,26,44)]" />
        </div>
      ))}
      {addedLines.map((line, row) => (
        <div key={`a${row}`} data-testid="permission-diff-added" className={`flex whitespace-pre-wrap break-words ps-[0.4375rem] ${ADDED_ROW}`}>
          {isNewFile && <span className="w-[3.5rem] shrink-0 select-none text-end text-text-secondary">{row + 1}</span>}
          <span className={isNewFile ? 'ps-[0.5625rem]' : 'ps-[0.625rem]'}>
            <Line line={line} chip="bg-[rgb(44,84,44)]" />
          </span>
        </div>
      ))}
    </div>
  );
}
