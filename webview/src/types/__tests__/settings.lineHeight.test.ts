import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, SettingKey, defaultLineHeightFor } from '../settings';

describe('defaultLineHeightFor', () => {
  it('is 1.6 for the languages the desktop app sets looser: Korean, Japanese and Chinese', () => {
    expect(defaultLineHeightFor('ko')).toBe(1.6);
    expect(defaultLineHeightFor('ja')).toBe(1.6);
    expect(defaultLineHeightFor('zh')).toBe(1.6);
    expect(defaultLineHeightFor('zh-TW')).toBe(1.6);
    expect(defaultLineHeightFor('ko-KR')).toBe(1.6);
  });

  it('is 1.5 for every other language, and when the language is not known', () => {
    expect(defaultLineHeightFor('en')).toBe(1.5);
    expect(defaultLineHeightFor('de')).toBe(1.5);
    expect(defaultLineHeightFor('ru')).toBe(1.5);
    expect(defaultLineHeightFor(undefined)).toBe(1.5);
  });

  it('does not take a language that only begins with those letters for one of them', () => {
    expect(defaultLineHeightFor('kok')).toBe(1.5);
    expect(defaultLineHeightFor('jam')).toBe(1.5);
  });
});

describe('the defaults that make 1rem the desktop app\'s 16px', () => {
  it('starts a new user at font size 16, zoom 1 and an unset line spacing', () => {
    expect(DEFAULT_SETTINGS[SettingKey.FONT_SIZE]).toBe(16);
    expect(DEFAULT_SETTINGS[SettingKey.ZOOM_LEVEL]).toBe(1);
    expect(DEFAULT_SETTINGS[SettingKey.LINE_HEIGHT]).toBeNull();
  });
});
