/**
 * Where a review opens, for every host and setting.
 *
 * One hook decides for all three entry points — the prompt's file link, the
 * backend opening it unprompted, and a reopen after it was closed — so these
 * cases are what stops those three from drifting apart.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { DiffSurface, BrowserDiffPresentation, SettingKey } from '@/types/settings';

const openDiffForRequest = vi.fn();
const openDiffTab = vi.fn();
const api = { tools: { openDiffForRequest, openDiffTab } };
vi.mock('@/contexts/ApiContext', () => ({ useApi: () => api }));

// The effective values, not the scope the settings screen shows: what these
// hooks decide with has to match what the backend decides with (#359).
const settings = vi.fn();
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: settings() }),
}));

const surface = vi.fn();
vi.mock('@/hooks/useIdeDiffAvailable', () => ({
  useResolvedDiffSurface: () => surface(),
}));

const overlayAllowed = vi.fn();
vi.mock('@/hooks/useDiffOverlayAllowed', () => ({
  useDiffOverlayAllowed: () => overlayAllowed(),
}));

const isJetBrains = vi.fn();
vi.mock('@/config/environment', () => ({ isJetBrains: () => isJetBrains() }));

const openDiff = vi.fn();
vi.mock('@/adapters', () => ({ getAdapter: () => ({ openDiff }) }));

import { useOpenDiffReview } from '../useOpenDiffReview';

const open = () => renderHook(() => useOpenDiffReview()).result.current('toolu_1');

beforeEach(() => {
  openDiffForRequest.mockReset().mockResolvedValue(undefined);
  openDiffTab.mockReset().mockResolvedValue(undefined);
  openDiff.mockReset().mockResolvedValue(undefined);
  // A browser reviewing on the built-in surface, asking for a new tab.
  surface.mockReturnValue(DiffSurface.BUILT_IN);
  settings.mockReturnValue({
    [SettingKey.BROWSER_DIFF_PRESENTATION]: BrowserDiffPresentation.NEW_TAB,
  });
  overlayAllowed.mockReturnValue(true);
  isJetBrains.mockReturnValue(false);
});

describe('useOpenDiffReview', () => {
  it("hands the change to the IDE's own viewer when that is the surface", async () => {
    surface.mockReturnValue(DiffSurface.IDE);

    await expect(open()).resolves.toEqual({ kind: 'opened' });
    expect(openDiffForRequest).toHaveBeenCalledWith('toolu_1');
  });

  it('opens a browser tab when that is what was asked for', async () => {
    await expect(open()).resolves.toEqual({ kind: 'opened' });
    expect(openDiff).toHaveBeenCalledWith('toolu_1');
  });

  it('reports an overlay back for the caller to mount', async () => {
    // The hook cannot mount it: the overlay covers a screen this does not own.
    settings.mockReturnValue({
      [SettingKey.BROWSER_DIFF_PRESENTATION]: BrowserDiffPresentation.OVERLAY,
    });

    await expect(open()).resolves.toEqual({ kind: 'overlay', toolUseId: 'toolu_1' });
  });

  it('asks the IDE for an editor tab, which only it can open', async () => {
    isJetBrains.mockReturnValue(true);

    await expect(open()).resolves.toEqual({ kind: 'opened' });
    expect(openDiffTab).toHaveBeenCalledWith('toolu_1');
  });

  /*
   * An overlay inherits the room of whatever it covers, and an IDE sidebar is a
   * column. Rather than draw a side-by-side diff somewhere it cannot be read,
   * the request falls through to the editor tab.
   */
  it('opens a tab instead when an overlay has no room', async () => {
    isJetBrains.mockReturnValue(true);
    overlayAllowed.mockReturnValue(false);
    settings.mockReturnValue({
      [SettingKey.BROWSER_DIFF_PRESENTATION]: BrowserDiffPresentation.OVERLAY,
    });

    await expect(open()).resolves.toEqual({ kind: 'opened' });
    expect(openDiffTab).toHaveBeenCalledWith('toolu_1');
  });

  it('honours an overlay in an IDE when there is room for one', async () => {
    // The chat is in an editor panel, which has the width to be drawn over.
    isJetBrains.mockReturnValue(true);
    overlayAllowed.mockReturnValue(true);
    settings.mockReturnValue({
      [SettingKey.BROWSER_DIFF_PRESENTATION]: BrowserDiffPresentation.OVERLAY,
    });

    await expect(open()).resolves.toEqual({ kind: 'overlay', toolUseId: 'toolu_1' });
    expect(openDiffTab).not.toHaveBeenCalled();
  });
});
