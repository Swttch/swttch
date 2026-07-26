import { describe, it, expect, vi, beforeEach } from 'vitest';

// The migration copies GUI-only keys out of the native Claude settings into the
// app settings and then deletes them from the native files. We mock both
// settings modules so the test asserts the orchestration (copy → delete,
// idempotency, defensive failure) without touching the filesystem.
vi.mock('../claude-settings', () => ({
  readClaudeSettings: vi.fn(),
  saveClaudeSetting: vi.fn(),
}));

vi.mock('../settings', () => ({
  saveSettingToFile: vi.fn(),
}));

import { readClaudeSettings, saveClaudeSetting } from '../claude-settings';
import { saveSettingToFile } from '../settings';
import { migrateGuiKeysFromClaudeSettings, MIGRATED_GUI_KEYS } from '../settings-migration';

const mockReadClaudeSettings = vi.mocked(readClaudeSettings);
const mockSaveClaudeSetting = vi.mocked(saveClaudeSetting);
const mockSaveSettingToFile = vi.mocked(saveSettingToFile);

describe('migrateGuiKeysFromClaudeSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveSettingToFile.mockResolvedValue({ status: 'ok' });
    mockSaveClaudeSetting.mockResolvedValue({ status: 'ok' });
  });

  it('exposes the six GUI-only keys as the migration set', () => {
    expect([...MIGRATED_GUI_KEYS].sort()).toEqual(
      [
        'autoResumeOnLimit',
        'focusInputOnEditorContext',
        'language',
        'respectGitignoreForContext',
        'uiLanguage',
        'useCtrlEnterToSend',
      ].sort(),
    );
  });

  it('copies each present GUI key into app settings then removes it from native', async () => {
    mockReadClaudeSettings.mockResolvedValue({
      uiLanguage: 'korean',
      useCtrlEnterToSend: true,
      // native keys that must be left alone:
      model: 'claude-opus-4-6',
      permissions: { defaultMode: 'auto' },
    });

    await migrateGuiKeysFromClaudeSettings();

    // App-settings copy for exactly the two present GUI keys.
    expect(mockSaveSettingToFile).toHaveBeenCalledTimes(2);
    expect(mockSaveSettingToFile).toHaveBeenCalledWith('uiLanguage', 'korean');
    expect(mockSaveSettingToFile).toHaveBeenCalledWith('useCtrlEnterToSend', true);

    // Native deletion for exactly those two keys — never model/permissions.
    expect(mockSaveClaudeSetting).toHaveBeenCalledTimes(2);
    expect(mockSaveClaudeSetting).toHaveBeenCalledWith('uiLanguage', null);
    expect(mockSaveClaudeSetting).toHaveBeenCalledWith('useCtrlEnterToSend', null);
    expect(mockSaveClaudeSetting).not.toHaveBeenCalledWith('model', null);
    expect(mockSaveClaudeSetting).not.toHaveBeenCalledWith('permissions', null);
  });

  it('migrates all six keys including falsy values (false / empty are still values)', async () => {
    mockReadClaudeSettings.mockResolvedValue({
      uiLanguage: 'english',
      language: 'japanese',
      useCtrlEnterToSend: false,
      focusInputOnEditorContext: false,
      respectGitignoreForContext: true,
      autoResumeOnLimit: false,
    });

    await migrateGuiKeysFromClaudeSettings();

    expect(mockSaveSettingToFile).toHaveBeenCalledTimes(6);
    expect(mockSaveClaudeSetting).toHaveBeenCalledTimes(6);
    for (const key of MIGRATED_GUI_KEYS) {
      expect(mockSaveClaudeSetting).toHaveBeenCalledWith(key, null);
    }
  });

  it('is a no-op when no GUI keys are present (already migrated / never set)', async () => {
    mockReadClaudeSettings.mockResolvedValue({
      model: 'claude-opus-4-6',
      permissions: { defaultMode: 'auto' },
    });

    await migrateGuiKeysFromClaudeSettings();

    expect(mockSaveSettingToFile).not.toHaveBeenCalled();
    expect(mockSaveClaudeSetting).not.toHaveBeenCalled();
  });

  it('does NOT delete the native key when the app-settings copy fails', async () => {
    mockReadClaudeSettings.mockResolvedValue({ uiLanguage: 'korean' });
    mockSaveSettingToFile.mockResolvedValue({ status: 'error', error: 'disk full' });

    await migrateGuiKeysFromClaudeSettings();

    expect(mockSaveSettingToFile).toHaveBeenCalledWith('uiLanguage', 'korean');
    expect(mockSaveClaudeSetting).not.toHaveBeenCalled();
  });

  it('resolves without throwing when reading native settings fails (non-fatal)', async () => {
    mockReadClaudeSettings.mockRejectedValue(new Error('read failed'));

    await expect(migrateGuiKeysFromClaudeSettings()).resolves.toBeUndefined();
    expect(mockSaveSettingToFile).not.toHaveBeenCalled();
    expect(mockSaveClaudeSetting).not.toHaveBeenCalled();
  });
});
