import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChildProcess } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// The registry lives under homedir()/.claude-code-gui; keep it in a scratch dir.
let fakeHome: string;
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return { ...actual, homedir: () => fakeHome };
});

const { execFileSyncMock, powerShellUsableMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
  powerShellUsableMock: vi.fn(),
}));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return { ...actual, execFileSync: execFileSyncMock };
});
vi.mock('../win-job', () => ({ isPowerShellUsable: powerShellUsableMock }));

import { findLiveCliForSession, killRegisteredCli, registerCliProcess, type CliRegistryEntry } from '../cli-registry';

// The win32 orphan kill finds survivors by asking PowerShell. A PowerShell that never
// exits would hold the startup sweep, and with it the backend, so when the boot check
// found PowerShell unusable the question must not be asked at all.
describe('cli-registry when PowerShell is unusable (win32)', () => {
  const entry: CliRegistryEntry = {
    pid: 4242,
    sessionId: 'sess-abc',
    workingDir: 'C:\\project',
    startedAt: new Date().toISOString(),
    owner: { pid: 1, argv1: '' },
  };
  const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;

  beforeEach(() => {
    fakeHome = mkdtempSync(join(tmpdir(), 'ccg-registry-ps-'));
    Object.defineProperty(process, 'platform', { value: 'win32' });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', realPlatform);
    execFileSyncMock.mockReset();
    powerShellUsableMock.mockReset();
    rmSync(fakeHome, { recursive: true, force: true });
  });

  it('does not run PowerShell to look for the session survivors', async () => {
    powerShellUsableMock.mockReturnValue(false);

    await killRegisteredCli(entry);

    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it('does not run PowerShell to decide whether a registered CLI is still alive', () => {
    powerShellUsableMock.mockReturnValue(false);
    registerCliProcess({ pid: 4242 } as ChildProcess, 'sess-abc', 'C:\\project');

    expect(findLiveCliForSession('sess-abc')).toBeNull();
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it('runs PowerShell to look for the session survivors when it is usable', async () => {
    powerShellUsableMock.mockReturnValue(true);
    execFileSyncMock.mockReturnValue('');

    await killRegisteredCli(entry);

    expect(execFileSyncMock).toHaveBeenCalledWith(
      'powershell.exe',
      expect.arrayContaining([expect.stringContaining('sess-abc')]),
      expect.anything(),
    );
  });
});
