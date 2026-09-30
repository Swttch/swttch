import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const updateClaudeSettingMock = vi.fn();
let mockClaudeScopeSettings: Record<string, unknown> = {};

vi.mock('@/contexts/SettingsContext', () => ({
  useSettingsOrNull: () => null,
}));

vi.mock('@/contexts/ClaudeSettingsContext', () => ({
  useClaudeSettingsOrNull: () => null,
  useClaudeSettings: () => ({
    scopeSettings: mockClaudeScopeSettings,
    updateSetting: updateClaudeSettingMock,
    scope: 'global',
  }),
}));

import { ShowThinkingSummariesRow } from '../ShowThinkingSummariesRow';

beforeEach(() => {
  updateClaudeSettingMock.mockReset();
  mockClaudeScopeSettings = {};
});

const toggle = () => screen.getByRole('switch', { name: 'Show thinking summaries' });

/**
 * The switch only reads and writes the official `showThinkingSummaries` key, the
 * one a terminal user sets. The backend decides the spawn flag from it (#496).
 */
describe('ShowThinkingSummariesRow', () => {
  it('reads as off when the setting is absent, the CLI default', () => {
    render(<ShowThinkingSummariesRow />);
    expect(toggle().getAttribute('aria-checked')).toBe('false');
  });

  it('reflects a terminal user\'s showThinkingSummaries: true', () => {
    mockClaudeScopeSettings = { showThinkingSummaries: true };
    render(<ShowThinkingSummariesRow />);
    expect(toggle().getAttribute('aria-checked')).toBe('true');
  });

  it('writes the switch to the native store under the official name', () => {
    render(<ShowThinkingSummariesRow />);
    fireEvent.click(toggle());
    expect(updateClaudeSettingMock).toHaveBeenCalledWith('showThinkingSummaries', true);
  });
});
