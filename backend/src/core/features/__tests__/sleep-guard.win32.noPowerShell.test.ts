import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('child_process', () => ({
  exec: vi.fn(), execSync: vi.fn(), execFile: vi.fn(), execFileSync: vi.fn(),
  spawn: vi.fn(), spawnSync: vi.fn(),
}));
vi.mock('../../win-job', () => ({
  assertPowerShellUsable: (what: string) => {
    throw new Error(`${what} needs PowerShell, which cannot be launched on this computer.`);
  },
}));

import { spawn } from 'child_process';
import { loadSleepGuard } from './fake-os';

describe('sleep guard on Windows where PowerShell cannot be launched', () => {
  let ccgHome: string;
  let restore: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    ccgHome = mkdtempSync(join(tmpdir(), 'ccg-sleep-nops-'));
    process.env.CCG_HOME = ccgHome;
  });

  afterEach(() => {
    restore?.();
    delete process.env.CCG_HOME;
    rmSync(ccgHome, { recursive: true, force: true });
  });

  it('refuses to turn on, with the reason, without starting the helper', async () => {
    const loaded = await loadSleepGuard('win32');
    restore = loaded.restorePlatform;
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(loaded.mod.enableSleepGuard()).rejects.toThrow(
      'Keeping the computer awake needs PowerShell, which cannot be launched on this computer.',
    );
    expect(spawn).not.toHaveBeenCalled();
    expect(loaded.mod.getSleepGuardStatus().enabled).toBe(false);
  });
});
