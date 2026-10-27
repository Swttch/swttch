import { describe, it, expect } from 'vitest';
import { splitInlineCode } from '../splitInlineCode';

describe('splitInlineCode', () => {
  it('splits a sentence at its code spans', () => {
    expect(splitInlineCode('폴더에 `report.pdf`를 만들어 `a` 주세요')).toEqual([
      { text: '폴더에 ', code: false },
      { text: 'report.pdf', code: true },
      { text: '를 만들어 ', code: false },
      { text: 'a', code: true },
      { text: ' 주세요', code: false },
    ]);
  });

  it('leaves a lone backtick, an unclosed one, and an empty pair as text', () => {
    expect(splitInlineCode('a ` b')).toEqual([{ text: 'a ` b', code: false }]);
    expect(splitInlineCode('``')).toEqual([{ text: '``', code: false }]);
  });

  it('does not let a span run across lines', () => {
    expect(splitInlineCode('`a\nb`')).toEqual([{ text: '`a\nb`', code: false }]);
  });

  it('returns nothing for nothing', () => {
    expect(splitInlineCode('')).toEqual([]);
  });
});
