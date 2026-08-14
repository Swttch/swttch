import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Command runs through child_process; stub it so nothing actually installs.
// execFileSync is stubbed because augmented-path may probe for nvm.
vi.mock('child_process', () => ({
  execFile: vi.fn(),
  spawn: vi.fn(() => ({ on: vi.fn() })),
  execFileSync: vi.fn(() => ''),
}));
// Spy on the cache reset without pulling the real usage module's other exports.
vi.mock('../getUsage', () => ({ resetUsageCache: vi.fn() }));
vi.mock('../../extend-kit', () => ({ resetExtendKitCache: vi.fn() }));

import { execFile as cpExecFile } from 'child_process';
import { installCcbHandler } from '../installCcb';
import { resetUsageCache } from '../getUsage';
import { resetExtendKitCache } from '../../extend-kit';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

const mockExecFile = vi.mocked(cpExecFile);
const mockResetUsageCache = vi.mocked(resetUsageCache);
const mockResetExtendKitCache = vi.mocked(resetExtendKitCache);
const bridge = {} as Bridge;
const msg: IPCMessage = { type: MessageType.INSTALL_CCB, payload: {}, timestamp: 0, requestId: 'req-1' };

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

let execPathSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  // The install command now depends on which manager owns the running Node, so
  // these tests would otherwise assert whatever the developer's machine uses.
  // Pin a plain system Node; the volta case sets its own.
  execPathSpy = vi.spyOn(process, 'execPath', 'get');
  execPathSpy.mockReturnValue('/usr/local/bin/node');
});

afterEach(() => {
  execPathSpy.mockRestore();
});

