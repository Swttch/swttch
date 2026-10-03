import { describe, it, expect } from 'vitest';
import { hangulToQwerty, restoreCommandName } from '../hangulKeys';

describe('hangulToQwerty', () => {
  it('turns letters typed one by one back into the keys pressed', () => {
    expect(hangulToQwerty('ㄱㄷㅜㅁㅡㄷ')).toBe('rename');
  });

  it('turns syllables the input method already joined back into the keys pressed', () => {
    expect(hangulToQwerty('ㄱ두믇')).toBe('rename');
    expect(hangulToQwerty('ㅡㅐㅇ디')).toBe('model');
  });

  it('keeps a slash and anything that is not Hangul as it is', () => {
    expect(hangulToQwerty('/ㄱㄷ')).toBe('/re');
    expect(hangulToQwerty('rename')).toBe('rename');
    expect(hangulToQwerty('/rename 12 ab')).toBe('/rename 12 ab');
  });

  it('spells compound vowels and trailing consonants with the keys that make them', () => {
    // 과 = ㄱ + ㅘ (r, hk); 닭 = ㄷ + ㅏ + ㄺ (e, k, fr)
    expect(hangulToQwerty('과')).toBe('rhk');
    expect(hangulToQwerty('닭')).toBe('ekfr');
  });

  it('gives the Shift variants as capital letters', () => {
    expect(hangulToQwerty('ㅃ')).toBe('Q');
    expect(hangulToQwerty('ㅒ')).toBe('O');
  });

  it('handles an empty string', () => {
    expect(hangulToQwerty('')).toBe('');
  });
});

describe('restoreCommandName', () => {
  it('rewrites the first word when it is the command typed on the Korean layout', () => {
    expect(restoreCommandName('/ㄱㄷㅜㅁㅡㄷ 새 이름', '/rename')).toBe('/rename 새 이름');
    expect(restoreCommandName('/ㄱ두믇', '/rename')).toBe('/rename');
  });

  it('leaves a line alone when it already starts with the command', () => {
    expect(restoreCommandName('/rename 새 이름', '/rename')).toBe('/rename 새 이름');
  });

  it('leaves a line alone when the first word is some other command', () => {
    expect(restoreCommandName('/ㅡㅐㅇ디 sonnet', '/rename')).toBe('/ㅡㅐㅇ디 sonnet');
  });

  it('only looks at the first word', () => {
    expect(restoreCommandName('please /ㄱㄷㅜㅁㅡㄷ', '/rename')).toBe('please /ㄱㄷㅜㅁㅡㄷ');
  });
});
