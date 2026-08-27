import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingKey, UiDirection } from '@/types/settings';

// ---------------------------------------------------------------------------
// Mocks: SettingsContext owns uiLanguage AND uiDirection (our own GUI keys),
// while ClaudeSettingsContext owns the official-schema keys the page also edits
// (language, respectGitignore). Child rows unrelated to the language↔RTL
// auto-sync are stubbed.
// ---------------------------------------------------------------------------

const updateSettingMock = vi.fn();
const resetToGlobalMock = vi.fn();
const updateSettingWithScopeMock = vi.fn();
const updateClaudeSettingMock = vi.fn();

let mockScope: 'global' | 'project' = 'global';
let mockScopeSettings: Record<string, unknown> = {};
let mockClaudeScopeSettings: Record<string, unknown> = {};

vi.mock('@/contexts/SettingsContext', () => ({
  // Rows read project-override info through this; null = nothing overridden.
  useSettingsOrNull: () => null,
  useSettings: () => ({
    scopeSettings: mockScopeSettings,
    // Rows that decide behaviour read the merged values, not the scope
    // being edited (#359). Same object here: this suite is about what the
    // screen writes, not about merging.
    settings: mockScopeSettings,
    updateSetting: updateSettingMock,
    scope: mockScope,
    resetToGlobal: resetToGlobalMock,
    updateSettingWithScope: updateSettingWithScopeMock,
  }),
}));

vi.mock('@/contexts/ClaudeSettingsContext', () => ({
  // Rows read project-override info through this; null = nothing overridden.
  useClaudeSettingsOrNull: () => null,
  useClaudeSettings: () => ({
    scopeSettings: mockClaudeScopeSettings,
    updateSetting: updateClaudeSettingMock,
    scope: mockScope,
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
// Voice settings are their own section with their own tests; here they would
// only drag the bridge (kit version lookup) into a test about RTL syncing.
vi.mock('../VoiceSection', () => ({ VoiceSection: () => null }));
// The auto-resume default row gates on sponsor status (react-query); mock it.
vi.mock('@/hooks/queries/useSponsorStatus', () => ({ useSponsorStatus: () => ({ isSponsor: false }) }));

import { GeneralSettings } from '../index';

beforeEach(() => {
  updateSettingMock.mockReset();
  resetToGlobalMock.mockReset();
  updateSettingWithScopeMock.mockReset();
  updateClaudeSettingMock.mockReset();
  mockScope = 'global';
  mockScopeSettings = {};
  mockClaudeScopeSettings = {};
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

// Which store a setting is written to is decided by the official Claude Code
// schema: keys in it must go to ~/.claude/settings.json so the CLI reads them,
// keys outside it must stay in our app settings so the native file is not
// polluted. Both directions were once wrong, so they are pinned here.
describe('GeneralSettings — settings are written to the correct store', () => {
  it('writes Claude\'s response language to the NATIVE store (official `language` key)', () => {
    mockClaudeScopeSettings = { language: 'english' };
    render(<GeneralSettings />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Language' }), {
      target: { value: 'korean' },
    });

    expect(updateClaudeSettingMock).toHaveBeenCalledWith('language', 'korean');
    // Never the app store — that would leave the CLI unable to read it.
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it('writes the .gitignore toggle to the NATIVE store under the official `respectGitignore` name', () => {
    mockClaudeScopeSettings = { respectGitignore: false };
    render(<GeneralSettings />);

    fireEvent.click(screen.getByRole('switch', { name: /gitignore/i }));

    expect(updateClaudeSettingMock).toHaveBeenCalledWith('respectGitignore', true);
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it('keeps the GUI-only send-modifier toggle in the APP store', () => {
    mockScopeSettings = { useCtrlEnterToSend: false };
    render(<GeneralSettings />);

    fireEvent.click(screen.getByRole('switch', { name: /Enter To Send/i }));

    expect(updateSettingMock).toHaveBeenCalledWith(SettingKey.USE_CTRL_ENTER_TO_SEND, true);
    // Never the native store — it is not an official Claude settings key.
    expect(updateClaudeSettingMock).not.toHaveBeenCalled();
  });
});
