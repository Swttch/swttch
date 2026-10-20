import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('child_process', () => ({ spawn: vi.fn() }));
vi.mock('../scanner', () => ({ scanSystemSounds: vi.fn() }));
// The boot check found PowerShell unusable.
vi.mock('../../core/win-job', () => ({
  assertPowerShellUsable: (what: string) => {
    throw new Error(`${what} needs PowerShell, which cannot be launched on this computer.`);
  },
}));

import { spawn } from 'child_process';
import { scanSystemSounds } from '../scanner';
import { playSystemSound } from '../player';

describe('playSystemSound on Windows where PowerShell cannot be launched', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    vi.mocked(scanSystemSounds).mockResolvedValue([{ id: 'Ding', label: 'Ding', path: 'C:\\Windows\\Media\\ding.wav' }]);
  });

  afterEach(() => {
    if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform);
  });

  it('says why instead of starting PowerShell', async () => {
    await expect(playSystemSound('Ding')).rejects.toThrow(
      'Playing a sound needs PowerShell, which cannot be launched on this computer.',
    );
    expect(spawn).not.toHaveBeenCalled();
  });
});
