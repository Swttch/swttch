import { Fragment, type ReactNode } from 'react';

/** Past this many words on either side the changed words are not marked: finding them would cost more than showing them is worth. */
const MAX_MARKED_WORDS = 600;

/**
 * Splits a text into words, runs of spaces, and single newlines, keeping all of them so the text can be put back
 * together. A newline is a token of its own, so the spaces that indent the next line stay with that line.
 */
function tokenize(text: string): string[] {
  return text.split(/(\n|[^\S\n]+)/).filter((part) => part !== '');
}

/**
 * Which words of `before` and of `after` are not part of the longest run of words the two share, and so get the
 * chip behind them (the way the desktop app marks "l1" in "l1 -> L1" and leaves the "l2" next to it alone).
 */
function markedWords(before: string[], after: string[]): { before: boolean[]; after: boolean[] } {
  const wordsBefore = before.filter((token) => !/^\s+$/.test(token)).length;
  const wordsAfter = after.filter((token) => !/^\s+$/.test(token)).length;
  const keep = (tokens: string[]) => tokens.map((token) => !/^\s+$/.test(token));
  if (wordsBefore > MAX_MARKED_WORDS || wordsAfter > MAX_MARKED_WORDS) {
    return { before: keep(before), after: keep(after) };
  }
  const rows = before.length;
  const cols = after.length;
  // Longest common subsequence table, filled from the end so the walk below runs forwards.
  const table: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(cols + 1).fill(0));
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      table[i][j] = before[i] === after[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const marksBefore = keep(before);
  const marksAfter = keep(after);
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (before[i] === after[j]) {
      marksBefore[i] = false;
      marksAfter[j] = false;
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return { before: marksBefore, after: marksAfter };
}

/** One line of text with the marked words put on a chip. `marks` runs over the tokens of the whole text. */
function Line({ tokens, marks, from, to, chip }: { tokens: string[]; marks: boolean[]; from: number; to: number; chip: string }): ReactNode {
  const parts: ReactNode[] = [];
  for (let index = from; index < to; index++) {
    const token = tokens[index];
    parts.push(
      marks[index] ? (
        <span key={index} className={`rounded-[3px] px-[2px] ${chip}`}>
          {token}
        </span>
      ) : (
        <Fragment key={index}>{token}</Fragment>
      ),
    );
  }
  return parts;
}

/** Cuts a token list into lines: the index ranges between the newline tokens. */
function lineRanges(tokens: string[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let start = 0;
  tokens.forEach((token, index) => {
    if (token === '\n') {
      ranges.push([start, index]);
      start = index + 1;
    }
  });
  ranges.push([start, tokens.length]);
  return ranges;
}

// The bar at the start of a row: hatched pink for a removed line, solid green for an added one (7px, from the desktop app's frames).
const BAR = "relative before:absolute before:inset-y-0 before:start-0 before:w-[7px] before:content-['']";
const REMOVED_ROW = `${BAR} bg-[rgb(38,26,26)] before:[background:repeating-linear-gradient(135deg,rgb(206,97,118)_0_2px,rgb(94,1,20)_2px_4px)]`;
const ADDED_ROW = `${BAR} bg-[rgb(34,53,33)] before:bg-[rgb(57,180,63)]`;

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
  const tokensAfter = tokenize(after);
  const tokensBefore = isNewFile ? [] : tokenize(before);
  const marks = markedWords(tokensBefore, tokensAfter);
  const rangesAfter = lineRanges(tokensAfter);
  const rangesBefore = isNewFile ? [] : lineRanges(tokensBefore);
  // A trailing newline ends the last line; it does not start one more.
  const trimEnd = (ranges: Array<[number, number]>, tokens: string[]) =>
    ranges.length > 1 && ranges[ranges.length - 1][0] >= tokens.length ? ranges.slice(0, -1) : ranges;
  const addedLines = trimEnd(rangesAfter, tokensAfter);
  const removedLines = trimEnd(rangesBefore, tokensBefore);

  return (
    <div
      data-testid="permission-diff"
      dir="ltr"
      // px here are before the page's 0.9 zoom: 21.1 is the desktop app's 19px row, 6.67 its 6px, 16.7 its 15px.
      className="mt-[16.7px] overflow-hidden rounded-[4px] border border-text-primary/[0.04] py-[6.67px] font-mono text-[0.8461rem] leading-[21.1px] text-text-primary"
    >
      {removedLines.map(([from, to], row) => (
        <div key={`r${row}`} data-testid="permission-diff-removed" className={`whitespace-pre-wrap break-words ps-[17px] ${REMOVED_ROW}`}>
          <Line tokens={tokensBefore} marks={marks.before} from={from} to={to} chip="bg-[rgb(96,26,44)]" />
          {from === to ? '​' : null}
        </div>
      ))}
      {addedLines.map(([from, to], row) => (
        <div key={`a${row}`} data-testid="permission-diff-added" className={`flex whitespace-pre-wrap break-words ps-[7px] ${ADDED_ROW}`}>
          {isNewFile && (
            <span className="w-[56px] shrink-0 select-none text-end text-text-secondary">{row + 1}</span>
          )}
          <span className={isNewFile ? 'ps-[9px]' : 'ps-[10px]'}>
            <Line tokens={tokensAfter} marks={isNewFile ? tokensAfter.map(() => false) : marks.after} from={from} to={to} chip="bg-[rgb(44,84,44)]" />
            {from === to ? '​' : null}
          </span>
        </div>
      ))}
    </div>
  );
}
