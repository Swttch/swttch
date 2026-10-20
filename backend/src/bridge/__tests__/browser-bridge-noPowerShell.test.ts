import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
  spawn: vi.fn(() => ({ unref: vi.fn() })),
}));
vi.mock('../../core/features/settings', () => ({ readMergedSettings: vi.fn() }));
vi.mock('../../core/features/detectEditors', () => ({ detectInstalledEditors: vi.fn() }));
vi.mock('../../core/claude', () => ({ Claude: { which: vi.fn().mockResolvedValue('claude') } }));
// The boot check found PowerShell unusable.
vi.mock('../../core/win-job', () => ({
  assertPowerShellUsable: (what: string) => {
    throw new Error(`${what} needs PowerShell, which cannot be launched on this computer.`);
  },
  isPowerShellUsable: () => false,
}));

import { execFile, spawn } from 'child_process';
import { readMergedSettings } from '../../core/features/settings';
import { BrowserBridge } from '../browser-bridge';

describe('BrowserBridge on Windows where PowerShell cannot be launched', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
  });

  afterEach(() => {
    if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform);
  });

  it('says why a file cannot be chosen, instead of answering as if the person cancelled', async () => {
    await expect(new BrowserBridge().pickFiles({ mode: 'files' })).rejects.toThrow(
      'Choosing files needs PowerShell, which cannot be launched on this computer.',
    );
    expect(execFile).not.toHaveBeenCalled();
  });

  it('says why a save location cannot be chosen, instead of answering as if the person cancelled', async () => {
    await expect(
      new BrowserBridge().saveFile({ suggestedName: 'prompts.json', contents: '{}' }),
    ).rejects.toThrow('Choosing where to save needs PowerShell, which cannot be launched on this computer.');
    expect(execFile).not.toHaveBeenCalled();
  });

  it('opens the Command Prompt terminal when PowerShell was the chosen one', async () => {
    vi.mocked(readMergedSettings).mockResolvedValue({ settings: { terminalApp: 'PowerShell' }, overrides: [] });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await new BrowserBridge().openTerminal('C:\\project');

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith('cmd', expect.arrayContaining(['/k']), expect.anything());
    expect(vi.mocked(spawn).mock.calls[0][0]).not.toBe('powershell');
  });
});
