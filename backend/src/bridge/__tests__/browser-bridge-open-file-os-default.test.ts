import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type ExecCallback = (err: (Error & { code?: unknown }) | null) => void;

vi.mock('child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], cb?: ExecCallback) => {
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

import { execFile } from 'child_process';
import { readMergedSettings } from '../../core/features/settings';
import { BrowserBridge } from '../browser-bridge';

// With no editor chosen, a clicked file goes to the OS default opener (issue #567).
describe('BrowserBridge.openFile — OS default opener', () => {
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readMergedSettings).mockResolvedValue({
      settings: { openFilesWith: null, openFilesWithCustom: null },
      overrides: [],
    });
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  });

  afterEach(() => {
    if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform);
  });

  const setPlatform = (platform: NodeJS.Platform) => Object.defineProperty(process, 'platform', { value: platform });

  function failWith(error: Error & { code?: unknown }) {
    vi.mocked(execFile).mockImplementationOnce(((_cmd: string, _args: string[], cb?: ExecCallback) => {
      cb?.(error);
    }) as never);
  }

  it('gives Windows explorer a backslash path, since it reads C:/… as something else', async () => {
    setPlatform('win32');
    await new BrowserBridge().openFile('C:/Users/me/AppData/x.png');
    expect(execFile).toHaveBeenCalledWith('explorer', ['C:\\Users\\me\\AppData\\x.png'], expect.any(Function));
  });

  it('does not count explorer exit code 1 as a failure (it exits 1 after opening the file)', async () => {
    setPlatform('win32');
    failWith(Object.assign(new Error('Command failed'), { code: 1 }));
    await expect(new BrowserBridge().openFile('C:/Users/me/x.png')).resolves.toBeUndefined();
  });

  it('rejects when explorer cannot even start', async () => {
    setPlatform('win32');
    failWith(Object.assign(new Error('spawn explorer ENOENT'), { code: 'ENOENT' }));
    await expect(new BrowserBridge().openFile('C:/Users/me/x.png')).rejects.toThrow('ENOENT');
  });

  it('rejects when the macOS opener fails, so the click reports it', async () => {
    setPlatform('darwin');
    failWith(Object.assign(new Error('open: no application knows how to open'), { code: 1 }));
    await expect(new BrowserBridge().openFile('/tmp/x.unknown')).rejects.toThrow('no application');
  });

  it('leaves a POSIX path as written', async () => {
    setPlatform('linux');
    await new BrowserBridge().openFile('/home/me/x.png');
    expect(execFile).toHaveBeenCalledWith('xdg-open', ['/home/me/x.png'], expect.any(Function));
  });
});

// "Show in file manager" and "open with the system app" from the file link's menu (#567).
describe('BrowserBridge — system app and file manager', () => {
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  });

  afterEach(() => {
    if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform);
  });

  const setPlatform = (platform: NodeJS.Platform) => Object.defineProperty(process, 'platform', { value: platform });

  it('opens with the system app regardless of the chosen editor, with a backslash path on Windows', async () => {
    setPlatform('win32');
    vi.mocked(readMergedSettings).mockResolvedValue({
      settings: { openFilesWith: 'Cursor', openFilesWithCustom: null },
      overrides: [],
    });
    await new BrowserBridge().openFileWithSystemApp('C:/Users/me/x.png');
    expect(execFile).toHaveBeenCalledWith('explorer', ['C:\\Users\\me\\x.png'], expect.any(Function));
    expect(readMergedSettings).not.toHaveBeenCalled();
  });

  it('selects the file in Windows explorer', async () => {
    setPlatform('win32');
    await new BrowserBridge().revealFile('C:/Users/me/x.png');
    expect(execFile).toHaveBeenCalledWith('explorer', ['/select,', 'C:\\Users\\me\\x.png'], expect.any(Function));
  });

  it('reveals with open -R on macOS', async () => {
    setPlatform('darwin');
    await new BrowserBridge().revealFile('/Users/me/x.png');
    expect(execFile).toHaveBeenCalledWith('open', ['-R', '/Users/me/x.png'], expect.any(Function));
  });

  it('opens the containing folder on Linux, where no file manager can select', async () => {
    setPlatform('linux');
    await new BrowserBridge().revealFile('/home/me/x.png');
    expect(execFile).toHaveBeenCalledWith('xdg-open', ['/home/me'], expect.any(Function));
  });

  it('rejects when the file manager cannot be started', async () => {
    setPlatform('darwin');
    vi.mocked(execFile).mockImplementationOnce(((_c: string, _a: string[], cb?: ExecCallback) => {
      cb?.(Object.assign(new Error('spawn open ENOENT'), { code: 'ENOENT' }));
    }) as never);
    await expect(new BrowserBridge().revealFile('/Users/me/x.png')).rejects.toThrow('ENOENT');
  });
});
