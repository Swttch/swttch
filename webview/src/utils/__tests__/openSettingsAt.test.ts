import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Route } from '@/router';
import { OpenSettingsMode, SettingKey } from '@/types/settings';

const openSettingsAdapterMock = vi.fn();
vi.mock('@/adapters', () => ({
  getAdapter: () => ({ openSettings: openSettingsAdapterMock }),
}));

import {
  openSettingsAt,
  OPEN_SETTINGS_OVERLAY_EVENT,
  type OpenSettingsOverlayDetail,
} from '../openSettingsAt';

const SETTINGS_STORAGE_KEY = 'claude-code-settings';

/** Capture the overlay request the utility emits for in-app navigation. */
function listenForOverlay(): { detail: () => OpenSettingsOverlayDetail | null; stop: () => void } {
  let captured: OpenSettingsOverlayDetail | null = null;
  const handler = (e: Event) => {
    captured = (e as CustomEvent<OpenSettingsOverlayDetail>).detail;
  };
  window.addEventListener(OPEN_SETTINGS_OVERLAY_EVENT, handler);
  return {
    detail: () => captured,
    stop: () => window.removeEventListener(OPEN_SETTINGS_OVERLAY_EVENT, handler),
  };
}

function storeOpenMode(mode: OpenSettingsMode): void {
  localStorage.setItem(
    SETTINGS_STORAGE_KEY,
    JSON.stringify({ [SettingKey.OPEN_SETTINGS_AS]: mode }),
  );
}

describe('openSettingsAt', () => {
  beforeEach(() => {
    openSettingsAdapterMock.mockReset().mockResolvedValue(undefined);
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('opens an overlay over the current screen when that is the user preference', async () => {
    storeOpenMode(OpenSettingsMode.OVERLAY);
    const overlay = listenForOverlay();

    await openSettingsAt(Route.SETTINGS_SPONSOR);

    expect(overlay.detail()).toEqual({ route: Route.SETTINGS_SPONSOR });
    // The overlay keeps the running session mounted, so no tab is opened.
    expect(openSettingsAdapterMock).not.toHaveBeenCalled();
    overlay.stop();
  });

  it('opens a dedicated tab at the SAME target when that is the user preference', async () => {
    storeOpenMode(OpenSettingsMode.NEW_TAB);
    const overlay = listenForOverlay();

    await openSettingsAt(Route.SETTINGS_SPONSOR);

    // The destination must survive the trip — a new tab that lands on General
    // would drop the user somewhere they did not ask for.
    expect(openSettingsAdapterMock).toHaveBeenCalledWith(Route.SETTINGS_SPONSOR);
    expect(overlay.detail()).toBeNull();
    overlay.stop();
  });

  it('defaults to the overlay when no preference has been stored yet', async () => {
    const overlay = listenForOverlay();

    await openSettingsAt(Route.SETTINGS_SPONSOR);

    expect(overlay.detail()).toEqual({ route: Route.SETTINGS_SPONSOR });
    expect(openSettingsAdapterMock).not.toHaveBeenCalled();
    overlay.stop();
  });

  it('falls back to the overlay when the stored settings are unreadable', async () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, '{ not json');
    const overlay = listenForOverlay();

    await openSettingsAt(Route.SETTINGS_SPONSOR);

    expect(overlay.detail()).toEqual({ route: Route.SETTINGS_SPONSOR });
    overlay.stop();
  });

  it('works for any settings route, not just the sponsor page', async () => {
    storeOpenMode(OpenSettingsMode.NEW_TAB);

    await openSettingsAt(Route.SETTINGS_PERMISSIONS);

    expect(openSettingsAdapterMock).toHaveBeenCalledWith(Route.SETTINGS_PERMISSIONS);
  });

  it('falls back to the overlay when opening a tab fails (e.g. pop-up blocked)', async () => {
    storeOpenMode(OpenSettingsMode.NEW_TAB);
    openSettingsAdapterMock.mockRejectedValue(new Error('Pop-up might be blocked'));
    const overlay = listenForOverlay();

    // A blocked pop-up must not swallow the click — the user still gets there.
    await expect(openSettingsAt(Route.SETTINGS_SPONSOR)).resolves.toBeUndefined();
    expect(overlay.detail()).toEqual({ route: Route.SETTINGS_SPONSOR });
    overlay.stop();
  });
});
