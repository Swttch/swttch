import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], cb?: (err: Error | null) => void) => {
    cb?.(null);
  }),
  spawn: vi.fn(() => ({ unref: vi.fn(), on: vi.fn() })),
}));

vi.mock('../../core/features/settings', () => ({
  readMergedSettings: vi.fn(),
}));

vi.mock('../../core/features/detectEditors', () => ({
  detectInstalledEditors: vi.fn(),
}));

vi.mock('../../core/features/appDetection/openAtLine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../core/features/appDetection/openAtLine')>()),
  readMacBundleExecutable: vi.fn(async () => 'webstorm'),
}));

import { execFile, spawn } from 'child_process';
import { readMergedSettings } from '../../core/features/settings';
import { detectInstalledEditors } from '../../core/features/detectEditors';
import { BrowserBridge } from '../browser-bridge';

describe('BrowserBridge.openFile — opens at the line (#508)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(process, 'platform', { value: 'linux' });
  });

  function chooseEditor(id: string, name: string, path: string) {
    vi.mocked(readMergedSettings).mockResolvedValue({ settings: { openFilesWith: name, openFilesWithCustom: null }, overrides: [] });
    vi.mocked(detectInstalledEditors).mockResolvedValue([{ id, name, path }]);
  }

  it('hands a VS Code family editor a URL carrying the line', async () => {
    chooseEditor('cursor', 'Cursor', '/usr/bin/cursor');
    await new BrowserBridge().openFile('/repo/a.ts', 12, 2);
    expect(execFile).toHaveBeenCalledWith('xdg-open', ['cursor://file/repo/a.ts:12:2'], expect.any(Function));
  });

  it('runs a JetBrains launcher with --line', async () => {
    chooseEditor('webstorm', 'WebStorm', '/opt/webstorm/bin/webstorm');
    await new BrowserBridge().openFile('/repo/a.ts', 12);
    expect(spawn).toHaveBeenCalledWith('/opt/webstorm/bin/webstorm', ['--line', '12', '/repo/a.ts'], expect.objectContaining({ detached: true }));
  });

  it('opens the file plainly when the editor has no way to take a line', async () => {
    chooseEditor('emacs', 'Emacs', '/usr/bin/emacs');
    await new BrowserBridge().openFile('/repo/a.ts', 12);
    expect(spawn).toHaveBeenCalledWith('/usr/bin/emacs', ['/repo/a.ts'], expect.objectContaining({ detached: true }));
  });

  it('opens the file plainly when no line is given', async () => {
    chooseEditor('cursor', 'Cursor', '/usr/bin/cursor');
    await new BrowserBridge().openFile('/repo/a.ts');
    expect(spawn).toHaveBeenCalledWith('/usr/bin/cursor', ['/repo/a.ts'], expect.objectContaining({ detached: true }));
    expect(execFile).not.toHaveBeenCalled();
  });

  it('fills %LINE% and %COLUMN% in a custom editor\'s arguments', async () => {
    vi.mocked(readMergedSettings).mockResolvedValue({ settings: {
      openFilesWith: '$custom',
      openFilesWithCustom: { path: '/usr/bin/kate', arguments: '--line %LINE% --column %COLUMN% %TARGET_PATH%' },
    }, overrides: [] });
    await new BrowserBridge().openFile('/repo/a.ts', 12, 4);
    expect(spawn).toHaveBeenCalledWith('/usr/bin/kate', ['--line', '12', '--column', '4', '/repo/a.ts'], expect.objectContaining({ detached: true }));
  });
});
