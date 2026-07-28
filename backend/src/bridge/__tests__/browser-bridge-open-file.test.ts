import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], cb?: (err: Error | null) => void) => {
    cb?.(null);
  }),
  spawn: vi.fn(() => ({ unref: vi.fn() })),
}));

vi.mock('../../core/features/settings', () => ({
  readMergedSettings: vi.fn(),
}));

vi.mock('../../core/features/detectEditors', () => ({
  detectInstalledEditors: vi.fn(),
}));

import { execFile, spawn } from 'child_process';
import { readMergedSettings } from '../../core/features/settings';
import { detectInstalledEditors } from '../../core/features/detectEditors';
import { BrowserBridge, OPEN_FILES_WITH_CUSTOM } from '../browser-bridge';

describe('BrowserBridge.openFile — openFilesWith setting', () => {
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(detectInstalledEditors).mockResolvedValue([]);
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  });

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  function setPlatform(platform: NodeJS.Platform) {
    Object.defineProperty(process, 'platform', { value: platform });
  }

  it('launches the configured editor via execFile -a on macOS when openFilesWith is set', async () => {
    setPlatform('darwin');
    vi.mocked(readMergedSettings).mockResolvedValue({ settings: { openFilesWith: 'Cursor', openFilesWithCustom: null }, overrides: [] });
    vi.mocked(detectInstalledEditors).mockResolvedValue([
      { id: 'cursor', name: 'Cursor', path: '/Applications/Cursor.app' },
    ]);

    const bridge = new BrowserBridge();
    await bridge.openFile('/tmp/file.ts');

    expect(detectInstalledEditors).toHaveBeenCalled();
    expect(execFile).toHaveBeenCalledWith(
      'open',
      ['-a', '/Applications/Cursor.app', '/tmp/file.ts'],
      expect.any(Function),
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it('launches the configured editor via spawn directly on linux when openFilesWith is set', async () => {
    setPlatform('linux');
    vi.mocked(readMergedSettings).mockResolvedValue({ settings: { openFilesWith: 'code', openFilesWithCustom: null }, overrides: [] });
    vi.mocked(detectInstalledEditors).mockResolvedValue([
      { id: 'vscode', name: 'code', path: '/usr/bin/code' },
    ]);

    const bridge = new BrowserBridge();
    await bridge.openFile('/tmp/file.ts');

    expect(spawn).toHaveBeenCalledWith('/usr/bin/code', ['/tmp/file.ts'], expect.objectContaining({
      stdio: 'ignore',
      detached: true,
    }));
    expect(execFile).not.toHaveBeenCalled();
  });

  it('launches the configured editor via spawn on windows when openFilesWith is set', async () => {
    setPlatform('win32');
    vi.mocked(readMergedSettings).mockResolvedValue({ settings: { openFilesWith: 'code', openFilesWithCustom: null }, overrides: [] });
    vi.mocked(detectInstalledEditors).mockResolvedValue([
      { id: 'vscode', name: 'code', path: 'C:\\Program Files\\Code\\Code.exe' },
    ]);

    const bridge = new BrowserBridge();
    await bridge.openFile('C:\\tmp\\file.ts');

    expect(spawn).toHaveBeenCalledWith('C:\\Program Files\\Code\\Code.exe', ['C:\\tmp\\file.ts'], expect.objectContaining({
      stdio: 'ignore',
      detached: true,
    }));
  });

  it('falls back to the OS default opener when openFilesWith is null', async () => {
    setPlatform('darwin');
    vi.mocked(readMergedSettings).mockResolvedValue({ settings: { openFilesWith: null, openFilesWithCustom: null }, overrides: [] });

    const bridge = new BrowserBridge();
    await bridge.openFile('/tmp/file.ts');

    expect(detectInstalledEditors).not.toHaveBeenCalled();
    expect(execFile).toHaveBeenCalledWith('open', ['/tmp/file.ts'], expect.any(Function));
  });

  it('falls back to the OS default opener when the configured editor is not among detected editors', async () => {
    setPlatform('darwin');
    vi.mocked(readMergedSettings).mockResolvedValue({ settings: { openFilesWith: 'SomeUninstalledEditor', openFilesWithCustom: null }, overrides: [] });
    vi.mocked(detectInstalledEditors).mockResolvedValue([
      { id: 'cursor', name: 'Cursor', path: '/Applications/Cursor.app' },
    ]);

    const bridge = new BrowserBridge();
    await bridge.openFile('/tmp/file.ts');

    expect(execFile).toHaveBeenCalledWith('open', ['/tmp/file.ts'], expect.any(Function));
  });

  describe('$custom (openFilesWithCustom)', () => {
    it('exports the $custom sentinel value', () => {
      expect(OPEN_FILES_WITH_CUSTOM).toBe('$custom');
    });

    it('expands %TARGET_PATH% and launches the custom executable via spawn', async () => {
      setPlatform('linux');
      vi.mocked(readMergedSettings).mockResolvedValue({ settings: {
        openFilesWith: OPEN_FILES_WITH_CUSTOM,
        openFilesWithCustom: { path: '/usr/local/bin/subl', arguments: '%TARGET_PATH%' },
      }, overrides: [] });

      const bridge = new BrowserBridge();
      await bridge.openFile('/tmp/file.ts');

      expect(detectInstalledEditors).not.toHaveBeenCalled();
      expect(spawn).toHaveBeenCalledWith('/usr/local/bin/subl', ['/tmp/file.ts'], expect.objectContaining({
        stdio: 'ignore',
        detached: true,
      }));
    });

    it('expands %TARGET_PATH% among multiple arguments, preserving quoted tokens', async () => {
      setPlatform('linux');
      vi.mocked(readMergedSettings).mockResolvedValue({ settings: {
        openFilesWith: OPEN_FILES_WITH_CUSTOM,
        openFilesWithCustom: { path: '/usr/local/bin/subl', arguments: '--wait "%TARGET_PATH%"' },
      }, overrides: [] });

      const bridge = new BrowserBridge();
      await bridge.openFile('/tmp/my file.ts');

      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/subl',
        ['--wait', '/tmp/my file.ts'],
        expect.objectContaining({ stdio: 'ignore', detached: true }),
      );
    });

    it('launches a .app custom path via execFile -a on macOS', async () => {
      setPlatform('darwin');
      vi.mocked(readMergedSettings).mockResolvedValue({ settings: {
        openFilesWith: OPEN_FILES_WITH_CUSTOM,
        openFilesWithCustom: { path: '/Applications/Sublime Text.app', arguments: '%TARGET_PATH%' },
      }, overrides: [] });

      const bridge = new BrowserBridge();
      await bridge.openFile('/tmp/file.ts');

      expect(execFile).toHaveBeenCalledWith(
        'open',
        ['-a', '/Applications/Sublime Text.app', '/tmp/file.ts'],
        expect.any(Function),
      );
    });

    it('defaults the argument template to %TARGET_PATH% when arguments is empty', async () => {
      setPlatform('linux');
      vi.mocked(readMergedSettings).mockResolvedValue({ settings: {
        openFilesWith: OPEN_FILES_WITH_CUSTOM,
        openFilesWithCustom: { path: '/usr/local/bin/subl', arguments: '' },
      }, overrides: [] });

      const bridge = new BrowserBridge();
      await bridge.openFile('/tmp/file.ts');

      expect(spawn).toHaveBeenCalledWith('/usr/local/bin/subl', ['/tmp/file.ts'], expect.objectContaining({
        stdio: 'ignore',
        detached: true,
      }));
    });

    it('falls back to the OS default opener when $custom is selected but no custom.path is configured', async () => {
      setPlatform('darwin');
      vi.mocked(readMergedSettings).mockResolvedValue({ settings: {
        openFilesWith: OPEN_FILES_WITH_CUSTOM,
        openFilesWithCustom: null,
      }, overrides: [] });

      const bridge = new BrowserBridge();
      await bridge.openFile('/tmp/file.ts');

      expect(execFile).toHaveBeenCalledWith('open', ['/tmp/file.ts'], expect.any(Function));
    });
  });
});


