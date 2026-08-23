/**
 * Where the review may be drawn over the chat rather than in a window.
 *
 * The rule is about room: an overlay inherits the space of whatever it covers,
 * and an IDE sidebar is a column. A side-by-side diff laid over one would be
 * unreadable in the very surface it is meant to be read in.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { HostMode, SettingKey } from '@/types/settings';

const isJetBrains = vi.fn();
vi.mock('@/config/environment', () => ({ isJetBrains: () => isJetBrains() }));

const settings = vi.fn();
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: settings() }),
}));

import { useDiffOverlayAllowed } from '../useDiffOverlayAllowed';

const allowed = () => renderHook(() => useDiffOverlayAllowed()).result.current;

beforeEach(() => {
  isJetBrains.mockReturnValue(true);
  settings.mockReturnValue({ [SettingKey.HOST_MODE]: HostMode.EDITOR_TAB });
});

describe('useDiffOverlayAllowed', () => {
  it('allows it in a browser', () => {
    // Nothing to be too narrow: the overlay covers the whole page.
    isJetBrains.mockReturnValue(false);
    settings.mockReturnValue({ [SettingKey.HOST_MODE]: HostMode.TOOL_WINDOW });

    expect(allowed()).toBe(true);
  });

  it('allows it when the chat is in an editor panel', () => {
    expect(allowed()).toBe(true);
  });

  it('refuses it when the chat is in the sidebar', () => {
    settings.mockReturnValue({ [SettingKey.HOST_MODE]: HostMode.TOOL_WINDOW });

    expect(allowed()).toBe(false);
  });

  /*
   * Nobody has to have opened this setting for the review to work. Reading an
   * absent value as the sidebar would take the choice away from every user who
   * never touched it — the stored default is the panel.
   */
  it('reads an unset location as the panel', () => {
    settings.mockReturnValue({});

    expect(allowed()).toBe(true);
  });
});
