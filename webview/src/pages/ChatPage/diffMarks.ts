/**
 * Which words of a changed line sit on a chip, the way the desktop app marks them.
 *
 * The removed lines of a change and the added lines of it are paired from the top, the first removed with the
 * first added, the second with the second. Inside a pair the words the two lines share stay plain and the others
 * go on a chip. A line with no partner (three lines removed, two added: the third removed has none) has no chip.
 * Measured on the desktop app: "l3 l4 l5" turned into "L3 L5" chips l3, l4, L3 and L5 and leaves l5 plain.
 */

/** Past this many words on a line the changed ones are not marked: finding them would cost more than showing them is worth. */
const MAX_MARKED_WORDS = 600;

/** A line cut into words, runs of spaces and tabs, so the line can be put back together from the parts. */
export function tokenizeLine(line: string): string[] {
  return line.split(/([^\S\n]+)/).filter((part) => part !== '');
}

const isSpace = (token: string) => /^\s+$/.test(token);

/** The words of `before` and `after` that are not part of the longest run of words the two share. */
function markPair(before: string[], after: string[]): { before: boolean[]; after: boolean[] } {
  const wordsBefore = before.filter((token) => !isSpace(token)).length;
  const wordsAfter = after.filter((token) => !isSpace(token)).length;
  const all = (tokens: string[]) => tokens.map((token) => !isSpace(token));
  if (wordsBefore > MAX_MARKED_WORDS || wordsAfter > MAX_MARKED_WORDS) {
    return { before: all(before), after: all(after) };
  }
  const rows = before.length;
  const cols = after.length;
  const table: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(cols + 1).fill(0));
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      table[i][j] = before[i] === after[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const marksBefore = all(before);
  const marksAfter = all(after);
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

export interface MarkedLine {
  tokens: string[];
  /** One flag per token: on a chip or not. All false for a line with no partner. */
  marks: boolean[];
}

/** The chip marks for a hunk's removed lines and added lines, paired from the top. */
export function markHunk(removed: string[], added: string[]): { removed: MarkedLine[]; added: MarkedLine[] } {
  const remove: MarkedLine[] = removed.map((line) => {
    const tokens = tokenizeLine(line);
    return { tokens, marks: tokens.map(() => false) };
  });
  const add: MarkedLine[] = added.map((line) => {
    const tokens = tokenizeLine(line);
    return { tokens, marks: tokens.map(() => false) };
  });
  const pairs = Math.min(remove.length, add.length);
  for (let index = 0; index < pairs; index++) {
    const marked = markPair(remove[index].tokens, add[index].tokens);
    remove[index].marks = marked.before;
    add[index].marks = marked.after;
  }
  return { removed: remove, added: add };
}