// The CLI equivalence principle: anything a user could set per project from the
// terminal must be settable per project from the GUI. Which editor opens a file
// and which terminal is launched are ordinary per-project choices, so these reads
// go through readMergedSettings(workingDir) — global values still apply when a
// project sets nothing (issue #7).
describe('BrowserBridge — per-project app settings', () => {
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(detectInstalledEditors).mockResolvedValue([]);
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'darwin' });
  });

  afterEach(() => {
    if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform);
  });

  it('openFile honors a project-scoped editor', async () => {
    vi.mocked(readMergedSettings).mockResolvedValue({
      settings: { openFilesWith: 'Cursor', openFilesWithCustom: null },
      overrides: ['openFilesWith'],
    });
    vi.mocked(detectInstalledEditors).mockResolvedValue([
      { id: 'cursor', name: 'Cursor', path: '/Applications/Cursor.app' },
    ]);

    const bridge = new BrowserBridge();
    await bridge.openFile('/home/u/proj/file.ts', undefined, undefined, '/home/u/proj');

    expect(readMergedSettings).toHaveBeenCalledWith('/home/u/proj');
    expect(execFile).toHaveBeenCalledWith(
      'open',
      ['-a', '/Applications/Cursor.app', '/home/u/proj/file.ts'],
      expect.anything(),
    );
  });

  it('openTerminal resolves the terminal app for the project it opens in', async () => {
    vi.mocked(readMergedSettings).mockResolvedValue({
      settings: { terminalApp: 'iTerm' },
      overrides: ['terminalApp'],
    });

    const bridge = new BrowserBridge();
    // The launch itself shells out (AppleScript/spawn); we only pin that the
    // settings lookup is scoped to this project.
    await bridge.openTerminal('/home/u/proj').catch(() => undefined);

    expect(readMergedSettings).toHaveBeenCalledWith('/home/u/proj');
  });
});