describe('installCcbHandler', () => {
  it('runs `npm install -g @swttch/extend-kit`, acks ok, and clears the usage cache', async () => {
    mockExecFile.mockImplementation(fakeExecFile({ stdout: 'added 1 package' }));
    const conns = mockConns();

    await installCcbHandler('c1', msg, conns, bridge);

    expect(lastPayload(conns)).toEqual({ requestId: 'req-1', status: 'ok' });
    expect(mockResetUsageCache).toHaveBeenCalledTimes(1);
    // The loader caches having found no kit. Leaving that cache in place makes
    // a successful install invisible: every later lookup still answers "not
    // installed", so the settings section stays locked after installing.
    expect(mockResetExtendKitCache).toHaveBeenCalledTimes(1);
    // Regardless of the win32 cmd.exe wrapping, the argv carries the install spec.
    const argv = (mockExecFile.mock.calls[0][1] as string[]).join(' ');
    expect(argv).toContain('install -g @swttch/extend-kit');
  });

  it.runIf(process.platform !== 'win32')(
    'runs the install through a login shell (unix) so npm resolves on GUI-launched backends, matching runCcbUsage',
    async () => {
      mockExecFile.mockImplementation(fakeExecFile({ stdout: 'added 1 package' }));
      const conns = mockConns();

      await installCcbHandler('c1', msg, conns, bridge);

      // A GUI-launched backend inherits a minimal PATH; runCcbUsage already runs
      // ccb via `$SHELL -l -i -c` so the rc-file PATH exposes it. The install must
      // resolve npm the same way instead of exec'ing `npm` directly (Direct mode),
      // which fails with ENOENT where only the login shell's PATH knows npm.
      const file = mockExecFile.mock.calls[0][0] as string;
      const args = mockExecFile.mock.calls[0][1] as string[];
      const userShell = process.env.SHELL || '/bin/sh';
      const expectedShell = /\/fish$/.test(userShell) ? '/bin/sh' : userShell;
      expect(file).toBe(expectedShell);
      expect(args).toEqual(['-l', '-i', '-c', 'npm install -g @swttch/extend-kit']);
    },
  );

  it('installs with volta when the running Node is a volta one', async () => {
    // `npm i -g` under volta installs into whichever Node's global folder the
    // shell's npm belongs to — on this machine /opt/homebrew, which the backend
    // never reads. The install then succeeds, says so, and changes nothing the
    // user can see. Handing it to volta puts it where volta's Node looks.
    execPathSpy.mockReturnValue('/Users/someone/.volta/tools/image/node/24.7.0/bin/node');
    mockExecFile.mockImplementation(fakeExecFile({ stdout: 'success' }));
    const conns = mockConns();

    await installCcbHandler('c1', msg, conns, bridge);

    const argv = (mockExecFile.mock.calls[0][1] as string[]).join(' ');
    expect(argv).toContain('volta install @swttch/extend-kit');
    expect(argv).not.toContain('npm install -g');
  });

  it('falls back to npm when no version manager owns the Node', async () => {
    mockExecFile.mockImplementation(fakeExecFile({ stdout: 'success' }));
    const conns = mockConns();

    await installCcbHandler('c1', msg, conns, bridge);

    const argv = (mockExecFile.mock.calls[0][1] as string[]).join(' ');
    expect(argv).toContain('npm install -g @swttch/extend-kit');
  });

  it('removes the predecessor and retries when volta refuses the name', async () => {
    // volta will not let two packages own `ccb`, and the old
    // claude-code-battery still does on machines that installed it before the
    // rename. Making the user uninstall it by hand for a collision we created
    // would be the wrong way round.
    execPathSpy.mockReturnValue('/Users/someone/.volta/tools/image/node/24.7.0/bin/node');
    const calls: string[] = [];
    mockExecFile.mockImplementation(((_f: string, a: readonly string[], _o: unknown, cb: Cb) => {
      const argv = (a as string[]).join(' ');
      calls.push(argv);
      const first = calls.length === 1;
      cb(
        first ? Object.assign(new Error('Command failed'), { code: 1 }) : null,
        '',
        first
          ? "error: Executable 'ccb' is already installed by claude-code-battery"
          : '',
      );
      return { on: vi.fn() };
    }) as never);
    const conns = mockConns();

    await installCcbHandler('c1', msg, conns, bridge);

    expect(calls[0]).toContain('volta install @swttch/extend-kit');
    expect(calls[1]).toContain('volta uninstall claude-code-battery');
    expect(calls[2]).toContain('volta install @swttch/extend-kit');
    expect(lastPayload(conns).status).toBe('ok');
  });

  it('does not uninstall anything for an unrelated failure', async () => {
    // The uninstall is only ever right for this one collision; a network error
    // must not take the old package with it.
    execPathSpy.mockReturnValue('/Users/someone/.volta/tools/image/node/24.7.0/bin/node');
    mockExecFile.mockImplementation(fakeExecFile({
      err: new Error('Command failed'),
      stderr: 'error: network timeout',
    }));
    const conns = mockConns();

    await installCcbHandler('c1', msg, conns, bridge);

    const argvs = mockExecFile.mock.calls.map((c) => (c[1] as string[]).join(' '));
    expect(argvs.some((a) => a.includes('uninstall'))).toBe(false);
    expect(lastPayload(conns).status).toBe('error');
  });

  it('returns a runnable command on a permission failure and does NOT clear the cache', async () => {
    mockExecFile.mockImplementation(fakeExecFile({
      err: Object.assign(new Error('Command failed'), { code: 1 }),
      stderr: 'npm error code EACCES\nnpm error EACCES: permission denied',
    }));
    const conns = mockConns();

    await installCcbHandler('c1', msg, conns, bridge);

    const p = lastPayload(conns);
    expect(p.status).toBe('error');
    expect(String(p.error)).toContain('npm install -g @swttch/extend-kit');
    expect(mockResetUsageCache).not.toHaveBeenCalled();
    expect(mockResetExtendKitCache).not.toHaveBeenCalled();
  });

  it('surfaces a generic failure output', async () => {
    mockExecFile.mockImplementation(fakeExecFile({
      err: new Error('Command failed'),
      stderr: 'npm error network ETIMEDOUT',
    }));
    const conns = mockConns();

    await installCcbHandler('c1', msg, conns, bridge);

    const p = lastPayload(conns);
    expect(p.status).toBe('error');
    expect(String(p.error)).toContain('network ETIMEDOUT');
  });
});
