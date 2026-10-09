import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModelInfo } from '@/types/slashCommand';

const updateSettingMock = vi.fn();
let mockSettings: Record<string, unknown> = {};
let mockScopeSettings: Record<string, unknown> = {};
let mockScope = 'user';
let mockModels: ModelInfo[] = [];
let mockSessionModel: string | null = null;

vi.mock('@/contexts/ClaudeSettingsContext', () => ({
  useClaudeSettings: () => ({
    settings: mockSettings,
    scopeSettings: mockScopeSettings,
    updateSetting: updateSettingMock,
    scope: mockScope,
  }),
  useClaudeSettingsOrNull: () => null,
}));

// The plugin's own settings, which the allow-all row reads (the rows above read
// Claude's native ones through the mock before this).
const requestEnableByDefaultMock = vi.fn();
const disableByDefaultMock = vi.fn();
let mockAppScopeSettings: Record<string, unknown> = {};
let mockAppScope: 'global' | 'project' = 'global';
let mockAppOverrides: string[] = [];
let mockSponsorLocked = false;
const followSponsorOfferMock = vi.fn();
const reportSponsorGateMock = vi.fn();

vi.mock('@/utils/followSponsorOffer', () => ({
  followSponsorOffer: (...args: unknown[]) => followSponsorOfferMock(...args),
}));
vi.mock('@/utils/reportSponsorGate', () => ({
  reportSponsorGate: (...args: unknown[]) => reportSponsorGateMock(...args),
}));

vi.mock('@/contexts/SettingsContext', () => {
  const value = () => ({
    scope: mockAppScope,
    scopeSettings: mockAppScopeSettings,
    overrides: mockAppOverrides,
  });
  return { useSettings: value, useSettingsOrNull: value };
});

vi.mock('@/contexts/AllowAllCommandsContext', () => ({
  useAllowAllCommands: () => ({
    requestEnableByDefault: requestEnableByDefaultMock,
    disableByDefault: disableByDefaultMock,
    sponsorLocked: mockSponsorLocked,
  }),
}));

vi.mock('@/contexts/CliConfigContext', () => ({
  useCliConfig: () => ({
    controlResponse: { response: { response: { models: mockModels } } },
  }),
}));

vi.mock('@/contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({ sessionModel: mockSessionModel }),
}));

import { PermissionsSettings } from '../index';

const AUTO_MODEL: ModelInfo = ModelInfo.from({
  value: 'sonnet',
  displayName: 'Sonnet',
  description: 'Sonnet',
  supportsAutoMode: true,
});
const NO_AUTO_MODEL: ModelInfo = ModelInfo.from({
  value: 'haiku',
  displayName: 'Haiku',
  description: 'Haiku',
  supportsAutoMode: false,
});

/**
 * Open the "Default Input Mode" dropdown and read the labels it offers. The
 * selected option renders a trailing check marker, so compare on the label only.
 */
function openDefaultModeOptions(): string[] {
  fireEvent.click(screen.getByRole('button', { name: /Default Input Mode/i }));
  return screen.getAllByRole('option').map((o) => (o.textContent ?? '').replace(/✓/g, '').trim());
}

beforeEach(() => {
  requestEnableByDefaultMock.mockReset();
  disableByDefaultMock.mockReset();
  mockAppScopeSettings = {};
  mockAppScope = 'global';
  mockAppOverrides = [];
  mockSponsorLocked = false;
  followSponsorOfferMock.mockReset();
  reportSponsorGateMock.mockReset();
  updateSettingMock.mockReset();
  mockSettings = {};
  mockScopeSettings = {};
  mockScope = 'user';
  mockModels = [AUTO_MODEL, NO_AUTO_MODEL];
  mockSessionModel = 'sonnet';
});

describe('PermissionsSettings — default mode offers auto (#272)', () => {
  it('offers Auto mode when the current model supports it', () => {
    render(<PermissionsSettings />);
    expect(openDefaultModeOptions()).toContain('Auto mode');
  });

  it('hides Auto mode when the current model does not support it', () => {
    mockSessionModel = 'haiku';
    render(<PermissionsSettings />);
    expect(openDefaultModeOptions()).not.toContain('Auto mode');
  });

  it('hides Auto mode when admin policy disables it, even on a supporting model', () => {
    mockSettings = { permissions: { disableAutoMode: 'disable' } };
    render(<PermissionsSettings />);
    expect(openDefaultModeOptions()).not.toContain('Auto mode');
  });

  it('keeps Auto mode listed when it is the saved value but model info has not arrived', () => {
    // Empty catalog => availability unknown. A saved auto must stay listed,
    // otherwise the dropdown silently drops the user's stored value.
    mockModels = [];
    mockSessionModel = null;
    mockScopeSettings = { permissions: { defaultMode: 'auto' } };
    render(<PermissionsSettings />);
    expect(openDefaultModeOptions()).toContain('Auto mode');
  });

  it('persists Auto mode as the CLI defaultMode flag when picked', () => {
    render(<PermissionsSettings />);
    openDefaultModeOptions();
    fireEvent.click(screen.getByRole('option', { name: 'Auto mode' }));
    expect(updateSettingMock).toHaveBeenCalledWith(
      'permissions',
      expect.objectContaining({ defaultMode: 'auto' }),
    );
  });
});

