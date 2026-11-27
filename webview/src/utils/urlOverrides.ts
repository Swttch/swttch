/**
 * Settings handed in through the page's URL, and nothing else: this file is the one layer that reads them.
 *
 * `?pageSize=100&fontSize=15` makes the chat load 100 entries a page and draw its text at 15px, whatever the
 * settings files say. A value given here wins over every other source (the user's settings, the project's, the
 * defaults) and is applied by force: the settings screen shows it, and changing the setting there has no effect
 * until the URL stops carrying it. It is what `!important` is to a style.
 *
 * To add a setting that the URL can carry: give it a key in `URL_OVERRIDE_KEYS`, a field in `UrlOverrides`, a
 * parser with its valid range in `parseUrlOverrides`, and say where it lands (`applyUrlOverridesToSettings` for a
 * setting, or a resolver like `resolveMessagePageSize` for a value that is not one). A value that is not a
 * number in its range is ignored, as if the parameter were not there.
 */
import { DEFAULT_SETTINGS, SettingKey, type SettingsState } from '@/types/settings';

export const URL_OVERRIDE_KEYS = {
  PAGE_SIZE: 'pageSize',
  FONT_SIZE: 'fontSize',
} as const;

export interface UrlOverrides {
  /** How many entries one page of a session's messages holds. */
  pageSize?: number;
  /** The root font size in px, which scales everything drawn in rem. */
  fontSize?: number;
}

const PAGE_SIZE_RANGE = { min: 10, max: 2000 };
const FONT_SIZE_RANGE = { min: 8, max: 40 };

function numberInRange(raw: string | null, range: { min: number; max: number }, integer: boolean): number | undefined {
  if (raw === null || raw.trim() === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  if (integer && !Number.isInteger(value)) return undefined;
  if (value < range.min || value > range.max) return undefined;
  return value;
}

export function parseUrlOverrides(search: string): UrlOverrides {
  const params = new URLSearchParams(search);
  const overrides: UrlOverrides = {};
  const pageSize = numberInRange(params.get(URL_OVERRIDE_KEYS.PAGE_SIZE), PAGE_SIZE_RANGE, true);
  if (pageSize !== undefined) overrides.pageSize = pageSize;
  const fontSize = numberInRange(params.get(URL_OVERRIDE_KEYS.FONT_SIZE), FONT_SIZE_RANGE, false);
  if (fontSize !== undefined) overrides.fontSize = fontSize;
  return overrides;
}

// Read as this module loads, which is at the app's start, before any page change can take the query away.
let captured: UrlOverrides | null = typeof window === 'undefined' ? {} : parseUrlOverrides(window.location.search);

/**
 * What the URL carried when the page was first asked. It is read once and kept: the app moves between its pages
 * without the query, and a value handed in at launch must not drop out when it does.
 */
export function getUrlOverrides(): UrlOverrides {
  if (captured === null) captured = typeof window === 'undefined' ? {} : parseUrlOverrides(window.location.search);
  return captured;
}

/** For tests: forget what was read so the next call reads the URL again. */
export function resetUrlOverridesForTest(): void {
  captured = null;
  mirroredSettings = undefined;
}

/** The settings with every value the URL carries laid over them. */
export function applyUrlOverridesToSettings(settings: SettingsState): SettingsState {
  const overrides = getUrlOverrides();
  let result = settings;
  if (overrides.fontSize !== undefined && settings[SettingKey.FONT_SIZE] !== overrides.fontSize) {
    result = { ...result, [SettingKey.FONT_SIZE]: overrides.fontSize };
  }
  if (overrides.pageSize !== undefined && settings[SettingKey.CHAT_PAGE_SIZE] !== overrides.pageSize) {
    result = { ...result, [SettingKey.CHAT_PAGE_SIZE]: overrides.pageSize };
  }
  return result;
}

let mirroredSettings: SettingsState | undefined;

/** Called by SettingsContext whenever its settings change, so code outside React can read them. */
export function mirrorSettingsForOverrides(settings: SettingsState): void {
  mirroredSettings = settings;
}

/**
 * How many entries of the conversation one page of a session's messages holds: the `chatPageSize` setting, which the URL's
 * `pageSize` has already been laid over (see `applyUrlOverridesToSettings`). Read outside React by the
 * code that asks the backend for a page, so the size it asks for and the size the transcript window
 * counts in are the same number.
 */
export function resolveMessagePageSize(): number {
  return mirroredSettings?.[SettingKey.CHAT_PAGE_SIZE] ?? DEFAULT_SETTINGS[SettingKey.CHAT_PAGE_SIZE];
}

/**
 * How many pages the window keeps around the page the reader is on: the `chatHistoryPages` setting. A jump asks for
 * that many at once.
 */
export function resolveHistoryPages(): number {
  return mirroredSettings?.[SettingKey.CHAT_HISTORY_PAGES] ?? DEFAULT_SETTINGS[SettingKey.CHAT_HISTORY_PAGES];
}
