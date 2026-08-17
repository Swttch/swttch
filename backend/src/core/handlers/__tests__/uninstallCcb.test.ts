import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Nothing may actually uninstall; execFileSync is stubbed because augmented-path
// may probe for nvm.
vi.mock('child_process', () => ({
  execFile: vi.fn(),
  spawn: vi.fn(() => ({ on: vi.fn() })),
  execFileSync: vi.fn(() => ''),
}));
vi.mock('../getUsage', () => ({ resetUsageCache: vi.fn() }));
vi.mock('../../extend-kit', () => ({
  resetExtendKitCache: vi.fn(),
  // The handler decides success by re-resolving the kit, not by exit codes.
  getExtendKitVersion: vi.fn(async () => null),
}));
vi.mock('../getCliUpdateInfo', () => ({ resolveClaudePaths: vi.fn(async () => [null, null]) }));

import { execFile as cpExecFile } from 'child_process';
import { uninstallCcbHandler } from '../uninstallCcb';
import { resetUsageCache } from '../getUsage';
import { resetExtendKitCache, getExtendKitVersion } from '../../extend-kit';
import { resolveClaudePaths } from '../getCliUpdateInfo';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

const mockExecFile = vi.mocked(cpExecFile);
const mockResetUsageCache = vi.mocked(resetUsageCache);
const mockResetExtendKitCache = vi.mocked(resetExtendKitCache);
const mockGetVersion = vi.mocked(getExtendKitVersion);
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

/** Every `<command> <args...>` the handler spawned, normalised across win32. */
function allArgv(): string[] {
  return mockExecFile.mock.calls.map((c) => {
    const file = c[0] as string;
    const args = c[1] as string[];
    return process.platform === 'win32' ? args.slice(3).join(' ') : [file, ...args].join(' ');
  });
}

let execPathSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  execPathSpy = vi.spyOn(process, 'execPath', 'get');
  execPathSpy.mockReturnValue('/nonexistent-for-tests/bin/node');
  mockResolveClaudePaths.mockResolvedValue([null, null]);
  mockGetVersion.mockResolvedValue(null);
  mockExecFile.mockImplementation(fakeExecFile({ stdout: 'ok' }));
});

afterEach(() => {
  execPathSpy.mockRestore();
});

describe('uninstallCcbHandler', () => {
  it('acks ok once nothing can be resolved any more', async () => {
    const conns = mockConns();
    await uninstallCcbHandler('c1', msg, conns, bridge);
    expect(lastPayload(conns)).toEqual({ requestId: 'req-1', status: 'ok' });
  });

  // THE reason this handler sweeps. A machine can hold the same package twice —
  // volta's own store held 0.4.0 while `npm i -g` under volta's Node held 0.3.0
  // — and `volta uninstall` cleared only the first. Removing "with the manager
  // that would install today" leaves the other copy installed and reported.
  it('removes from every store, not just the one that would install today', async () => {
    mockResolveClaudePaths.mockResolvedValue([
      '/Users/someone/.volta/bin/claude',
      '/Users/someone/.volta/tools/image/packages/@anthropic-ai/claude-code/bin/claude',
    ]);

    await uninstallCcbHandler('c1', msg, mockConns(), bridge);

    const argv = allArgv();
    expect(argv[0]).toContain('volta uninstall @swttch/extend-kit');
    expect(argv.some((a) => a.includes('npm uninstall -g --prefix '))).toBe(true);
    expect(argv.some((a) => a.includes('pnpm remove -g @swttch/extend-kit'))).toBe(true);
    expect(argv.some((a) => a.includes('yarn global remove @swttch/extend-kit'))).toBe(true);
    expect(argv.some((a) => a.includes('bun remove -g @swttch/extend-kit'))).toBe(true);
  });

  // Most stores hold nothing, so most of the sweep fails. That is expected and
  // must not be reported: only a surviving copy means the delete did not work.
  it('ignores failures from stores that hold nothing', async () => {
    mockExecFile.mockImplementation(fakeExecFile({
      err: new Error('Command failed'),
      stderr: 'npm error code ENOENT',
    }));
    mockGetVersion.mockResolvedValue(null);
    const conns = mockConns();

    await uninstallCcbHandler('c1', msg, conns, bridge);

    expect(lastPayload(conns).status).toBe('ok');
  });

  // Exit codes come from five different tools and cannot be compared; the disk
  // is the only honest answer.
  it('reports failure when a copy survives, even though every command succeeded', async () => {
    mockExecFile.mockImplementation(fakeExecFile({ stdout: 'removed' }));
    mockGetVersion.mockResolvedValue('0.3.0');
    const conns = mockConns();

    await uninstallCcbHandler('c1', msg, conns, bridge);

    const p = lastPayload(conns);
    expect(p.status).toBe('error');
    expect(String(p.error)).toContain('0.3.0');
    expect(String(p.error)).toContain('still installed');
  });

  it('prefers a permission message when one of the stores was blocked', async () => {
    mockExecFile.mockImplementation(fakeExecFile({
      err: Object.assign(new Error('Command failed'), { code: 1 }),
      stderr: 'npm error code EACCES\nnpm error EACCES: permission denied',
    }));
    mockGetVersion.mockResolvedValue('0.3.0');
    const conns = mockConns();

    await uninstallCcbHandler('c1', msg, conns, bridge);

    const p = lastPayload(conns);
    expect(p.status).toBe('error');
    expect(String(p.error)).toContain('uninstall');
    expect(String(p.error)).toContain('sudo');
  });

  // The caches remember where the kit WAS, so the survivor check has to look at
  // the disk as it is now — which means clearing them BEFORE that check, not
  // only on success.
  it('clears both caches before deciding whether anything survived', async () => {
    mockGetVersion.mockResolvedValue('0.3.0');
    await uninstallCcbHandler('c1', msg, mockConns(), bridge);
    expect(mockResetUsageCache).toHaveBeenCalledTimes(1);
    expect(mockResetExtendKitCache).toHaveBeenCalledTimes(1);
  });
});
