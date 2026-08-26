/**
 * Which surface draws the review, and where that answer is read from (#359).
 *
 * The bug: these hooks read `scopeSettings` — the values written at whatever
 * scope the settings SCREEN is currently showing, which defaults to global.
 * A project that sets `diffSurface: "ide"` writes nothing globally, so the
 * lookup came back empty and the file link opened the built-in diff. The
 * backend merges properly and had already opened the IDE's viewer, so one edit
 * ended up under review on both surfaces at once.
 *
 * The distinction these pin: `settings` is the effective value, `scopeSettings`
 * answers "what is written at this level" and is a settings-screen concern.
 * Nothing that decides behaviour may read the latter.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { SettingKey, DiffSurface } from '@/types/settings';

const settings = vi.fn();
const scopeSettings = vi.fn();
const ideAttached = vi.fn();
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({
    settings: settings(),
    scopeSettings: scopeSettings(),
    ideAttached: ideAttached(),
  }),
}));

import { useResolvedDiffSurface, useAutoOpenDiffEnabled } from '../useIdeDiffAvailable';

const surface = () => renderHook(() => useResolvedDiffSurface()).result.current;
const autoOpen = () => renderHook(() => useAutoOpenDiffEnabled()).result.current;

beforeEach(() => {
  ideAttached.mockReturnValue(true);
  settings.mockReturnValue({});
  scopeSettings.mockReturnValue({});
});

describe('useResolvedDiffSurface', () => {
  /**
   * The reported shape: the value reaches the merged settings but the global
   * scope is blank, because the project is what set it.
   *
   * Asserted with BUILT_IN rather than IDE even though the report was about a
   * project asking for the IDE. Reading the wrong place yields undefined, and
   * undefined falls back to IDE — so the IDE case passes either way and proves
   * nothing. Only a project asking for something OTHER than the default can
   * tell the two readings apart.
   */
  it('honours a surface the project set, which the global scope cannot see', () => {
    settings.mockReturnValue({ [SettingKey.DIFF_SURFACE]: DiffSurface.BUILT_IN });
    scopeSettings.mockReturnValue({});

    expect(surface()).toBe(DiffSurface.BUILT_IN);
  });

  /**
   * The scope view is what the settings screen is showing. If a reviewer opens
   * that screen and switches it to global, where nothing is set, the review must
   * not start opening somewhere else.
   */
  it('ignores the scope the settings screen happens to be showing', () => {
    settings.mockReturnValue({ [SettingKey.DIFF_SURFACE]: DiffSurface.IDE });
    scopeSettings.mockReturnValue({ [SettingKey.DIFF_SURFACE]: DiffSurface.BUILT_IN });

    expect(surface()).toBe(DiffSurface.IDE);
  });

  it('falls back to the built-in surface with no IDE attached', () => {
    ideAttached.mockReturnValue(false);
    settings.mockReturnValue({ [SettingKey.DIFF_SURFACE]: DiffSurface.IDE });

    // Naming the IDE cannot conjure one to draw in.
    expect(surface()).toBe(DiffSurface.BUILT_IN);
  });
});

describe('useAutoOpenDiffEnabled', () => {
  /**
   * This one has to agree with the backend's own check, which merges. They open
   * the review on mutually exclusive occasions, so disagreeing means either two
   * reviews or none.
   */
  it('reads the merged value, so a project can turn it off', () => {
    settings.mockReturnValue({ [SettingKey.AUTO_OPEN_DIFF_ON_PERMISSION]: false });
    scopeSettings.mockReturnValue({});

    expect(autoOpen()).toBe(false);
  });

  it('treats an unset value as on', () => {
    expect(autoOpen()).toBe(true);
  });
});
