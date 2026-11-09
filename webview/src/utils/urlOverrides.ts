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
import { NO_PAGINATION_LIMIT, SettingKey, TRANSCRIPT_VIEW_MODES, type SettingsState } from '@/types/settings';

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

/** How many entries a page holds in the Transcript view modes when nothing says otherwise. */
export const TRANSCRIPT_PAGE_SIZE = 150;

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
  if (overrides.fontSize === undefined || settings[SettingKey.FONT_SIZE] === overrides.fontSize) return settings;
  return { ...settings, [SettingKey.FONT_SIZE]: overrides.fontSize };
}

let mirroredSettings: SettingsState | undefined;

/** Called by SettingsContext whenever its settings change, so code outside React can tell which view is in use. */
export function mirrorSettingsForOverrides(settings: SettingsState): void {
  mirroredSettings = settings;
}

function usesTranscriptView(sessionId: string | undefined): boolean {
  const picked = sessionId ? mirroredSettings?.[SettingKey.TRANSCRIPT_VIEW_MODE_BY_SESSION]?.[sessionId] : undefined;
  if (picked === 'classic') return false;
  if (TRANSCRIPT_VIEW_MODES.includes(picked as never)) return true;
  if (!mirroredSettings) return false;
  return mirroredSettings[SettingKey.TRANSCRIPT_VIEW_MODE] !== 'classic';
}

/**
 * How many entries to ask the backend for in one page, or undefined to leave it to the backend (50, which is
 * what the classic chat has always loaded).
 *
 * With pagination switched off (`NO_PAGINATION_LIMIT`) that size is kept as it is. Otherwise, in order: the URL's `pageSize`; a size the caller asked for on purpose (a jump that has to reach a given entry,
 * say); 150 in the Transcript view modes, which draw many entries in the space of a few classic ones; otherwise
 * undefined.
 */
export function resolveMessagePageSize(sessionId: string | undefined, explicit?: number): number | undefined {
  // Pagination switched off in the settings means "load everything": no page size applies, the URL's included.
  if (explicit === NO_PAGINATION_LIMIT) return explicit;
  const fromUrl = getUrlOverrides().pageSize;
  if (fromUrl !== undefined) return fromUrl;
  if (explicit !== undefined) return explicit;
  return usesTranscriptView(sessionId) ? TRANSCRIPT_PAGE_SIZE : undefined;
}
