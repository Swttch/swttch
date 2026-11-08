import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, NO_PAGINATION_LIMIT, SettingKey } from '@/types/settings';
import {
  TRANSCRIPT_PAGE_SIZE,
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

  it('forces the page size over the caller and over the view mode', () => {
    mirrorSettingsForOverrides({ ...DEFAULT_SETTINGS, [SettingKey.TRANSCRIPT_VIEW_MODE]: 'normal' });
    expect(resolveMessagePageSize('s1')).toBe(100);
    expect(resolveMessagePageSize('s1', 30)).toBe(100);
  });

  it('leaves alone the load-everything size used when pagination is off', () => {
    expect(resolveMessagePageSize('s1', NO_PAGINATION_LIMIT)).toBe(NO_PAGINATION_LIMIT);
  });

  it('keeps the value after the query has gone from the address', () => {
    expect(resolveMessagePageSize('s1')).toBe(100);
    window.history.replaceState({}, '', '/sessions/s1');
    expect(resolveMessagePageSize('s1')).toBe(100);
  });
});

describe('without the URL carrying values', () => {
  beforeEach(() => openWith(''));

  it('leaves the settings as they are', () => {
    const settings = { ...DEFAULT_SETTINGS, [SettingKey.FONT_SIZE]: 13 };
    expect(applyUrlOverridesToSettings(settings)).toBe(settings);
  });

  it('leaves the classic chat to the backend default', () => {
    mirrorSettingsForOverrides({ ...DEFAULT_SETTINGS, [SettingKey.TRANSCRIPT_VIEW_MODE]: null });
    expect(resolveMessagePageSize('s1')).toBeUndefined();
  });

  it('asks for 150 in the Transcript view modes', () => {
    mirrorSettingsForOverrides({ ...DEFAULT_SETTINGS, [SettingKey.TRANSCRIPT_VIEW_MODE]: 'normal' });
    expect(resolveMessagePageSize('s1')).toBe(TRANSCRIPT_PAGE_SIZE);
  });

  it('follows the view picked for the session over the default', () => {
    mirrorSettingsForOverrides({
      ...DEFAULT_SETTINGS,
      [SettingKey.TRANSCRIPT_VIEW_MODE]: 'normal',
      [SettingKey.TRANSCRIPT_VIEW_MODE_BY_SESSION]: { s1: 'classic', s2: 'verbose' },
    });
    expect(resolveMessagePageSize('s1')).toBeUndefined();
    expect(resolveMessagePageSize('s2')).toBe(TRANSCRIPT_PAGE_SIZE);
    expect(resolveMessagePageSize('s3')).toBe(TRANSCRIPT_PAGE_SIZE);
  });

  it('keeps a size the caller asked for on purpose', () => {
    mirrorSettingsForOverrides({ ...DEFAULT_SETTINGS, [SettingKey.TRANSCRIPT_VIEW_MODE]: 'normal' });
    expect(resolveMessagePageSize('s1', 40)).toBe(40);
  });
});
