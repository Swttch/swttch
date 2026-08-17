import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Nothing may actually uninstall; execFileSync is stubbed because augmented-path
// may probe for nvm.
vi.mock('child_process', () => ({
  execFile: vi.fn(),
  spawn: vi.fn(() => ({ on: vi.fn() })),
  execFileSync: vi.fn(() => ''),
}));
vi.mock('../getUsage', () => ({ resetUsageCache: vi.fn() }));
vi.mock('../../extend-kit', () => ({ resetExtendKitCache: vi.fn() }));
vi.mock('../getCliUpdateInfo', () => ({ resolveClaudePaths: vi.fn(async () => [null, null]) }));

import { execFile as cpExecFile } from 'child_process';
import { uninstallCcbHandler } from '../uninstallCcb';
import { resetUsageCache } from '../getUsage';
import { resetExtendKitCache } from '../../extend-kit';
import { resolveClaudePaths } from '../getCliUpdateInfo';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

const mockExecFile = vi.mocked(cpExecFile);
const mockResetUsageCache = vi.mocked(resetUsageCache);
const mockResetExtendKitCache = vi.mocked(resetExtendKitCache);
const mockResolveClaudePaths = vi.mocked(resolveClaudePaths);
const bridge = {} as Bridge;
const msg: IPCMessage = { type: MessageType.UNINSTALL_CCB, payload: {}, timestamp: 0, requestId: 'req-1' };

type Cb = (err: Error | null, stdout: string, stderr: string) => void;
function fakeExecFile(res: { stdout?: string; stderr?: string; err?: Error | null }) {
  return ((_f: string, _a: readonly string[], _o: unknown, cb: Cb) => {
    cb(res.err ?? null, res.stdout ?? '', res.stderr ?? '');
    return { on: vi.fn() };
  }) as never;
}

function mockConns() {
  return { sendTo: vi.fn(), broadcastToAll: vi.fn() } as unknown as ConnectionManager;
}

function lastPayload(conns: ConnectionManager): Record<string, unknown> {
  const calls = (conns.sendTo as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1][2];
}

/** `<command> <args...>`, normalised across the win32 cmd.exe wrapper. */
function spawnedArgv(i: number): string {
  const file = mockExecFile.mock.calls[i][0] as string;
  const args = mockExecFile.mock.calls[i][1] as string[];
  return process.platform === 'win32' ? args.slice(3).join(' ') : [file, ...args].join(' ');
}

let execPathSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  // A Node whose directory holds no npm sibling, so the launcher falls back to
  // the bare name these assertions read for.
  execPathSpy = vi.spyOn(process, 'execPath', 'get');
  execPathSpy.mockReturnValue('/nonexistent-for-tests/bin/node');
  mockResolveClaudePaths.mockResolvedValue([null, null]);
});

afterEach(() => {
  execPathSpy.mockRestore();
});

describe('uninstallCcbHandler', () => {
  it('removes the kit and acks ok', async () => {
    mockExecFile.mockImplementation(fakeExecFile({ stdout: 'removed 1 package' }));
    const conns = mockConns();

    await uninstallCcbHandler('c1', msg, conns, bridge);

    expect(spawnedArgv(0)).toContain('npm uninstall -g @swttch/extend-kit');
    expect(lastPayload(conns)).toEqual({ requestId: 'req-1', status: 'ok' });
  });

  // Both caches remember where the kit WAS. Left in place, the settings section
  // keeps reporting the removed version and the row never returns to its
  // not-installed state.
  it('clears both caches so the version line refreshes', async () => {
    mockExecFile.mockImplementation(fakeExecFile({ stdout: 'ok' }));

    await uninstallCcbHandler('c1', msg, mockConns(), bridge);

    expect(mockResetUsageCache).toHaveBeenCalledTimes(1);
    expect(mockResetExtendKitCache).toHaveBeenCalledTimes(1);
  });

  // Removing with the wrong tool is not a loud failure — it is a command that
  // succeeds against a store the package was never in, so the user is told it
  // was removed while it is still installed.
  it('removes with the manager that owns `claude`, not a hardcoded npm', async () => {
    mockResolveClaudePaths.mockResolvedValue([
      '/Users/someone/.volta/bin/claude',
      '/Users/someone/.volta/tools/image/packages/@anthropic-ai/claude-code/bin/claude',
    ]);
    mockExecFile.mockImplementation(fakeExecFile({ stdout: 'ok' }));

    await uninstallCcbHandler('c1', msg, mockConns(), bridge);

    expect(spawnedArgv(0)).toContain('volta uninstall @swttch/extend-kit');
    expect(spawnedArgv(0)).not.toContain('npm uninstall');
  });

  it('returns a runnable command on a permission failure and does NOT clear the caches', async () => {
    mockExecFile.mockImplementation(fakeExecFile({
      err: Object.assign(new Error('Command failed'), { code: 1 }),
      stderr: 'npm error code EACCES\nnpm error EACCES: permission denied',
    }));
    const conns = mockConns();

    await uninstallCcbHandler('c1', msg, conns, bridge);

    const p = lastPayload(conns);
    expect(p.status).toBe('error');
    expect(String(p.error)).toContain('npm uninstall -g @swttch/extend-kit');
    // The kit is still installed, so the caches still describe reality.
    expect(mockResetUsageCache).not.toHaveBeenCalled();
    expect(mockResetExtendKitCache).not.toHaveBeenCalled();
  });

  it('surfaces a generic failure output', async () => {
    mockExecFile.mockImplementation(fakeExecFile({
      err: new Error('Command failed'),
      stderr: 'npm error network ETIMEDOUT',
    }));
    const conns = mockConns();

    await uninstallCcbHandler('c1', msg, conns, bridge);

    const p = lastPayload(conns);
    expect(p.status).toBe('error');
    expect(String(p.error)).toContain('network ETIMEDOUT');
  });
});
