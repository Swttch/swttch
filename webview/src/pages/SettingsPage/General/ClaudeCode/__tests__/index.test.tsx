import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingKey, UiDirection } from '@/types/settings';

// ---------------------------------------------------------------------------
// Mocks: SettingsContext owns uiLanguage AND uiDirection (our own GUI keys),
// while ClaudeSettingsContext owns the official-schema keys this section also
// edits (language, respectGitignore). Rows unrelated to what is under test are
// stubbed.
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
    // Rows that decide behaviour read the merged values, not the scope being
    // edited (#359). Same object here: this suite is about what the screen
    // writes, not about merging.
    settings: mockScopeSettings,
    updateSetting: updateSettingMock,
    scope: mockScope,
    resetToGlobal: resetToGlobalMock,
    updateSettingWithScope: updateSettingWithScopeMock,
  }),
}));

vi.mock('@/contexts/ClaudeSettingsContext', () => ({
  useClaudeSettingsOrNull: () => null,
  useClaudeSettings: () => ({
    scopeSettings: mockClaudeScopeSettings,
    updateSetting: updateClaudeSettingMock,
    scope: mockScope,
  }),
}));

// These rows pull in unrelated contexts (WorkingDir, bridge, IDE detection, …)
// that have nothing to do with what is under test here.
vi.mock('../HostModeRow', () => ({ HostModeRow: () => null }));
vi.mock('../OpenSettingsRow', () => ({ OpenSettingsRow: () => null }));
vi.mock('../ChatPaginationRow', () => ({ ChatPaginationRow: () => null }));
vi.mock('../UiDirectionRow', () => ({ UiDirectionRow: () => null }));
vi.mock('../ClaudeConfigDirRow', () => ({ ClaudeConfigDirRow: () => null }));
vi.mock('../FileSuggestionRow', () => ({ FileSuggestionRow: () => null }));
// The auto-resume row gates on sponsor status (react-query).
vi.mock('@/hooks/queries/useSponsorStatus', () => ({
  useSponsorStatus: () => ({ isSponsor: false }),
}));

import { ClaudeCodeSection } from '../index';

beforeEach(() => {
  updateSettingMock.mockReset();
  resetToGlobalMock.mockReset();
  updateSettingWithScopeMock.mockReset();
  updateClaudeSettingMock.mockReset();
  mockScope = 'global';
  mockScopeSettings = {};
  mockClaudeScopeSettings = {};
});

const getTrigger = () =>
  screen.getByRole('button', { name: 'Interface Language' }) as HTMLButtonElement;

function selectLanguage(label: string) {
  fireEvent.click(getTrigger());
  fireEvent.click(screen.getByRole('option', { name: label }));
}

describe('ClaudeCodeSection — interface language ↔ RTL auto-sync', () => {
  it('LTR → RTL: switching to a RTL language turns uiDirection on', () => {
    mockScopeSettings = { uiLanguage: 'english' };
    render(<ClaudeCodeSection />);

    selectLanguage('فارسی'); // persian

    expect(updateSettingWithScopeMock).toHaveBeenCalledTimes(1);
    expect(updateSettingWithScopeMock).toHaveBeenCalledWith(SettingKey.UI_DIRECTION, UiDirection.RTL, 'global');
    expect(updateSettingMock).toHaveBeenCalledWith('uiLanguage', 'persian');
  });

  it('RTL → LTR: switching to a LTR language turns uiDirection off', () => {
    mockScopeSettings = { uiLanguage: 'arabic' };
    render(<ClaudeCodeSection />);

    selectLanguage('English');

    expect(updateSettingWithScopeMock).toHaveBeenCalledTimes(1);
    expect(updateSettingWithScopeMock).toHaveBeenCalledWith(SettingKey.UI_DIRECTION, UiDirection.LTR, 'global');
    expect(updateSettingMock).toHaveBeenCalledWith('uiLanguage', 'english');
  });

  it('LTR → LTR: uiDirection is left untouched', () => {
    mockScopeSettings = { uiLanguage: 'english' };
    render(<ClaudeCodeSection />);

    selectLanguage('한국어'); // korean

    expect(updateSettingWithScopeMock).not.toHaveBeenCalled();
    expect(updateSettingMock).toHaveBeenCalledWith('uiLanguage', 'korean');
  });

  it('RTL → RTL: uiDirection is left untouched', () => {
    mockScopeSettings = { uiLanguage: 'persian' };
    render(<ClaudeCodeSection />);

    selectLanguage('العربية'); // arabic

    expect(updateSettingWithScopeMock).not.toHaveBeenCalled();
    expect(updateSettingMock).toHaveBeenCalledWith('uiLanguage', 'arabic');
  });

  it('NOT_SET → RTL: NOT_SET (project scope inheriting global LTR) is treated as LTR, so selecting a RTL language still turns uiDirection on', () => {
    mockScope = 'project';
    mockScopeSettings = {}; // rawUiLanguage undefined + scope 'project' => NOT_SET

    render(<ClaudeCodeSection />);

    selectLanguage('فارسی'); // persian

    expect(updateSettingWithScopeMock).toHaveBeenCalledTimes(1);
    expect(updateSettingWithScopeMock).toHaveBeenCalledWith(SettingKey.UI_DIRECTION, UiDirection.RTL, 'global');
    expect(updateSettingMock).toHaveBeenCalledWith('uiLanguage', 'persian');
  });

  it('NOT_SET → LTR: NOT_SET (project scope inheriting global LTR) to a LTR language leaves uiDirection untouched', () => {
    mockScope = 'project';
    mockScopeSettings = {}; // rawUiLanguage undefined + scope 'project' => NOT_SET

    render(<ClaudeCodeSection />);

    selectLanguage('한국어'); // korean

    expect(updateSettingWithScopeMock).not.toHaveBeenCalled();
    expect(updateSettingMock).toHaveBeenCalledWith('uiLanguage', 'korean');
  });

  it('choosing "Not set" resets to global instead of touching uiDirection', () => {
    mockScope = 'project';
    mockScopeSettings = { uiLanguage: 'persian' };
    render(<ClaudeCodeSection />);

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
describe('ClaudeCodeSection — settings are written to the correct store', () => {
  it("writes Claude's response language to the NATIVE store (official `language` key)", () => {
    mockClaudeScopeSettings = { language: 'english' };
    render(<ClaudeCodeSection />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Language' }), {
      target: { value: 'korean' },
    });

    expect(updateClaudeSettingMock).toHaveBeenCalledWith('language', 'korean');
    // Never the app store — that would leave the CLI unable to read it.
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it('writes the .gitignore toggle to the NATIVE store under the official `respectGitignore` name', () => {
    mockClaudeScopeSettings = { respectGitignore: false };
    render(<ClaudeCodeSection />);

    fireEvent.click(screen.getByRole('switch', { name: /gitignore/i }));

    expect(updateClaudeSettingMock).toHaveBeenCalledWith('respectGitignore', true);
    expect(updateSettingMock).not.toHaveBeenCalled();
  });
});
