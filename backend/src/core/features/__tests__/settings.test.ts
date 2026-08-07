import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to mock fs modules to test readSettingsFile and saveSettingToFile
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  rename: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

// We must access internal functions. Since validateSetting and generateSettingsContent
// are not exported, we test them indirectly through saveSettingToFile and readSettingsFile.
import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import { existsSync } from 'fs';
import {
  readSettingsFile,
  saveSettingToFile,
  readMergedSettings,
  resolveClaudeConfigDirOverride,
  saveEnvVarToScope,
} from '../settings';

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);
const mockRename = vi.mocked(rename);
const mockExistsSync = vi.mocked(existsSync);

describe('settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('saveSettingToFile() - validates settings via validateSetting()', () => {
    beforeEach(() => {
      // Make readSettingsFile return defaults for save operations
      mockExistsSync.mockReturnValue(false);
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);
      mockRename.mockResolvedValue(undefined);
    });

    it('should reject unknown settings key', async () => {
      const result = await saveSettingToFile('unknownKey', 'value');
      expect(result.status).toBe('error');
      expect(result.error).toContain('Unknown settings key');
    });

    it('should reject invalid theme value', async () => {
      const result = await saveSettingToFile('theme', 'invalid');
      expect(result.status).toBe('error');
      expect(result.error).toContain('theme must be one of');
    });

    it('should accept valid theme values', async () => {
      for (const theme of ['system', 'light', 'dark']) {
        const result = await saveSettingToFile('theme', theme);
        expect(result.status).toBe('ok');
      }
    });

    it('should reject fontSize out of range', async () => {
      const tooSmall = await saveSettingToFile('fontSize', 7);
      expect(tooSmall.status).toBe('error');
      expect(tooSmall.error).toContain('fontSize must be an integer between 8 and 32');

      const tooLarge = await saveSettingToFile('fontSize', 33);
      expect(tooLarge.status).toBe('error');
    });

    it('should reject non-integer fontSize', async () => {
      const result = await saveSettingToFile('fontSize', 12.5);
      expect(result.status).toBe('error');
    });

    it('should accept valid fontSize', async () => {
      const result = await saveSettingToFile('fontSize', 16);
      expect(result.status).toBe('ok');
    });

    it('should reject zoomLevel out of range', async () => {
      const tooSmall = await saveSettingToFile('zoomLevel', 0.4);
      expect(tooSmall.status).toBe('error');
      expect(tooSmall.error).toContain('zoomLevel must be a number between 0.5 and 3');

      const tooLarge = await saveSettingToFile('zoomLevel', 3.1);
      expect(tooLarge.status).toBe('error');
    });

    it('should accept fractional zoomLevel', async () => {
      const result = await saveSettingToFile('zoomLevel', 1.25);
      expect(result.status).toBe('ok');

      const reset = await saveSettingToFile('zoomLevel', 1);
      expect(reset.status).toBe('ok');
    });

    it('should reject lineHeight out of range', async () => {
      const tooSmall = await saveSettingToFile('lineHeight', 0.4);
      expect(tooSmall.status).toBe('error');
      expect(tooSmall.error).toContain('lineHeight must be a number between 0.5 and 10');

      const tooLarge = await saveSettingToFile('lineHeight', 10.1);
      expect(tooLarge.status).toBe('error');
    });

    it('should accept fractional lineHeight', async () => {
      const result = await saveSettingToFile('lineHeight', 1.8);
      expect(result.status).toBe('ok');

      const wide = await saveSettingToFile('lineHeight', 8);
      expect(wide.status).toBe('ok');
    });

    it('should reject non-boolean debugMode', async () => {
      const result = await saveSettingToFile('debugMode', 'true');
      expect(result.status).toBe('error');
      expect(result.error).toContain('must be a boolean');
    });

    it('should accept boolean debugMode', async () => {
      const result = await saveSettingToFile('debugMode', true);
      expect(result.status).toBe('ok');
    });

    it('should reject invalid logLevel', async () => {
      const result = await saveSettingToFile('logLevel', 'verbose');
      expect(result.status).toBe('error');
      expect(result.error).toContain('logLevel must be one of');
    });

    it('should accept valid logLevel values', async () => {
      for (const level of ['debug', 'info', 'warn', 'error']) {
        const result = await saveSettingToFile('logLevel', level);
        expect(result.status).toBe('ok');
      }
    });

    it('should accept null cliPath', async () => {
      const result = await saveSettingToFile('cliPath', null);
      expect(result.status).toBe('ok');
    });

    it('should accept string cliPath', async () => {
      const result = await saveSettingToFile('cliPath', '/usr/bin/claude');
      expect(result.status).toBe('ok');
    });

    it('should reject non-string non-null cliPath', async () => {
      const result = await saveSettingToFile('cliPath', 123);
      expect(result.status).toBe('error');
      expect(result.error).toContain('cliPath must be a string or null');
    });

    it('should accept null terminalApp', async () => {
      const result = await saveSettingToFile('terminalApp', null);
      expect(result.status).toBe('ok');
    });

    it('should reject non-string non-null terminalApp', async () => {
      const result = await saveSettingToFile('terminalApp', 42);
      expect(result.status).toBe('error');
      expect(result.error).toContain('terminalApp must be a string or null');
    });

    it('should accept null openFilesWith', async () => {
      const result = await saveSettingToFile('openFilesWith', null);
      expect(result.status).toBe('ok');
    });

    it('should accept string openFilesWith', async () => {
      const result = await saveSettingToFile('openFilesWith', 'Cursor');
      expect(result.status).toBe('ok');
    });

    it('should reject non-string non-null openFilesWith', async () => {
      const result = await saveSettingToFile('openFilesWith', 42);
      expect(result.status).toBe('error');
      expect(result.error).toContain('openFilesWith must be a string or null');
    });

    it('should accept null openFilesWithCustom', async () => {
      const result = await saveSettingToFile('openFilesWithCustom', null);
      expect(result.status).toBe('ok');
    });

    it('should accept a valid openFilesWithCustom object', async () => {
      const result = await saveSettingToFile('openFilesWithCustom', {
        path: '/usr/bin/subl',
        arguments: '%TARGET_PATH%',
      });
      expect(result.status).toBe('ok');
    });

    it('should reject openFilesWithCustom that is not an object', async () => {
      const result = await saveSettingToFile('openFilesWithCustom', 'not-an-object');
      expect(result.status).toBe('error');
      expect(result.error).toContain('openFilesWithCustom must be an object or null');
    });

    it('should reject openFilesWithCustom that is an array', async () => {
      const result = await saveSettingToFile('openFilesWithCustom', ['x']);
      expect(result.status).toBe('error');
      expect(result.error).toContain('openFilesWithCustom must be an object or null');
    });

    it('should reject openFilesWithCustom missing path/arguments', async () => {
      const result = await saveSettingToFile('openFilesWithCustom', { path: '/usr/bin/subl' });
      expect(result.status).toBe('error');
      expect(result.error).toContain('openFilesWithCustom must have string "path" and "arguments"');
    });

    it('should reject openFilesWithCustom with non-string fields', async () => {
      const result = await saveSettingToFile('openFilesWithCustom', { path: 123, arguments: '%TARGET_PATH%' });
      expect(result.status).toBe('error');
      expect(result.error).toContain('openFilesWithCustom must have string "path" and "arguments"');
    });

    it('should accept null nodePath', async () => {
      const result = await saveSettingToFile('nodePath', null);
      expect(result.status).toBe('ok');
    });

    it('should accept string nodePath', async () => {
      const result = await saveSettingToFile('nodePath', '/usr/bin/node');
      expect(result.status).toBe('ok');
    });

    it('should reject non-string non-null nodePath', async () => {
      const result = await saveSettingToFile('nodePath', 123);
      expect(result.status).toBe('error');
      expect(result.error).toContain('nodePath must be a string or null');
    });

    it('should accept valid hostMode values', async () => {
      for (const mode of ['editor-tab', 'tool-window']) {
        const result = await saveSettingToFile('hostMode', mode);
        expect(result.status).toBe('ok');
      }
    });

    it('should reject invalid hostMode value', async () => {
      const result = await saveSettingToFile('hostMode', 'sidebar');
      expect(result.status).toBe('error');
      expect(result.error).toContain('hostMode must be one of');
    });

    it('should accept valid uiDirection values', async () => {
      for (const dir of ['ltr', 'rtl']) {
        const result = await saveSettingToFile('uiDirection', dir);
        expect(result.status).toBe('ok');
      }
    });

    it('should reject invalid uiDirection value', async () => {
      const result = await saveSettingToFile('uiDirection', 'vertical');
      expect(result.status).toBe('error');
      expect(result.error).toContain('uiDirection must be one of');
    });

    it('should accept an env object of string values', async () => {
      const result = await saveSettingToFile('env', { CLAUDE_CONFIG_DIR: '/home/u/.claude-work' });
      expect(result.status).toBe('ok');
    });

    it('should accept an empty env object', async () => {
      const result = await saveSettingToFile('env', {});
      expect(result.status).toBe('ok');
    });

    it('should reject env that is not an object', async () => {
      const result = await saveSettingToFile('env', 'CLAUDE_CONFIG_DIR=/x');
      expect(result.status).toBe('error');
      expect(result.error).toContain('env must be an object');
    });

    it('should reject env that is an array', async () => {
      const result = await saveSettingToFile('env', ['/x']);
      expect(result.status).toBe('error');
      expect(result.error).toContain('env must be an object');
    });

    it('should reject env with a non-string value', async () => {
      const result = await saveSettingToFile('env', { CLAUDE_CONFIG_DIR: 123 });
      expect(result.status).toBe('error');
      expect(result.error).toContain('must be a string');
    });

    // GUI-only keys migrated out of native Claude settings (settings-migration.ts).
    it('should accept string or null uiLanguage', async () => {
      expect((await saveSettingToFile('uiLanguage', 'korean')).status).toBe('ok');
      expect((await saveSettingToFile('uiLanguage', null)).status).toBe('ok');
    });

    it('should reject non-string non-null uiLanguage', async () => {
      const result = await saveSettingToFile('uiLanguage', 5);
      expect(result.status).toBe('error');
      expect(result.error).toContain('uiLanguage must be a string or null');
    });

    it('should accept string or null language (Claude response language)', async () => {
      expect((await saveSettingToFile('language', 'japanese')).status).toBe('ok');
      expect((await saveSettingToFile('language', null)).status).toBe('ok');
    });

    it('should reject non-string non-null language', async () => {
      const result = await saveSettingToFile('language', true);
      expect(result.status).toBe('error');
      expect(result.error).toContain('language must be a string or null');
    });

    it('should accept boolean GUI-only toggles and reject non-boolean', async () => {
      for (const key of [
        'useCtrlEnterToSend',
        'focusInputOnEditorContext',
        'autoResumeOnLimit',
        'attachEditorContext',
      ]) {
        expect((await saveSettingToFile(key, true)).status).toBe('ok');
        expect((await saveSettingToFile(key, false)).status).toBe('ok');
        const bad = await saveSettingToFile(key, 'yes');
        expect(bad.status).toBe('error');
        expect(bad.error).toContain('must be a boolean');
      }
    });

    // Legacy keys stay writable with null so the migration can clear them after
    // copying the value into the native file. Rejecting null would strand the
    // old value here forever.
    it('should accept null for legacy keys the migration clears', async () => {
      for (const key of ['language', 'respectGitignoreForContext']) {
        expect((await saveSettingToFile(key, null)).status).toBe('ok');
      }
    });

    it('should accept boolean or null ultracode and reject other types', async () => {
      expect((await saveSettingToFile('ultracode', true)).status).toBe('ok');
      expect((await saveSettingToFile('ultracode', null)).status).toBe('ok');
      const bad = await saveSettingToFile('ultracode', 'on');
      expect(bad.status).toBe('error');
      expect(bad.error).toContain('ultracode must be a boolean or null');
    });

    // dockLayout holds the header dock arrangement: `order` is the row order of
    // every overflow-menu item, `visible` names which of them also sit outside
    // as icons. The backend validates the SHAPE only and deliberately does not
    // know the item ids — those belong to the webview registry, and duplicating
    // the list here would mean editing two places to add one icon. An id the
    // webview no longer knows (or a `visible` id `order` does not contain) is
    // dropped when it normalizes the layout, so an unknown string is harmless.
    describe('dockLayout', () => {
      it('accepts a well-formed layout', async () => {
        const result = await saveSettingToFile('dockLayout', {
          order: ['newTab', 'settings', 'tunnel'],
          visible: ['settings'],
        });
        expect(result.status).toBe('ok');
      });

      it('accepts empty arrays (not configured yet)', async () => {
        expect((await saveSettingToFile('dockLayout', { order: [], visible: [] })).status).toBe('ok');
      });

      it('rejects a non-object', async () => {
        for (const bad of ['nope', 42, null, true]) {
          const result = await saveSettingToFile('dockLayout', bad);
          expect(result.status).toBe('error');
          expect(result.error).toContain('dockLayout must be an object');
        }
      });

      it('rejects an array', async () => {
        const result = await saveSettingToFile('dockLayout', ['newTab']);
        expect(result.status).toBe('error');
        expect(result.error).toContain('dockLayout must be an object');
      });

      it('rejects when order or visible is not an array', async () => {
        const missingVisible = await saveSettingToFile('dockLayout', { order: [] });
        expect(missingVisible.status).toBe('error');
        expect(missingVisible.error).toContain('dockLayout.order and dockLayout.visible must both be arrays');

        const badOrder = await saveSettingToFile('dockLayout', { order: 'newTab', visible: [] });
        expect(badOrder.status).toBe('error');
        expect(badOrder.error).toContain('dockLayout.order and dockLayout.visible must both be arrays');
      });

      it('rejects non-string entries', async () => {
        const result = await saveSettingToFile('dockLayout', { order: [1], visible: [] });
        expect(result.status).toBe('error');
        expect(result.error).toContain('dockLayout entries must be strings');
      });

      // A duplicate in `order` would leave two rows claiming the same position
      // and make the drag reorder ambiguous about which copy moved.
      it('rejects a duplicated id in order', async () => {
        const result = await saveSettingToFile('dockLayout', {
          order: ['newTab', 'newTab'],
          visible: [],
        });
        expect(result.status).toBe('error');
        expect(result.error).toContain('dockLayout.order entries must be unique');
      });

      it('serializes the layout into the settings file', async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFile.mockResolvedValue('export default { theme: "system" };');

        const result = await saveSettingToFile('dockLayout', { order: ['newTab'], visible: ['newTab'] });
        expect(result.status).toBe('ok');

        const [, content] = mockWriteFile.mock.calls[mockWriteFile.mock.calls.length - 1];
        expect(String(content)).toContain('dockLayout: {"order":["newTab"],"visible":["newTab"]}');
      });
    });
  });

  describe('saveSettingToFile() - atomic write via temp file + rename', () => {
    beforeEach(() => {
      // existsSync=true + a parseable file so readSettingsFile() (called first
      // by doSaveSettingToFile) doesn't itself perform a "create defaults"
      // writeFile — keeping the writeFile/rename call counts below scoped to
      // the atomic write path alone.
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(`export default { theme: "system" };`);
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);
      mockRename.mockResolvedValue(undefined);
    });

    it('writes to a temp file and renames it onto the real settings path', async () => {
      const result = await saveSettingToFile('theme', 'dark');
      expect(result.status).toBe('ok');

      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      const [tmpPath, content] = mockWriteFile.mock.calls[0];
      expect(String(tmpPath)).toContain('.tmp-');
      expect(String(tmpPath).endsWith('settings.js')).toBe(false);
      expect(String(content)).toContain('theme: "dark"');

      expect(mockRename).toHaveBeenCalledTimes(1);
      const [renameFrom, renameTo] = mockRename.mock.calls[0];
      expect(renameFrom).toBe(tmpPath);
      expect(String(renameTo).endsWith('settings.js')).toBe(true);
    });

    it('never leaves the settings file content half-written when rename fails', async () => {
      mockRename.mockRejectedValueOnce(new Error('rename failed'));

      const result = await saveSettingToFile('theme', 'dark');

      expect(result.status).toBe('error');
      expect(result.error).toContain('rename failed');
    });
  });

  describe('saveSettingToFile() - write serialization', () => {
    beforeEach(() => {
      // existsSync=true + a parseable file so readSettingsFile() never takes
      // the "create defaults" writeFile branch — isolates the order tracking
      // below to exactly one writeFile call per saveSettingToFile.
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(`export default { theme: "system" };`);
      mockMkdir.mockResolvedValue(undefined);
      mockRename.mockResolvedValue(undefined);
    });

    it('serializes concurrent writes so each write finishes before the next starts', async () => {
      const order: string[] = [];
      let callIndex = 0;
      mockWriteFile.mockImplementation((async (_p: string, content: string) => {
        const myIndex = callIndex++;
        order.push(`start-${myIndex}`);
        // Yield a microtask so an interleaved implementation would show up.
        await Promise.resolve();
        order.push(`end-${myIndex}`);
        void content;
      }) as unknown as typeof writeFile);

      const [r1, r2, r3] = await Promise.all([
        saveSettingToFile('fontSize', 14),
        saveSettingToFile('fontSize', 15),
        saveSettingToFile('fontSize', 16),
      ]);

      expect(r1.status).toBe('ok');
      expect(r2.status).toBe('ok');
      expect(r3.status).toBe('ok');
      // Each write must fully complete (start-N, end-N) before the next write starts.
      expect(order).toEqual(['start-0', 'end-0', 'start-1', 'end-1', 'start-2', 'end-2']);
    });

    it('keeps the write chain alive after a failing write so later writes still run', async () => {
      const first = await saveSettingToFile('theme', 'not-a-real-theme');
      expect(first.status).toBe('error');

      mockWriteFile.mockResolvedValue(undefined);
      const second = await saveSettingToFile('theme', 'dark');
      expect(second.status).toBe('ok');
    });
  });

  describe('readSettingsFile()', () => {
    it('should return defaults and create file when settings file does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const result = await readSettingsFile();

      expect(result).toEqual({
        cliPath: null,
        nodePath: null,
        theme: 'system',
        syncIdeTheme: false,
        fontSize: 13,
        zoomLevel: 1,
        lineHeight: 1.6,
        autoScrollThreshold: 80,
        debugMode: false,
        logLevel: 'info',
        terminalApp: null,
        openFilesWith: null,
        openFilesWithCustom: null,
        hostMode: 'editor-tab',
        openSettingsAs: 'overlay',
        chatPagination: true,
        uiDirection: 'ltr',
        uiLanguage: null,
        useCtrlEnterToSend: false,
        focusInputOnEditorContext: true,
        autoResumeOnLimit: false,
        attachEditorContext: true,
        ultracode: null,
        dockLayout: { order: [], visible: [] },
        env: {},
        language: null,
        respectGitignoreForContext: false,
      });
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('should parse JS settings file with export default and comments', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(`
// GUI Settings
export default {
  // Claude CLI 실행 파일 경로
  cliPath: null,
  // 테마
  theme: "dark",
  fontSize: 16,
  debugMode: true,
  logLevel: "debug",
  terminalApp: null,
};
`);

      const result = await readSettingsFile();

      expect(result.theme).toBe('dark');
      expect(result.fontSize).toBe(16);
      expect(result.debugMode).toBe(true);
      expect(result.logLevel).toBe('debug');
    });

    it('should handle file with block comments', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(`
/* Multi-line
   block comment */
export default {
  theme: "light",
  fontSize: 14,
};
`);

      const result = await readSettingsFile();
      expect(result.theme).toBe('light');
      expect(result.fontSize).toBe(14);
    });

    // Regression #7: a string value containing `//` (e.g. a WSL UNC path like
    // //wsl.localhost/...) must NOT be treated as a line comment. Previously the
    // comment stripper ate the rest of the line, JSON.parse threw, and the whole
    // settings object silently fell back to defaults — dropping the user's saved
    // hostMode ("tool-window") down to "editor-tab".
    it('should preserve settings when a string value contains // (WSL UNC path)', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(`export default {
  // Claude CLI 실행 파일 경로
  cliPath: "//wsl.localhost/Ubuntu/home/yhk/.local/bin/claude",
  // 채팅을 띄우는 자리
  hostMode: "tool-window",
  theme: "dark",
};
`);

      const result = await readSettingsFile();
      expect(result.cliPath).toBe('//wsl.localhost/Ubuntu/home/yhk/.local/bin/claude');
      expect(result.hostMode).toBe('tool-window');
      expect(result.theme).toBe('dark');
    });

    // Same hazard inside a value that also contains block-comment markers.
    it('should preserve a string value containing /* */ markers', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(`export default {
  terminalApp: "wt /* not a comment */ --profile",
  hostMode: "tool-window",
};
`);

      const result = await readSettingsFile();
      expect(result.terminalApp).toBe('wt /* not a comment */ --profile');
      expect(result.hostMode).toBe('tool-window');
    });

    it('should merge parsed values with defaults for missing keys', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(`export default { theme: "dark" };`);

      const result = await readSettingsFile();
      expect(result.theme).toBe('dark');
      expect(result.fontSize).toBe(13); // default
      expect(result.debugMode).toBe(false); // default
    });

    it('should return defaults on parse error', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue('completely invalid content !!!');

      const result = await readSettingsFile();
      expect(result).toEqual({
        cliPath: null,
        nodePath: null,
        theme: 'system',
        syncIdeTheme: false,
        fontSize: 13,
        zoomLevel: 1,
        lineHeight: 1.6,
        autoScrollThreshold: 80,
        debugMode: false,
        logLevel: 'info',
        terminalApp: null,
        openFilesWith: null,
        openFilesWithCustom: null,
        hostMode: 'editor-tab',
        openSettingsAs: 'overlay',
        chatPagination: true,
        uiDirection: 'ltr',
        uiLanguage: null,
        useCtrlEnterToSend: false,
        focusInputOnEditorContext: true,
        autoResumeOnLimit: false,
        attachEditorContext: true,
        ultracode: null,
        dockLayout: { order: [], visible: [] },
        env: {},
        language: null,
        respectGitignoreForContext: false,
      });
    });

    it('should parse an env object from the settings file', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(
        `export default { env: { CLAUDE_CONFIG_DIR: "/home/u/.claude-work" } };`,
      );

      const result = await readSettingsFile();
      expect(result.env).toEqual({ CLAUDE_CONFIG_DIR: '/home/u/.claude-work' });
    });

    it('should handle trailing commas in JS object', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(`export default {
  theme: "dark",
  fontSize: 14,
};`);

      const result = await readSettingsFile();
      expect(result.theme).toBe('dark');
      expect(result.fontSize).toBe(14);
    });
  });

  describe('env merge and resolution', () => {
    beforeEach(() => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);
      mockExistsSync.mockReturnValue(true);
    });

    // global lives in ~/.claude-code-gui/settings.js, project in
    // <proj>/.claude-code-gui/settings.json — route the mock by file extension.
    function mockGlobalAndProjectEnv(globalEnv: unknown, projectEnv: unknown) {
      mockReadFile.mockImplementation((async (p: string) => {
        if (String(p).endsWith('.js')) {
          return `export default { env: ${JSON.stringify(globalEnv)} };`;
        }
        return JSON.stringify({ env: projectEnv });
      }) as unknown as typeof readFile);
    }

    it('deep-merges env: project keys override global, other global keys preserved', async () => {
      mockGlobalAndProjectEnv(
        { A: 'g', CLAUDE_CONFIG_DIR: '/global' },
        { CLAUDE_CONFIG_DIR: '/project' },
      );

      const { settings } = await readMergedSettings('/proj');
      expect(settings.env).toEqual({ A: 'g', CLAUDE_CONFIG_DIR: '/project' });
    });

    it('resolveClaudeConfigDirOverride prefers project over global', async () => {
      mockGlobalAndProjectEnv(
        { CLAUDE_CONFIG_DIR: '/global' },
        { CLAUDE_CONFIG_DIR: '/project' },
      );

      const value = await resolveClaudeConfigDirOverride('/proj');
      expect(value).toBe('/project');
    });

    it('resolveClaudeConfigDirOverride falls back to global when project has none', async () => {
      mockGlobalAndProjectEnv({ CLAUDE_CONFIG_DIR: '/global' }, {});

      const value = await resolveClaudeConfigDirOverride('/proj');
      expect(value).toBe('/global');
    });

    it('resolveClaudeConfigDirOverride returns null when no override is set', async () => {
      mockReadFile.mockImplementation((async () => `export default {};`) as unknown as typeof readFile);

      const value = await resolveClaudeConfigDirOverride();
      expect(value).toBeNull();
    });
  });

  describe('saveEnvVarToScope', () => {
    beforeEach(() => {
      mockMkdir.mockResolvedValue(undefined);
      mockRename.mockResolvedValue(undefined);
    });

    it('writes an env var into global settings', async () => {
      mockExistsSync.mockReturnValue(false);
      let written = '';
      mockWriteFile.mockImplementation((async (_p: string, content: string) => {
        written = String(content);
      }) as unknown as typeof writeFile);

      const result = await saveEnvVarToScope('CLAUDE_CONFIG_DIR', '/home/u/.claude-work', 'global');

      expect(result.status).toBe('ok');
      expect(written).toContain('CLAUDE_CONFIG_DIR');
      expect(written).toContain('/home/u/.claude-work');
    });

    it('removes an env var when value is null', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(
        `export default { env: { CLAUDE_CONFIG_DIR: "/home/u/.claude-work" } };`,
      );
      let written = '';
      mockWriteFile.mockImplementation((async (_p: string, content: string) => {
        written = String(content);
      }) as unknown as typeof writeFile);

      const result = await saveEnvVarToScope('CLAUDE_CONFIG_DIR', null, 'global');

      expect(result.status).toBe('ok');
      expect(written).not.toContain('.claude-work');
    });
  });
});
