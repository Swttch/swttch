import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettingKey, OPEN_FILES_WITH_CUSTOM_VALUE } from '@/types/settings';

const updateSettingMock = vi.fn();
let mockSettings: Record<string, unknown> = {};
let mockIdeAttached = false;
let mockIdeProduct = '';
const sendMock = vi.fn();

vi.mock('@/contexts/SettingsContext', () => ({
  // Rows read project-override info through this; null = nothing overridden.
  useSettingsOrNull: () => null,
  useSettings: () => ({
    settings: mockSettings,
    updateSetting: updateSettingMock,
    ideAttached: mockIdeAttached,
    ideProduct: mockIdeProduct,
  }),
}));

vi.mock('@/hooks/useBridge', () => ({
  useBridge: () => ({ send: sendMock }),
}));

import { OpenFilesWithRow } from '../OpenFilesWithRow';

beforeEach(() => {
  updateSettingMock.mockReset();
  sendMock.mockReset();
  sendMock.mockResolvedValue({
    editors: [{ id: 'webstorm', name: 'WebStorm', path: '/Applications/WebStorm.app' }],
  });
  mockSettings = {
    [SettingKey.OPEN_FILES_WITH]: null,
    [SettingKey.OPEN_FILES_WITH_CUSTOM]: null,
  };
  mockIdeAttached = false;
  mockIdeProduct = '';
});

describe('OpenFilesWithRow (CLI)', () => {
  it('fixes to the attached IDE product name, with no picker or detection round-trip', () => {
    mockIdeAttached = true;
    mockIdeProduct = 'WebStorm';
    render(<OpenFilesWithRow />);

    expect(screen.getByText('WebStorm')).toBeInTheDocument();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('falls back to a generic label when the IDE product is unknown', () => {
    mockIdeAttached = true;
    mockIdeProduct = '';
    render(<OpenFilesWithRow />);

    // jetbrainsFallback ("Connected IDE") is shown instead of an empty value.
    expect(screen.getByText('Connected IDE')).toBeInTheDocument();
  });

  it('shows a picker with system default + detected editors when standalone', async () => {
    render(<OpenFilesWithRow />);

    expect(await screen.findByText('System default')).toBeInTheDocument();
    expect(sendMock).toHaveBeenCalled();
  });

  it('shows the custom Path/Arguments inputs when openFilesWith is $custom', async () => {
    mockSettings = {
      [SettingKey.OPEN_FILES_WITH]: OPEN_FILES_WITH_CUSTOM_VALUE,
      [SettingKey.OPEN_FILES_WITH_CUSTOM]: { path: '', arguments: '%TARGET_PATH%' },
    };
    render(<OpenFilesWithRow />);

    // Arguments input is pre-filled with the target-path token.
    expect(await screen.findByDisplayValue('%TARGET_PATH%')).toBeInTheDocument();
  });
});
