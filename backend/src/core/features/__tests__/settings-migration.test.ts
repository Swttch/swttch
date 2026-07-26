import { describe, it, expect, vi, beforeEach } from 'vitest';

// The migration moves settings keys between the two stores so each key ends up
// where the official Claude Code schema says it belongs. We mock both settings
// modules so the tests assert the orchestration (copy → delete, idempotency,
// defensive failure) without touching the filesystem.
vi.mock('../claude-settings', () => ({
  readClaudeSettings: vi.fn(),
  saveClaudeSetting: vi.fn(),
}));

vi.mock('../settings', () => ({
  readSettingsFile: vi.fn(),
  saveSettingToFile: vi.fn(),
}));

import { readClaudeSettings, saveClaudeSetting } from '../claude-settings';
import { readSettingsFile, saveSettingToFile } from '../settings';
import {
  migrateSettingsToCorrectStore,
  MIGRATED_GUI_KEYS,
  RECLAIMED_NATIVE_KEYS,
  RENAMED_TO_NATIVE_KEYS,
  CONFIG_DIR_ENV_KEY,
} from '../settings-migration';

const mockReadClaudeSettings = vi.mocked(readClaudeSettings);
const mockSaveClaudeSetting = vi.mocked(saveClaudeSetting);
const mockReadSettingsFile = vi.mocked(readSettingsFile);
const mockSaveSettingToFile = vi.mocked(saveSettingToFile);

describe('migrateSettingsToCorrectStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveSettingToFile.mockResolvedValue({ status: 'ok' });
    mockSaveClaudeSetting.mockResolvedValue({ status: 'ok' });
    mockReadClaudeSettings.mockResolvedValue({});
    mockReadSettingsFile.mockResolvedValue({});
  });

  describe('key sets', () => {
    it('lists the GUI-only keys that must leave the native file', () => {
      // Verified absent from the official schema (schemastore claude-code-settings).
      expect([...MIGRATED_GUI_KEYS].sort()).toEqual(
        [
          'autoResumeOnLimit',
          'focusInputOnEditorContext',
          'uiLanguage',
          'ultracode',
          'useCtrlEnterToSend',
        ].sort(),
      );
    });

    it('lists the official-schema keys that must return to the native file', () => {
      expect([...RECLAIMED_NATIVE_KEYS].sort()).toEqual(['env', 'language'].sort());
    });

    it('maps the renamed app key onto its official native key name', () => {
      expect(RENAMED_TO_NATIVE_KEYS).toEqual({
        respectGitignoreForContext: 'respectGitignore',
      });
    });
  });

  describe('native → app (GUI-only keys)', () => {
    it('copies each present GUI key into app settings then removes it from native', async () => {
      mockReadClaudeSettings.mockResolvedValue({
        uiLanguage: 'korean',
        useCtrlEnterToSend: true,
        // native keys that must be left alone:
        model: 'claude-opus-4-6',
        permissions: { defaultMode: 'auto' },
      });

      await migrateSettingsToCorrectStore();

      expect(mockSaveSettingToFile).toHaveBeenCalledWith('uiLanguage', 'korean');
      expect(mockSaveSettingToFile).toHaveBeenCalledWith('useCtrlEnterToSend', true);

      expect(mockSaveClaudeSetting).toHaveBeenCalledWith('uiLanguage', null);
      expect(mockSaveClaudeSetting).toHaveBeenCalledWith('useCtrlEnterToSend', null);
      expect(mockSaveClaudeSetting).not.toHaveBeenCalledWith('model', null);
      expect(mockSaveClaudeSetting).not.toHaveBeenCalledWith('permissions', null);
    });

    it('migrates falsy values too (false / empty are still values)', async () => {
      mockReadClaudeSettings.mockResolvedValue({
        uiLanguage: 'english',
        useCtrlEnterToSend: false,
        focusInputOnEditorContext: false,
        autoResumeOnLimit: false,
        ultracode: true,
      });

      await migrateSettingsToCorrectStore();

      for (const key of MIGRATED_GUI_KEYS) {
        expect(mockSaveClaudeSetting).toHaveBeenCalledWith(key, null);
      }
    });

    it('does NOT delete the native key when the app-settings copy fails', async () => {
      mockReadClaudeSettings.mockResolvedValue({ uiLanguage: 'korean' });
      mockSaveSettingToFile.mockResolvedValue({ status: 'error', error: 'disk full' });

      await migrateSettingsToCorrectStore();

      expect(mockSaveSettingToFile).toHaveBeenCalledWith('uiLanguage', 'korean');
      expect(mockSaveClaudeSetting).not.toHaveBeenCalled();
    });
  });

  describe('app → native (official-schema keys)', () => {
    it('copies language back to the native file then clears it from app settings', async () => {
      mockReadSettingsFile.mockResolvedValue({ language: 'korean' });

      await migrateSettingsToCorrectStore();

      expect(mockSaveClaudeSetting).toHaveBeenCalledWith('language', 'korean');
      expect(mockSaveSettingToFile).toHaveBeenCalledWith('language', null);
    });

    it('does NOT clear the app value when the native copy fails', async () => {
      mockReadSettingsFile.mockResolvedValue({ language: 'korean' });
      mockSaveClaudeSetting.mockResolvedValue({ status: 'error', error: 'read-only fs' });

      await migrateSettingsToCorrectStore();

      expect(mockSaveClaudeSetting).toHaveBeenCalledWith('language', 'korean');
      expect(mockSaveSettingToFile).not.toHaveBeenCalledWith('language', null);
    });

    it('skips a null app value — an unset key is not a value to migrate', async () => {
      mockReadSettingsFile.mockResolvedValue({ language: null });

      await migrateSettingsToCorrectStore();

      expect(mockSaveClaudeSetting).not.toHaveBeenCalledWith('language', null);
      expect(mockSaveClaudeSetting).not.toHaveBeenCalledWith('language', expect.anything());
    });
  });

  describe('env: CLAUDE_CONFIG_DIR stays behind', () => {
    it('moves other env vars to native but keeps CLAUDE_CONFIG_DIR in app settings', async () => {
      mockReadSettingsFile.mockResolvedValue({
        env: {
          [CONFIG_DIR_ENV_KEY]: '/custom/.claude',
          ANTHROPIC_MODEL: 'claude-opus-4-6',
        },
      });

      await migrateSettingsToCorrectStore();

      // Only the non-config-dir vars go native.
      expect(mockSaveClaudeSetting).toHaveBeenCalledWith('env', {
        ANTHROPIC_MODEL: 'claude-opus-4-6',
      });
      // CLAUDE_CONFIG_DIR must remain in app settings: it decides WHERE the
      // native file lives, so storing it inside that file is circular.
      expect(mockSaveSettingToFile).toHaveBeenCalledWith('env', {
        [CONFIG_DIR_ENV_KEY]: '/custom/.claude',
      });
    });

    it('leaves app env untouched when it only holds CLAUDE_CONFIG_DIR', async () => {
      mockReadSettingsFile.mockResolvedValue({
        env: { [CONFIG_DIR_ENV_KEY]: '/custom/.claude' },
      });

      await migrateSettingsToCorrectStore();

      expect(mockSaveClaudeSetting).not.toHaveBeenCalledWith('env', expect.anything());
      expect(mockSaveSettingToFile).not.toHaveBeenCalledWith('env', expect.anything());
    });

    it('merges into existing native env rather than replacing it', async () => {
      mockReadClaudeSettings.mockResolvedValue({ env: { EXISTING: 'keep-me' } });
      mockReadSettingsFile.mockResolvedValue({ env: { ANTHROPIC_MODEL: 'claude-opus-4-6' } });

      await migrateSettingsToCorrectStore();

      expect(mockSaveClaudeSetting).toHaveBeenCalledWith('env', {
        EXISTING: 'keep-me',
        ANTHROPIC_MODEL: 'claude-opus-4-6',
      });
    });

    it('does not let the app value clobber an existing native var of the same name', async () => {
      mockReadClaudeSettings.mockResolvedValue({ env: { ANTHROPIC_MODEL: 'native-wins' } });
      mockReadSettingsFile.mockResolvedValue({ env: { ANTHROPIC_MODEL: 'app-value' } });

      await migrateSettingsToCorrectStore();

      expect(mockSaveClaudeSetting).toHaveBeenCalledWith('env', {
        ANTHROPIC_MODEL: 'native-wins',
      });
    });
  });

  describe('rename + move (respectGitignoreForContext → respectGitignore)', () => {
    it('carries the app value over to the official native key and clears the old one', async () => {
      mockReadSettingsFile.mockResolvedValue({ respectGitignoreForContext: true });

      await migrateSettingsToCorrectStore();

      expect(mockSaveClaudeSetting).toHaveBeenCalledWith('respectGitignore', true);
      expect(mockSaveSettingToFile).toHaveBeenCalledWith('respectGitignoreForContext', null);
    });

    it('also reclaims the stale misnamed key if it is still sitting in the native file', async () => {
      // Shipped versions wrote respectGitignoreForContext straight into the native
      // file — a key the CLI never reads. Clean it up while carrying its value.
      mockReadClaudeSettings.mockResolvedValue({ respectGitignoreForContext: true });

      await migrateSettingsToCorrectStore();

      expect(mockSaveClaudeSetting).toHaveBeenCalledWith('respectGitignore', true);
      expect(mockSaveClaudeSetting).toHaveBeenCalledWith('respectGitignoreForContext', null);
    });

    it('never overwrites an existing official value with the legacy one', async () => {
      mockReadClaudeSettings.mockResolvedValue({ respectGitignore: false });
      mockReadSettingsFile.mockResolvedValue({ respectGitignoreForContext: true });

      await migrateSettingsToCorrectStore();

      expect(mockSaveClaudeSetting).not.toHaveBeenCalledWith('respectGitignore', true);
      // The legacy app key is still cleared — its value simply loses.
      expect(mockSaveSettingToFile).toHaveBeenCalledWith('respectGitignoreForContext', null);
    });
  });

  describe('idempotency and safety', () => {
    it('is a no-op when both stores are already correct', async () => {
      mockReadClaudeSettings.mockResolvedValue({
        model: 'claude-opus-4-6',
        language: 'korean',
        permissions: { defaultMode: 'auto' },
      });
      mockReadSettingsFile.mockResolvedValue({ theme: 'dark', fontSize: 13 });

      await migrateSettingsToCorrectStore();

      expect(mockSaveSettingToFile).not.toHaveBeenCalled();
      expect(mockSaveClaudeSetting).not.toHaveBeenCalled();
    });

    it('resolves without throwing when reading native settings fails (non-fatal)', async () => {
      mockReadClaudeSettings.mockRejectedValue(new Error('read failed'));

      await expect(migrateSettingsToCorrectStore()).resolves.toBeUndefined();
    });

    it('resolves without throwing when reading app settings fails (non-fatal)', async () => {
      mockReadSettingsFile.mockRejectedValue(new Error('read failed'));

      await expect(migrateSettingsToCorrectStore()).resolves.toBeUndefined();
    });
  });
});
