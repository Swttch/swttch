import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { SettingKey } from '@/types/settings';
import { projectValueBadge, resetFromBadge } from '../../../__tests__/projectValueBadge';

/**
 * #547: on the project tab a send or newline shortcut the project chose wears the
 * project-value badge, and the reset link in its tooltip takes it back. A
 * shortcut is two keys, the mode and the recorded combination for "custom", and
 * a project that keeps the combination after dropping the mode would carry a
 * value nothing reads, so the link removes both.
 */

const resetToGlobalMock = vi.fn();

let mockScopeSettings: Record<string, unknown> = {};

vi.mock('@/contexts/SettingsContext', () => ({
  useSettingsOrNull: () => null,
  useSettings: () => ({
    scope: 'project',
    scopeSettings: mockScopeSettings,
    settings: mockScopeSettings,
    updateSetting: vi.fn(),
    resetToGlobal: resetToGlobalMock,
  }),
}));

vi.mock('@/contexts/ClaudeSettingsContext', () => ({
  useClaudeSettingsOrNull: () => null,
  useClaudeSettings: () => ({
    scope: 'project',
    scopeSettings: {},
    settings: {},
    updateSetting: vi.fn(),
    resetToGlobal: vi.fn(),
  }),
}));

import { SendShortcutRow } from '../SendShortcutRow';
import { NewlineShortcutRow } from '../NewlineShortcutRow';

beforeEach(() => {
  resetToGlobalMock.mockReset();
  mockScopeSettings = {};
});

describe('composer shortcut rows on the project tab', () => {
  it('wears no project-value badge while the project says nothing about the send shortcut', () => {
    render(<SendShortcutRow commit={vi.fn()} error={undefined} />);

    expect(projectValueBadge()).not.toBeInTheDocument();
  });

  it('removes the send shortcut and its recorded combination together', async () => {
    mockScopeSettings = {
      [SettingKey.COMPOSER_SEND_SHORTCUT]: 'custom',
      [SettingKey.COMPOSER_SEND_SHORTCUT_CUSTOM]: 'Ctrl+Shift+Enter',
    };
    render(<SendShortcutRow commit={vi.fn()} error={undefined} />);

    await resetFromBadge();

    expect(resetToGlobalMock).toHaveBeenCalledTimes(2);
    expect(resetToGlobalMock).toHaveBeenCalledWith(SettingKey.COMPOSER_SEND_SHORTCUT);
    expect(resetToGlobalMock).toHaveBeenCalledWith(SettingKey.COMPOSER_SEND_SHORTCUT_CUSTOM);
  });

  it('removes the newline shortcut and its recorded combination together', async () => {
    mockScopeSettings = {
      [SettingKey.COMPOSER_NEWLINE_SHORTCUT]: 'custom',
      [SettingKey.COMPOSER_NEWLINE_SHORTCUT_CUSTOM]: 'Alt+Enter',
    };
    render(<NewlineShortcutRow commit={vi.fn()} error={undefined} />);

    await resetFromBadge();

    expect(resetToGlobalMock).toHaveBeenCalledTimes(2);
    expect(resetToGlobalMock).toHaveBeenCalledWith(SettingKey.COMPOSER_NEWLINE_SHORTCUT);
    expect(resetToGlobalMock).toHaveBeenCalledWith(SettingKey.COMPOSER_NEWLINE_SHORTCUT_CUSTOM);
  });
});
