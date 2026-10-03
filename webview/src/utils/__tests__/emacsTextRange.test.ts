import { describe, it, expect } from 'vitest';
import {
  centeringScrollDelta,
  deleteBackwardRange,
  deleteForwardRange,
  killRange,
  lineIndexAt,
  nextCharacterEnd,
  openLineReplacement,
  pageRowCount,
  previousCharacterStart,
  transposeReplacement,
  yankReplacement,
} from '../emacsTextRange';

const at = (offset: number) => ({ start: offset, end: offset });
const EMOJI = '\u{1F600}';

describe('character steps', () => {
  it('step over a surrogate pair as one character', () => {
    const text = `a${EMOJI}b`;
    expect(nextCharacterEnd(text, 1)).toBe(3);
    expect(previousCharacterStart(text, 3)).toBe(1);
  });

  it('clamp at the ends', () => {
    expect(nextCharacterEnd('ab', 2)).toBe(2);
    expect(previousCharacterStart('ab', 0)).toBe(0);
  });
});

describe('deleteForwardRange (Ctrl+D)', () => {
  it('takes the character after the caret', () => {
    expect(deleteForwardRange('hello', at(1))).toEqual({ start: 1, end: 2 });
  });

  it('takes a whole emoji', () => {
    expect(deleteForwardRange(`a${EMOJI}`, at(1))).toEqual({ start: 1, end: 3 });
  });

  it('takes the selection when there is one', () => {
    expect(deleteForwardRange('hello', { start: 1, end: 4 })).toEqual({ start: 1, end: 4 });
  });

  it('does nothing at the very end', () => {
    expect(deleteForwardRange('hello', at(5))).toBeNull();
  });
});

describe('deleteBackwardRange (Ctrl+H)', () => {
  it('takes the character before the caret', () => {
    expect(deleteBackwardRange('hello', at(2))).toEqual({ start: 1, end: 2 });
  });

  it('takes the selection when there is one', () => {
    expect(deleteBackwardRange('hello', { start: 0, end: 3 })).toEqual({ start: 0, end: 3 });
  });

  it('does nothing at the very start', () => {
    expect(deleteBackwardRange('hello', at(0))).toBeNull();
  });
});

describe('killRange (Ctrl+K)', () => {
  const text = 'first line\nsecond';

  it('takes from the caret to the end of the paragraph', () => {
    expect(killRange(text, at(6))).toEqual({ start: 6, end: 10 });
  });

  it('takes the line break when the caret is already at the paragraph end', () => {
    expect(killRange(text, at(10))).toEqual({ start: 10, end: 11 });
  });

  it('takes to the end of the text on the last paragraph', () => {
    expect(killRange(text, at(11))).toEqual({ start: 11, end: text.length });
  });

  it('does nothing at the very end', () => {
    expect(killRange(text, at(text.length))).toBeNull();
  });

  it('takes the selection as it stands', () => {
    expect(killRange(text, { start: 2, end: 14 })).toEqual({ start: 2, end: 14 });
  });
});

describe('transposeReplacement (Ctrl+T)', () => {
  it('swaps the characters around the caret, caret after the pair', () => {
    expect(transposeReplacement('abcd', at(2))).toEqual({ start: 1, end: 3, text: 'cb', caret: 3 });
  });

  it('swaps the two before the caret at the end of the text', () => {
    expect(transposeReplacement('abcd', at(4))).toEqual({ start: 2, end: 4, text: 'dc', caret: 4 });
  });

  it('swaps the two before the caret at the end of a paragraph', () => {
    expect(transposeReplacement('ab\ncd', at(2))).toEqual({ start: 0, end: 2, text: 'ba', caret: 2 });
  });

  it('swaps emoji whole', () => {
    expect(transposeReplacement(`a${EMOJI}`, at(3))).toEqual({ start: 0, end: 3, text: `${EMOJI}a`, caret: 3 });
  });

  it('does nothing at the start of the text', () => {
    expect(transposeReplacement('abcd', at(0))).toBeNull();
  });

  it('does nothing with fewer than two characters', () => {
    expect(transposeReplacement('a', at(1))).toBeNull();
    expect(transposeReplacement('', at(0))).toBeNull();
  });

  it('does nothing across a line break', () => {
    // Caret at the start of the second paragraph: the pair would be "\n" + "c".
    expect(transposeReplacement('ab\ncd', at(3))).toBeNull();
    // A one-character paragraph at its end: the pair would be "\n" + "x".
    expect(transposeReplacement('ab\nx', at(4))).toBeNull();
  });

  it('does nothing with a selection', () => {
    expect(transposeReplacement('abcd', { start: 1, end: 3 })).toBeNull();
  });
});

describe('yankReplacement (Ctrl+Y)', () => {
  it('replaces the selection with the killed text, caret after it', () => {
    expect(yankReplacement({ start: 1, end: 3 }, 'xyz')).toEqual({ start: 1, end: 3, text: 'xyz', caret: 4 });
  });

  it('does nothing when nothing was killed', () => {
    expect(yankReplacement(at(1), '')).toBeNull();
  });
});

describe('openLineReplacement (Ctrl+O)', () => {
  it('inserts a line break and keeps the caret before it', () => {
    expect(openLineReplacement(at(3))).toEqual({ start: 3, end: 3, text: '\n', caret: 3 });
  });

  it('replaces a selection', () => {
    expect(openLineReplacement({ start: 1, end: 4 })).toEqual({ start: 1, end: 4, text: '\n', caret: 1 });
  });
});

describe('pageRowCount (Ctrl+V)', () => {
  it('counts the rows that fit wholly', () => {
    expect(pageRowCount(100, 20)).toBe(5);
    expect(pageRowCount(110, 20)).toBe(5);
  });

  it('is at least one', () => {
    expect(pageRowCount(10, 20)).toBe(1);
    expect(pageRowCount(0, 20)).toBe(1);
    expect(pageRowCount(100, 0)).toBe(1);
    expect(pageRowCount(100, Number.NaN)).toBe(1);
  });
});

describe('centeringScrollDelta (Ctrl+L)', () => {
  it('scrolls down when the caret is below the middle', () => {
    expect(centeringScrollDelta(180, 20, 200)).toBe(90);
  });

  it('scrolls up when the caret is above the middle', () => {
    expect(centeringScrollDelta(0, 20, 200)).toBe(-90);
  });

  it('does not move a caret already in the middle', () => {
    expect(centeringScrollDelta(90, 20, 200)).toBe(0);
  });
});

describe('lineIndexAt', () => {
  it('counts the line breaks before the offset', () => {
    expect(lineIndexAt('a\nb\nc', 0)).toBe(0);
    expect(lineIndexAt('a\nb\nc', 2)).toBe(1);
    expect(lineIndexAt('a\nb\nc', 5)).toBe(2);
  });
});
