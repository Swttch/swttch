import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SettingKey } from '@/types/settings';
import {
  applyUrlOverridesToSettings,
  mirrorSettingsForOverrides,
  parseUrlOverrides,
  resetUrlOverridesForTest,
  resolveMessagePageSize,
} from '../urlOverrides';

function openWith(search: string) {
  window.history.replaceState({}, '', `/${search}`);
  resetUrlOverridesForTest();
}

describe('parseUrlOverrides', () => {
  it('reads the page size and the font size', () => {
    expect(parseUrlOverrides('?pageSize=100&fontSize=15')).toEqual({ pageSize: 100, fontSize: 15 });
  });

  it('allows a fractional font size but not a fractional page size', () => {
    expect(parseUrlOverrides('?fontSize=12.5')).toEqual({ fontSize: 12.5 });
    expect(parseUrlOverrides('?pageSize=12.5')).toEqual({});
  });

  it('ignores what is not a number in range, as if it were not given', () => {
    expect(parseUrlOverrides('?pageSize=abc&fontSize=')).toEqual({});
    expect(parseUrlOverrides('?pageSize=5&fontSize=2')).toEqual({});
    expect(parseUrlOverrides('?pageSize=99999&fontSize=500')).toEqual({});
  });
});

describe('with the URL carrying values', () => {
  beforeEach(() => openWith('?pageSize=100&fontSize=18'));
  afterEach(() => openWith(''));

  it('forces the font size over what the settings hold', () => {
    const settings = { ...DEFAULT_SETTINGS, [SettingKey.FONT_SIZE]: 13 };
    expect(applyUrlOverridesToSettings(settings)[SettingKey.FONT_SIZE]).toBe(18);
  });

  it('forces the page size over what the settings hold', () => {
    const settings = { ...DEFAULT_SETTINGS, [SettingKey.CHAT_PAGE_SIZE]: 200 };
    const applied = applyUrlOverridesToSettings(settings);
    expect(applied[SettingKey.CHAT_PAGE_SIZE]).toBe(100);
    // The page size the backend is asked for is read from the same settings.
    mirrorSettingsForOverrides(applied);
    expect(resolveMessagePageSize()).toBe(100);
  });

  it('keeps the value after the query has gone from the address', () => {
    const applied = () => applyUrlOverridesToSettings(DEFAULT_SETTINGS)[SettingKey.CHAT_PAGE_SIZE];
    expect(applied()).toBe(100);
    window.history.replaceState({}, '', '/sessions/s1');
    expect(applied()).toBe(100);
  });
});

describe('without the URL carrying values', () => {
  beforeEach(() => openWith(''));

  it('leaves the settings as they are', () => {
    const settings = { ...DEFAULT_SETTINGS, [SettingKey.FONT_SIZE]: 13 };
    expect(applyUrlOverridesToSettings(settings)).toBe(settings);
  });

  it('asks for the page size the settings hold', () => {
    mirrorSettingsForOverrides({ ...DEFAULT_SETTINGS, [SettingKey.CHAT_PAGE_SIZE]: 120 });
    expect(resolveMessagePageSize()).toBe(120);
  });

  it('asks for the default page size before any settings have arrived', () => {
    resetUrlOverridesForTest();
    expect(resolveMessagePageSize()).toBe(DEFAULT_SETTINGS[SettingKey.CHAT_PAGE_SIZE]);
  });
});
