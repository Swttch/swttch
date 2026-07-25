import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const updateSettingMock = vi.fn();
let mockScopeSettings: Record<string, unknown> = {};

vi.mock('@/contexts/ClaudeSettingsContext', () => ({
  useClaudeSettings: () => ({
    scopeSettings: mockScopeSettings,
    updateSetting: updateSettingMock,
  }),
}));

import { FileSuggestionRow } from '../FileSuggestionRow';

beforeEach(() => {
  updateSettingMock.mockReset();
  mockScopeSettings = {};
});

describe('FileSuggestionRow (General)', () => {
  it('shows the stored command in the input', () => {
    mockScopeSettings = {
      fileSuggestion: { type: 'command', command: 'git ls-files --recurse-submodules' },
    };
    render(<FileSuggestionRow />);

    expect(screen.getByDisplayValue('git ls-files --recurse-submodules')).toBeInTheDocument();
  });

  it('saves a {type:"command", command} object on blur after editing', () => {
    render(<FileSuggestionRow />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: 'rg --files' } });
    fireEvent.blur(input);

    expect(updateSettingMock).toHaveBeenCalledWith('fileSuggestion', {
      type: 'command',
      command: 'rg --files',
    });
  });

  it('trims surrounding whitespace before saving', () => {
    render(<FileSuggestionRow />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: '  rg --files  ' } });
    fireEvent.blur(input);

    expect(updateSettingMock).toHaveBeenCalledWith('fileSuggestion', {
      type: 'command',
      command: 'rg --files',
    });
  });

  it('clears the setting (null) when the field is emptied', () => {
    mockScopeSettings = { fileSuggestion: { type: 'command', command: 'rg --files' } };
    render(<FileSuggestionRow />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    expect(updateSettingMock).toHaveBeenCalledWith('fileSuggestion', null);
  });

  it('does not save when the value is unchanged', () => {
    mockScopeSettings = { fileSuggestion: { type: 'command', command: 'rg --files' } };
    render(<FileSuggestionRow />);
    const input = screen.getByRole('textbox');

    fireEvent.blur(input);

    expect(updateSettingMock).not.toHaveBeenCalled();
  });
});
