import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingKey } from '@/types/settings';
import { ComposerSendShortcut, ComposerNewlineShortcut } from '@/shared';

const updateSettingMock = vi.fn();
const updateClaudeSettingMock = vi.fn();

let mockScopeSettings: Record<string, unknown> = {};

vi.mock('@/contexts/SettingsContext', () => ({
  // Rows read project-override info through this; null = nothing overridden.
  useSettingsOrNull: () => null,
  useSettings: () => ({
    scopeSettings: mockScopeSettings,
    settings: mockScopeSettings,
    updateSetting: updateSettingMock,
    scope: 'global',
  }),
}));

vi.mock('@/contexts/ClaudeSettingsContext', () => ({
  useClaudeSettingsOrNull: () => null,
  useClaudeSettings: () => ({
    scopeSettings: {},
    updateSetting: updateClaudeSettingMock,
    scope: 'global',
  }),
}));

import { ComposerSection } from '../index';

beforeEach(() => {
  updateSettingMock.mockReset();
  updateClaudeSettingMock.mockReset();
  mockScopeSettings = {};
});

describe('ComposerSection', () => {
  it('keeps the GUI-only send shortcut in the APP store', () => {
    render(<ComposerSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Send shortcut' }));
    fireEvent.click(screen.getByRole('option', { name: 'Ctrl + Enter' }));

    expect(updateSettingMock).toHaveBeenCalledWith(
      SettingKey.COMPOSER_SEND_SHORTCUT,
      ComposerSendShortcut.ModEnter,
    );
    // Never the native store — it is not an official Claude settings key.
    expect(updateClaudeSettingMock).not.toHaveBeenCalled();
  });

  it('refuses a send shortcut that would collide with the newline one', () => {
    // Both on Enter leaves the composer unable to break a line at all, and the
    // row would be showing a value the composer does not honour.
    mockScopeSettings = { composerNewlineShortcut: ComposerNewlineShortcut.Enter };
    render(<ComposerSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Send shortcut' }));
    fireEvent.click(screen.getByRole('option', { name: 'Enter' }));

    expect(updateSettingMock).not.toHaveBeenCalled();
    expect(
      screen.getByText('This is the same combination as the newline shortcut'),
    ).toBeInTheDocument();
  });
});
