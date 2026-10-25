import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { settingsState, mockClearSaveError } = vi.hoisted(() => ({
  settingsState: {
    unreadable: [] as { file: string; reason: string }[],
    saveError: null as string | null,
  },
  mockClearSaveError: vi.fn(),
}));

vi.mock('@/contexts/ClaudeSettingsContext', () => ({
  useClaudeSettings: () => ({ ...settingsState, clearSaveError: mockClearSaveError }),
}));

vi.mock('@/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string>) => (vars ? `${key} ${JSON.stringify(vars)}` : key),
  }),
}));

import { SettingsFileProblemBanner } from '../SettingsFileProblemBanner';

// #595: a settings file that could not be read made every setting look unset and every save fail,
// and nothing on screen said so. These pin down that the banner names the file and the reason.
describe('SettingsFileProblemBanner', () => {
  beforeEach(() => {
    settingsState.unreadable = [];
    settingsState.saveError = null;
    mockClearSaveError.mockReset();
  });

  it('renders nothing while every settings file reads and the last save went through', () => {
    const { container } = render(<SettingsFileProblemBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('names each unreadable file together with the reason', () => {
    settingsState.unreadable = [
      { file: 'C:\\Users\\a\\.claude\\settings.json', reason: 'EBUSY: resource busy or locked' },
      { file: 'C:\\p\\.claude\\settings.local.json', reason: 'Unexpected end of JSON input' },
    ];
    render(<SettingsFileProblemBanner />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/settings\.json.*EBUSY/s)).toBeInTheDocument();
    expect(screen.getByText(/settings\.local\.json.*Unexpected end/s)).toBeInTheDocument();
  });

  it('shows the reason of a refused save when no file is unreadable, and closes on request', () => {
    settingsState.saveError = 'EPERM: operation not permitted';
    render(<SettingsFileProblemBanner />);

    expect(screen.getByText(/settingsFileProblem\.saveFailed.*EPERM/s)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(mockClearSaveError).toHaveBeenCalledTimes(1);
  });

  it('puts the unreadable files ahead of a save error, with no close button, because the file is the cause', () => {
    settingsState.unreadable = [{ file: 'x.json', reason: 'bad' }];
    settingsState.saveError = 'refusing to overwrite x.json';
    render(<SettingsFileProblemBanner />);

    expect(screen.queryByText(/saveFailed/)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
