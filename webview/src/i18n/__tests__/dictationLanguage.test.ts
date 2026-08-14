import { describe, it, expect } from 'vitest';
import {
  resolveDictationLanguage,
  languageSettingToCode,
  isDictationSupported,
  DICTATION_SUPPORTED_CODES,
} from '../dictationLanguage';

describe('languageSettingToCode', () => {
  it('passes a BCP-47 code through', () => {
    expect(languageSettingToCode('ko')).toBe('ko');
    expect(languageSettingToCode('pt-BR')).toBe('pt-BR');
  });

  it('maps an English language name onto its code', () => {
    // Claude's own docs use this form ({"language": "japanese"}), and it is
    // what our interface-language setting stores.
    expect(languageSettingToCode('japanese')).toBe('ja');
    expect(languageSettingToCode('korean')).toBe('ko');
  });

  it('is case- and whitespace-insensitive about names', () => {
    expect(languageSettingToCode('  Korean ')).toBe('ko');
  });

  it('rejects free-form instructions rather than sending them as a language', () => {
    // `language` is a free-text field, so it may hold prose. Passing that
    // through as a language tag would ask the service for a language that
    // does not exist.
    expect(languageSettingToCode('be concise')).toBeNull();
    expect(languageSettingToCode('반말로')).toBeNull();
  });

  it('treats empty and unset alike', () => {
    expect(languageSettingToCode('')).toBeNull();
    expect(languageSettingToCode('   ')).toBeNull();
    expect(languageSettingToCode(null)).toBeNull();
    expect(languageSettingToCode(undefined)).toBeNull();
  });
});

describe('resolveDictationLanguage', () => {
  it("prefers Claude's own language setting", () => {
    // The CLI treats `language` as the dictation language, so a value there
    // wins over everything else — changing it in /config must move the GUI too.
    expect(
      resolveDictationLanguage({
        claudeLanguage: 'japanese',
        speechLanguage: 'ko',
        uiLocale: 'en',
      }),
    ).toBe('ja');
  });

  it('falls back to our own setting when the official one is empty', () => {
    expect(
      resolveDictationLanguage({
        claudeLanguage: null,
        speechLanguage: 'ko',
        uiLocale: 'en',
      }),
    ).toBe('ko');
  });

  it('falls back to our own setting when the official one is unreadable', () => {
    // "be concise" is a legitimate thing to put in `language`, and it tells us
    // nothing about what the user speaks — so the next source should answer.
    expect(
      resolveDictationLanguage({
        claudeLanguage: 'be concise',
        speechLanguage: 'ko',
        uiLocale: 'en',
      }),
    ).toBe('ko');
  });

  it('falls back to the interface language when neither is set', () => {
    expect(
      resolveDictationLanguage({
        claudeLanguage: null,
        speechLanguage: null,
        uiLocale: 'ko',
      }),
    ).toBe('ko');
  });

  it('does not turn the interface locale into English on the way through', () => {
    // The interface locale is already BCP-47. Running it through the
    // setting-value map would answer 'en' for every code and silently
    // transcribe Korean speech as English.
    expect(
      resolveDictationLanguage({ claudeLanguage: null, speechLanguage: null, uiLocale: 'ja' }),
    ).toBe('ja');
  });

  it('returns null when nothing is known', () => {
    expect(
      resolveDictationLanguage({ claudeLanguage: null, speechLanguage: null, uiLocale: null }),
    ).toBeNull();
  });
});

describe('isDictationSupported', () => {
  it('accepts the documented languages', () => {
    for (const code of DICTATION_SUPPORTED_CODES) {
      expect(isDictationSupported(code)).toBe(true);
    }
  });

  it('matches on the primary subtag', () => {
    // 'pt-BR' is served by the same model as 'pt'.
    expect(isDictationSupported('pt-BR')).toBe(true);
    expect(isDictationSupported('en-GB')).toBe(true);
  });

  it('rejects languages the service transcribes as English', () => {
    // Selectable, but the service falls back to English for them — the UI
    // separates these rather than implying they work.
    expect(isDictationSupported('sw')).toBe(false);
    expect(isDictationSupported('vi')).toBe(false);
    expect(isDictationSupported(null)).toBe(false);
  });
});
