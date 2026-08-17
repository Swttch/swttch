import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The launcher runs through child_process; stub it so nothing actually installs.
// execFileSync is stubbed because augmented-path may probe for nvm.
vi.mock('child_process', () => ({
  execFile: vi.fn(),
  spawn: vi.fn(() => ({ on: vi.fn() })),
  execFileSync: vi.fn(() => ''),
}));
// Spy on the cache reset without pulling the real usage module's other exports.
vi.mock('../getUsage', () => ({ resetUsageCache: vi.fn() }));
vi.mock('../../extend-kit', () => ({ resetExtendKitCache: vi.fn() }));
// The handler now asks where `claude` lives, because the manager that owns this
// machine's global packages is read off the CLI the user runs in a terminal
// before falling back to the running Node (#298). Stubbed so these tests assert
// the install command rather than the developer's own machine.
vi.mock('../getCliUpdateInfo', () => ({ resolveClaudePaths: vi.fn(async () => [null, null]) }));

import { execFile as cpExecFile } from 'child_process';
import { installCcbHandler } from '../installCcb';
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

/**
 * The effective `command args` string for the i-th spawn, platform-independent.
 * win32 wraps every launcher as `cmd.exe /d /s /c <command> <args...>`; unix runs
 * the launcher directly. Both are normalised back to `<command> <args...>`.
 */
function spawnedArgv(i: number): string {
  const file = mockExecFile.mock.calls[i][0] as string;
  const args = mockExecFile.mock.calls[i][1] as string[];
  return process.platform === 'win32' ? args.slice(3).join(' ') : [file, ...args].join(' ');
}

let execPathSpy: ReturnType<typeof vi.spyOn>;
const mockResolveClaudePaths = vi.mocked(resolveClaudePaths);

