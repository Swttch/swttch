import { describe, it, expect } from 'vitest';
import { legacyDecoderCandidates, decodeConsoleOutput } from '../console-encoding';

/**
 * Windows console programs (tasklist, netstat, ...) emit their localized messages in the
 * system's legacy OEM codepage, not UTF-8. Decoding those bytes as UTF-8 turns every
 * non-ASCII character into U+FFFD, which is what users see as garbled output.
 */
describe('legacyDecoderCandidates', () => {
  it('maps Korean to the CP949-compatible decoder', () => {
    expect(legacyDecoderCandidates('ko-KR')).toEqual(['euc-kr']);
  });

  it('maps Japanese to Shift-JIS', () => {
    expect(legacyDecoderCandidates('ja-JP')).toEqual(['shift_jis']);
  });

  it('maps Simplified Chinese to GBK before GB18030 (GBK is the CP936 default)', () => {
    expect(legacyDecoderCandidates('zh-CN')).toEqual(['gbk', 'gb18030']);
  });

  it('maps Traditional Chinese to Big5', () => {
    expect(legacyDecoderCandidates('zh-TW')).toEqual(['big5']);
    expect(legacyDecoderCandidates('zh-Hant-HK')).toEqual(['big5']);
  });

  it('falls back to windows-1252 for Western locales', () => {
    expect(legacyDecoderCandidates('en-US')).toEqual(['windows-1252']);
  });

  it('is case-insensitive and tolerates a bare language tag', () => {
    expect(legacyDecoderCandidates('KO')).toEqual(['euc-kr']);
    expect(legacyDecoderCandidates('zh')).toEqual(['gbk', 'gb18030']);
  });
});

describe('decodeConsoleOutput', () => {
  it('returns UTF-8 text untouched when the bytes are valid UTF-8', () => {
    const buf = Buffer.from('한글-中文-テスト', 'utf8');
    expect(decodeConsoleOutput(buf, 'ko-KR')).toBe('한글-中文-テスト');
  });

  it('recovers Korean CP949 bytes that UTF-8 would turn into U+FFFD', () => {
    // "이미지 이름" as emitted by `tasklist` on a Korean Windows console.
    const cp949 = Buffer.from([0xc0, 0xcc, 0xb9, 0xcc, 0xc1, 0xf6, 0x20, 0xc0, 0xcc, 0xb8, 0xa7]);
    expect(cp949.toString('utf8')).toContain('\uFFFD');
    expect(decodeConsoleOutput(cp949, 'ko-KR')).toBe('이미지 이름');
  });

  it('recovers Simplified Chinese GBK bytes', () => {
    const gbk = Buffer.from([0xd6, 0xd0, 0xce, 0xc4]); // 中文
    expect(gbk.toString('utf8')).toContain('\uFFFD');
    expect(decodeConsoleOutput(gbk, 'zh-CN')).toBe('中文');
  });

  it('leaves pure ASCII alone regardless of locale', () => {
    const buf = Buffer.from('Image Name    PID', 'utf8');
    expect(decodeConsoleOutput(buf, 'ja-JP')).toBe('Image Name    PID');
  });

  it('preserves the UTF-8 reading when no candidate decoder yields a clean result', () => {
    // A lone 0xFF is invalid in UTF-8 AND in euc-kr — we must not lose the output.
    const buf = Buffer.from([0x41, 0xff, 0x42]);
    const out = decodeConsoleOutput(buf, 'ko-KR');
    expect(out).toContain('A');
    expect(out).toContain('B');
  });

  it('accepts a string and passes it through unchanged (already decoded upstream)', () => {
    expect(decodeConsoleOutput('already text', 'ko-KR')).toBe('already text');
  });
});
