import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingKey, UiDirection } from '@/types/settings';

// ---------------------------------------------------------------------------
// Mocks: SettingsContext now owns uiLanguage AND uiDirection (uiLanguage moved
// out of the native ClaudeSettings). GeneralSettings reads everything from
// useSettings. Child rows unrelated to the language↔RTL auto-sync are stubbed.
// ---------------------------------------------------------------------------

const updateSettingMock = vi.fn();
const resetToGlobalMock = vi.fn();
const updateSettingWithScopeMock = vi.fn();

let mockScope: 'global' | 'project' = 'global';
let mockScopeSettings: Record<string, unknown> = {};

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({
    scopeSettings: mockScopeSettings,
    updateSetting: updateSettingMock,
    scope: mockScope,
    resetToGlobal: resetToGlobalMock,
    updateSettingWithScope: updateSettingWithScopeMock,
  }),
}));

// The following rows pull in unrelated contexts (WorkingDir, bridge, IDE
// detection, …) that are irrelevant to the language↔RTL auto-sync logic
// under test here, so they are stubbed out entirely.
vi.mock('../HostModeRow', () => ({ HostModeRow: () => null }));
vi.mock('../OpenSettingsRow', () => ({ OpenSettingsRow: () => null }));
vi.mock('../ChatPaginationRow', () => ({ ChatPaginationRow: () => null }));
vi.mock('../UiDirectionRow', () => ({ UiDirectionRow: () => null }));
vi.mock('../ClaudeConfigDirRow', () => ({ ClaudeConfigDirRow: () => null }));
// FileSuggestionRow reads useClaudeSettings (fileSuggestion is a native key);
// it is unrelated to the language↔RTL sync under test, so stub it out.
vi.mock('../FileSuggestionRow', () => ({ FileSuggestionRow: () => null }));
// The auto-resume default row gates on sponsor status (react-query); mock it.
vi.mock('@/hooks/queries/useSponsorStatus', () => ({ useSponsorStatus: () => ({ isSponsor: false }) }));

import { GeneralSettings } from '../index';

beforeEach(() => {
  updateSettingMock.mockReset();
  resetToGlobalMock.mockReset();
  updateSettingWithScopeMock.mockReset();
  mockScope = 'global';
  mockScopeSettings = {};
});

const getTrigger = () => screen.getByRole('button', { name: 'Interface Language' }) as HTMLButtonElement;

function selectLanguage(label: string) {
  fireEvent.click(getTrigger());
  fireEvent.click(screen.getByRole('option', { name: label }));
}

describe('GeneralSettings — interface language ↔ RTL auto-sync', () => {
  it('LTR → RTL: switching to a RTL language turns uiDirection on', () => {
    mockScopeSettings = { uiLanguage: 'english' };
    render(<GeneralSettings />);

    selectLanguage('فارسی'); // persian

    expect(updateSettingWithScopeMock).toHaveBeenCalledTimes(1);
    expect(updateSettingWithScopeMock).toHaveBeenCalledWith(SettingKey.UI_DIRECTION, UiDirection.RTL, 'global');
    expect(updateSettingMock).toHaveBeenCalledWith('uiLanguage', 'persian');
  });

  it('RTL → LTR: switching to a LTR language turns uiDirection off', () => {
    mockScopeSettings = { uiLanguage: 'arabic' };
    render(<GeneralSettings />);

    selectLanguage('English');

    expect(updateSettingWithScopeMock).toHaveBeenCalledTimes(1);
    expect(updateSettingWithScopeMock).toHaveBeenCalledWith(SettingKey.UI_DIRECTION, UiDirection.LTR, 'global');
    expect(updateSettingMock).toHaveBeenCalledWith('uiLanguage', 'english');
  });

  it('LTR → LTR: uiDirection is left untouched', () => {
    mockScopeSettings = { uiLanguage: 'english' };
    render(<GeneralSettings />);

    selectLanguage('한국어'); // korean

    expect(updateSettingWithScopeMock).not.toHaveBeenCalled();
    expect(updateSettingMock).toHaveBeenCalledWith('uiLanguage', 'korean');
  });

  it('RTL → RTL: uiDirection is left untouched', () => {
    mockScopeSettings = { uiLanguage: 'persian' };
    render(<GeneralSettings />);

    selectLanguage('العربية'); // arabic

    expect(updateSettingWithScopeMock).not.toHaveBeenCalled();
    expect(updateSettingMock).toHaveBeenCalledWith('uiLanguage', 'arabic');
  });

  it('NOT_SET → RTL: NOT_SET (project scope inheriting global LTR) is treated as LTR, so selecting a RTL language still turns uiDirection on', () => {
    mockScope = 'project';
    mockScopeSettings = {}; // rawUiLanguage undefined + scope 'project' => NOT_SET

    render(<GeneralSettings />);

    selectLanguage('فارسی'); // persian

    expect(updateSettingWithScopeMock).toHaveBeenCalledTimes(1);
    expect(updateSettingWithScopeMock).toHaveBeenCalledWith(SettingKey.UI_DIRECTION, UiDirection.RTL, 'global');
    expect(updateSettingMock).toHaveBeenCalledWith('uiLanguage', 'persian');
  });

  it('NOT_SET → LTR: NOT_SET (project scope inheriting global LTR) to a LTR language leaves uiDirection untouched', () => {
    mockScope = 'project';
    mockScopeSettings = {}; // rawUiLanguage undefined + scope 'project' => NOT_SET

    render(<GeneralSettings />);

    selectLanguage('한국어'); // korean

    expect(updateSettingWithScopeMock).not.toHaveBeenCalled();
    expect(updateSettingMock).toHaveBeenCalledWith('uiLanguage', 'korean');
  });

  it('choosing "Not set" resets to global instead of touching uiDirection', () => {
    mockScope = 'project';
    mockScopeSettings = { uiLanguage: 'persian' };
    render(<GeneralSettings />);

    fireEvent.click(getTrigger());
    fireEvent.click(screen.getByRole('option', { name: /Not set/i }));

    expect(resetToGlobalMock).toHaveBeenCalledWith('uiLanguage');
    expect(updateSettingWithScopeMock).not.toHaveBeenCalled();
    expect(updateSettingMock).not.toHaveBeenCalled();
  });
});
