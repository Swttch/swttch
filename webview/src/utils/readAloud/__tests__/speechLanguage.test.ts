import { describe, it, expect } from 'vitest';
import { speechLanguageOf } from '../speechLanguage';

describe('speechLanguageOf', () => {
  it('tells Korean by its script', () => {
    expect(speechLanguageOf('안녕하세요. 소리 내어 읽기 시험입니다.')).toBe('ko');
  });

  it('tells Japanese from Chinese by the kana', () => {
    expect(speechLanguageOf('これは日本語の文章です。')).toBe('ja');
    expect(speechLanguageOf('这是一段中文文字。')).toBe('zh');
  });

  it('tells Russian and Arabic by their scripts', () => {
    expect(speechLanguageOf('Это русский текст.')).toBe('ru');
    expect(speechLanguageOf('هذا نص عربي.')).toBe('ar');
  });

  it('leaves Latin text to the service', () => {
    expect(speechLanguageOf('This is English, and ceci est du français.')).toBeUndefined();
  });

  it('still tells Korean when a reply is full of English names', () => {
    expect(speechLanguageOf('이 파일은 README.md 와 package.json 을 읽고 고칩니다.')).toBe('ko');
  });

  it('gives nothing for empty text', () => {
    expect(speechLanguageOf('')).toBeUndefined();
  });
});