describe('PermissionsSettings — one card', () => {
  it('draws its rows in a single section rather than one section per row', () => {
    const { container } = render(<PermissionsSettings />);

    expect(container.querySelectorAll('section')).toHaveLength(1);
    expect(screen.getByText('Disable Bypass Mode')).toBeInTheDocument();
    expect(screen.getByText('Default Input Mode')).toBeInTheDocument();
    expect(screen.getByText('Allow all command in all sessions')).toBeInTheDocument();
  });
});

describe('PermissionsSettings — allow all command in all sessions', () => {
  const SWITCH = 'Allow all command in all sessions';

  it('shows the stored default', () => {
    mockAppScopeSettings = { allowAllCommandsByDefault: true };
    render(<PermissionsSettings />);

    expect(screen.getByRole('switch', { name: SWITCH })).toHaveAttribute('aria-checked', 'true');
  });

  it('asks the context to enable it, which owns the sponsor check and the warning', () => {
    render(<PermissionsSettings />);

    fireEvent.click(screen.getByRole('switch', { name: SWITCH }));

    expect(requestEnableByDefaultMock).toHaveBeenCalledTimes(1);
    expect(disableByDefaultMock).not.toHaveBeenCalled();
  });

  it('turns it off without a warning', () => {
    mockAppScopeSettings = { allowAllCommandsByDefault: true };
    render(<PermissionsSettings />);

    fireEvent.click(screen.getByRole('switch', { name: SWITCH }));

    expect(disableByDefaultMock).toHaveBeenCalledTimes(1);
    expect(requestEnableByDefaultMock).not.toHaveBeenCalled();
  });

  it('is inert on the project tab, since only the user settings can hold it', () => {
    mockAppScope = 'project';
    render(<PermissionsSettings />);

    // The guard takes pointer events away; jsdom does not apply them, so the
    // wrapper that does is what is checked.
    expect(screen.getByRole('switch', { name: SWITCH }).closest('.pointer-events-none')).not.toBeNull();
  });
});

describe('PermissionsSettings — allow all command in all sessions, for someone who is not a sponsor', () => {
  const SWITCH = 'Allow all command in all sessions';

  it('keeps the row on screen with the switch dimmed and off, even if a value is stored', () => {
    mockSponsorLocked = true;
    mockAppScopeSettings = { allowAllCommandsByDefault: true };
    render(<PermissionsSettings />);

    const toggle = screen.getByRole('switch', { name: SWITCH });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle.closest('.opacity-60')).not.toBeNull();
  });

  it('opens the Sponsor page when the switch is pressed, instead of asking for the warning', () => {
    mockSponsorLocked = true;
    render(<PermissionsSettings />);

    fireEvent.click(screen.getByRole('switch', { name: SWITCH }));

    expect(followSponsorOfferMock).toHaveBeenCalledTimes(1);
    expect(followSponsorOfferMock).toHaveBeenCalledWith('allowallcommands', 'settings_toggle');
    expect(requestEnableByDefaultMock).not.toHaveBeenCalled();
    expect(disableByDefaultMock).not.toHaveBeenCalled();
  });

  it('reports the offer as seen once, when the row is on screen', () => {
    mockSponsorLocked = true;
    render(<PermissionsSettings />);

    expect(reportSponsorGateMock).toHaveBeenCalledTimes(1);
    expect(reportSponsorGateMock).toHaveBeenCalledWith('allowallcommands', 'seen', { from: 'settings_toggle' });
  });

  it('does not report it on the project tab, where the row is inert', () => {
    mockSponsorLocked = true;
    mockAppScope = 'project';
    render(<PermissionsSettings />);

    expect(reportSponsorGateMock).not.toHaveBeenCalled();
  });

  it('shows no lock and reports nothing to a sponsor', () => {
    render(<PermissionsSettings />);

    const toggle = screen.getByRole('switch', { name: SWITCH });
    expect(toggle.closest('.opacity-60')).toBeNull();
    expect(reportSponsorGateMock).not.toHaveBeenCalled();
  });
});