beforeEach(() => {
  vi.clearAllMocks();
  // The install command depends on which manager owns this machine's global
  // packages, so these tests would otherwise assert whatever the developer's
  // machine uses. Pin a Node under a directory that holds no `npm` sibling, so
  // the launcher falls back to the bare `npm` these assertions expect; the
  // sibling-pinning behaviour itself is covered in global-install-target.test.
  execPathSpy = vi.spyOn(process, 'execPath', 'get');
  execPathSpy.mockReturnValue('/nonexistent-for-tests/bin/node');
  mockResolveClaudePaths.mockResolvedValue([null, null]);
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
    expect(spawnedArgv(0)).toContain('npm install -g --prefix ');
  });

  it.runIf(process.platform !== 'win32')(
    'runs the launcher directly (no login shell), the same way the CLI updater does',
    async () => {
      mockExecFile.mockImplementation(fakeExecFile({ stdout: 'added 1 package' }));
      const conns = mockConns();

      await installCcbHandler('c1', msg, conns, bridge);

      // The old code ran `$SHELL -l -i -c "npm install ..."` to pick up the
      // rc-file PATH; a login-interactive shell can stall a non-interactive
      // backend (it hung under WSL). The shared runner instead resolves npm
      // through the augmented PATH and runs it DIRECTLY with shell:false — no
      // tokenization, no `-l -i -c`.
      const file = mockExecFile.mock.calls[0][0] as string;
      const args = mockExecFile.mock.calls[0][1] as string[];
      const opts = mockExecFile.mock.calls[0][2] as { shell?: boolean };
      expect(file).toBe('npm');
      expect(args.slice(0, 2)).toEqual(['install', '-g']);
      expect(args).toContain('@swttch/extend-kit');
      expect(opts.shell).toBe(false);
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

    expect(spawnedArgv(0)).toContain('volta install @swttch/extend-kit');
    expect(spawnedArgv(0)).not.toContain('npm install -g');
  });

  it('falls back to npm when no version manager owns the Node', async () => {
    mockExecFile.mockImplementation(fakeExecFile({ stdout: 'success' }));
    const conns = mockConns();

    await installCcbHandler('c1', msg, conns, bridge);

    expect(spawnedArgv(0)).toContain('npm install -g --prefix ');
  });

  // #298. The installer used to read the manager off `process.execPath` ALONE,
  // while the CLI updater read it off the `claude` binary. On a machine where
  // those disagree — a volta-managed claude with the backend running some other
  // Node — the install ran `npm i -g`, wrote into a global folder the loader
  // never reads, and reported success. The user saw "installed" and no voice
  // input. The `claude` the user runs in a terminal decides.
  it('installs with the manager that owns `claude`, not the one owning the backend Node', async () => {
    mockResolveClaudePaths.mockResolvedValue([
      '/Users/someone/.volta/bin/claude',
      '/Users/someone/.volta/tools/image/packages/@anthropic-ai/claude-code/bin/claude',
    ]);
    // A completely different world for the backend's own Node.
    execPathSpy.mockReturnValue('/opt/homebrew/bin/node');
    mockExecFile.mockImplementation(fakeExecFile({ stdout: 'success' }));
    const conns = mockConns();

    await installCcbHandler('c1', msg, conns, bridge);

    expect(spawnedArgv(0)).toContain('volta install @swttch/extend-kit');
    expect(spawnedArgv(0)).not.toContain('npm install -g');
  });

  // Homebrew installs Claude Code itself but cannot install an npm package, so
  // npm is the honest fallback — the point is that it must be an npm tied to the
  // backend's Node, which the launcher resolution guarantees.
  it('falls back to npm when `claude` came from a manager that cannot install npm packages', async () => {
    mockResolveClaudePaths.mockResolvedValue(['/opt/homebrew/bin/claude', '/opt/homebrew/Cellar/claude-code/1.0/bin/claude']);
    mockExecFile.mockImplementation(fakeExecFile({ stdout: 'success' }));
    const conns = mockConns();

    await installCcbHandler('c1', msg, conns, bridge);

    expect(spawnedArgv(0)).toContain('install -g ');
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
        first ? "error: Executable 'ccb' is already installed by claude-code-battery" : '',
      );
      return { on: vi.fn() };
    }) as never);
    const conns = mockConns();

    await installCcbHandler('c1', msg, conns, bridge);

    expect(spawnedArgv(0)).toContain('volta install @swttch/extend-kit');
    expect(spawnedArgv(1)).toContain('volta uninstall claude-code-battery');
    expect(spawnedArgv(2)).toContain('volta install @swttch/extend-kit');
    expect(lastPayload(conns).status).toBe('ok');
  });

  it('removes the predecessor with npm and retries when npm refuses the ccb shim (EEXIST)', async () => {
    // On npm/Windows the predecessor holds `ccb` from before the rename, and npm
    // refuses to overwrite its shim — `EEXIST: file exists, .../ccb.cmd` — without
    // ever naming the package. volta's explicit message is not the only way this
    // collision shows up, so the EEXIST form must trigger the same removal-and-
    // retry, using npm (not volta) to clear it.
    const calls: string[] = [];
    mockExecFile.mockImplementation(((_f: string, a: readonly string[], _o: unknown, cb: Cb) => {
      const argv = (a as string[]).join(' ');
      calls.push(argv);
      const first = calls.length === 1;
      cb(
        first ? Object.assign(new Error('Command failed'), { code: 1 }) : null,
        '',
        first
          ? 'npm error code EEXIST\nnpm error path /usr/local/bin/ccb.cmd\nnpm error EEXIST: file already exists'
          : '',
      );
      return { on: vi.fn() };
    }) as never);
    const conns = mockConns();

    await installCcbHandler('c1', msg, conns, bridge);

    expect(spawnedArgv(0)).toContain('npm install -g --prefix ');
    expect(spawnedArgv(1)).toContain('npm uninstall -g --prefix ');
    expect(spawnedArgv(2)).toContain('npm install -g --prefix ');
    expect(lastPayload(conns).status).toBe('ok');
    expect(mockResetExtendKitCache).toHaveBeenCalledTimes(1);
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

    const argvs = mockExecFile.mock.calls.map((_c, i) => spawnedArgv(i));
    expect(argvs.some((a) => a.includes('uninstall') || a.includes('remove'))).toBe(false);
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
    expect(String(p.error)).toContain('npm install -g --prefix ');
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
