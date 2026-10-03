import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, utimes } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { CliUpdateChannel, MessageType, PackageManager, UpdateMode, type CliUpdateInfo } from '../../shared';

const mocks = vi.hoisted(() => ({
  state: vi.fn(),
  resetTelemetry: vi.fn(),
  execFile: vi.fn(),
}));
vi.mock('../features/cli-auto-update-setting', () => ({ readCliAutoUpdateState: mocks.state }));
vi.mock('../features/telemetry', () => ({ resetCachedCliVersion: mocks.resetTelemetry }));
vi.mock('../claude', () => ({ Claude: { applyConfigDir: vi.fn(async () => {}) } }));
vi.mock('child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('child_process')>()),
  execFile: mocks.execFile,
}));

const MINUTE = 60 * 1000;

function info(overrides: Partial<CliUpdateInfo> = {}): CliUpdateInfo & { status: string } {
  return {
    status: 'ok',
    cliVersion: '2.1.280',
    packageManager: PackageManager.VOLTA,
    updateMode: UpdateMode.VERSIONED,
    stable: '2.1.280',
    latest: '2.1.285',
    updatable: true,
    ...overrides,
  };
}

/** Stands in for the backend's router: answers the two messages the About screen sends. */
function router(current: CliUpdateInfo & { status: string } = info()) {
  let installed = current.cliVersion;
  const send = vi.fn(async (type: MessageType, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> => {
    if (type === MessageType.GET_CLI_UPDATE_INFO) return { ...current, cliVersion: installed };
    if (type === MessageType.UPDATE_CLI) {
      installed = (payload.version as string | undefined) ?? current.latest;
      return { status: 'ok', newVersion: installed };
    }
    throw new Error(`unexpected ${type}`);
  });
  return {
    send,
    setInstalled(version: string) { installed = version; },
    updates: () => send.mock.calls.filter(([type]) => type === MessageType.UPDATE_CLI),
  };
}

let home: string;
const realPlatform = process.platform;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  home = await mkdtemp(join(tmpdir(), 'cli-auto-update-'));
  process.env.CCG_HOME = home;
  // The Windows branch of the check asks `tasklist` whether claude.exe is running, and
  // `execFile` is mocked here. Left at the real platform, every test run on Windows waited
  // for an answer the mock never gave and timed out; the tests that are about Windows set
  // it themselves.
  Object.defineProperty(process, 'platform', { value: 'linux' });
  mocks.state.mockResolvedValue({ enabled: true, lock: null, settingsPath: '~/.claude/settings.json', channel: CliUpdateChannel.LATEST });
});

afterEach(async () => {
  vi.useRealTimers();
  delete process.env.CCG_HOME;
  Object.defineProperty(process, 'platform', { value: realPlatform });
  await rm(home, { recursive: true, force: true });
});

async function load() { return import('../cli-auto-update'); }

async function checkOnce(send: (type: MessageType, payload?: Record<string, unknown>) => Promise<Record<string, unknown>>) {
  const module = await load();
  module.startCliAutoUpdate(send, vi.fn());
  return module.checkCliAutoUpdate();
}

describe('targetVersion', () => {
  it('follows the channel and never downgrades', async () => {
    const { targetVersion } = await load();
    expect(targetVersion(info(), CliUpdateChannel.LATEST)).toBe('2.1.285');
    expect(targetVersion(info(), CliUpdateChannel.STABLE)).toBeNull();
    expect(targetVersion(info({ cliVersion: '2.1.270' }), CliUpdateChannel.STABLE)).toBe('2.1.280');
    expect(targetVersion(info({ cliVersion: '2.1.285' }), CliUpdateChannel.LATEST)).toBeNull();
    expect(targetVersion(info({ cliVersion: null }), CliUpdateChannel.LATEST)).toBeNull();
  });
});

describe('checkCliAutoUpdate', () => {
  it('sends what the Update button sends: the info request, then UPDATE_CLI with the version', async () => {
    const r = router();
    expect(await checkOnce(r.send)).toBe(true);
    expect(r.send.mock.calls.map(([type]) => type)).toEqual([MessageType.GET_CLI_UPDATE_INFO, MessageType.UPDATE_CLI]);
    expect(r.send).toHaveBeenLastCalledWith(MessageType.UPDATE_CLI, { version: '2.1.285' });
    expect(mocks.resetTelemetry).toHaveBeenCalledOnce();
  });

  it.each([
    [PackageManager.NPM], [PackageManager.PNPM], [PackageManager.YARN], [PackageManager.VOLTA],
  ])('updates a %s install to a concrete version', async (packageManager) => {
    const r = router(info({ packageManager, updateMode: UpdateMode.VERSIONED }));
    await checkOnce(r.send);
    expect(r.updates()).toEqual([[MessageType.UPDATE_CLI, { version: '2.1.285' }]]);
  });

  it.each([
    [PackageManager.NATIVE], [PackageManager.HOMEBREW], [PackageManager.WINGET],
  ])('updates a %s install with no version, as the button does', async (packageManager) => {
    const r = router(info({ packageManager, updateMode: UpdateMode.SIMPLE }));
    await checkOnce(r.send);
    expect(r.updates()).toEqual([[MessageType.UPDATE_CLI, {}]]);
  });

  it('updates to stable when autoUpdatesChannel is stable', async () => {
    mocks.state.mockResolvedValue({ enabled: true, lock: null, settingsPath: '', channel: CliUpdateChannel.STABLE });
    const r = router(info({ cliVersion: '2.1.270' }));
    await checkOnce(r.send);
    expect(r.updates()).toEqual([[MessageType.UPDATE_CLI, { version: '2.1.280' }]]);
  });

  it('asks nothing when Claude Code auto-updates are off', async () => {
    mocks.state.mockResolvedValue({ enabled: false, lock: null, settingsPath: '', channel: CliUpdateChannel.LATEST });
    const r = router();
    expect(await checkOnce(r.send)).toBe(false);
    expect(r.send).not.toHaveBeenCalled();
  });

  it('does not update an install the button cannot update, or one already current', async () => {
    const none = router(info({ packageManager: PackageManager.UNKNOWN, updateMode: UpdateMode.NONE }));
    expect(await checkOnce(none.send)).toBe(false);
    expect(none.updates()).toEqual([]);
    const current = router(info({ cliVersion: '2.1.285' }));
    expect(await checkOnce(current.send)).toBe(false);
    expect(current.updates()).toEqual([]);
  });

  it('reports a version installed elsewhere since the last check', async () => {
    const r = router(info({ cliVersion: '2.1.285' }));
    const module = await load();
    module.startCliAutoUpdate(r.send, vi.fn());
    expect(await module.checkCliAutoUpdate()).toBe(false);
    r.setInstalled('2.1.286');
    expect(await module.checkCliAutoUpdate()).toBe(true);
    expect(r.updates()).toEqual([]);
  });

  it('announces an update whose new version could not be read back', async () => {
    // UPDATE_CLI answers newVersion: null when `claude --version` times out, which happens on
    // the first run of a freshly installed binary. Measured on 2.1.285 installed by volta.
    const send = vi.fn(async (type: MessageType): Promise<Record<string, unknown>> =>
      type === MessageType.GET_CLI_UPDATE_INFO ? { ...info() } : { status: 'ok', newVersion: null });
    expect(await checkOnce(send)).toBe(true);
    expect(mocks.resetTelemetry).toHaveBeenCalledOnce();
  });

  it('survives a failing request', async () => {
    const send = vi.fn(async () => ({ status: 'error', error: 'offline' }));
    expect(await checkOnce(send)).toBe(false);
  });

  it('leaves the update to a backend that already holds the lock', async () => {
    await writeFile(join(home, 'cli-auto-update.lock'), '4242');
    const r = router();
    expect(await checkOnce(r.send)).toBe(false);
    expect(r.updates()).toEqual([]);
  });

  it('takes over a lock left by a backend that died mid-update', async () => {
    const lock = join(home, 'cli-auto-update.lock');
    await mkdir(home, { recursive: true });
    await writeFile(lock, '4242');
    const old = new Date(Date.now() - 11 * MINUTE);
    await utimes(lock, old, old);
    const r = router();
    expect(await checkOnce(r.send)).toBe(true);
  });

  it('on Windows, waits for every claude.exe to exit before a package-manager update', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    mocks.execFile.mockImplementation((_cmd, _args, _opts, callback) => callback(null, 'claude.exe  1234 Console 1 200,000 K\r\n'));
    const r = router();
    expect(await checkOnce(r.send)).toBe(false);
    expect(r.updates()).toEqual([]);

    mocks.execFile.mockImplementation((_cmd, _args, _opts, callback) => callback(null, 'INFO: No tasks are running which match the specified criteria.\r\n'));
    const idle = router();
    expect(await checkOnce(idle.send)).toBe(true);
  });

  it('on Windows, lets a native install update while claude.exe runs', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    mocks.execFile.mockImplementation((_cmd, _args, _opts, callback) => callback(null, 'claude.exe  1234\r\n'));
    const r = router(info({ packageManager: PackageManager.NATIVE, updateMode: UpdateMode.SIMPLE }));
    expect(await checkOnce(r.send)).toBe(true);
    expect(mocks.execFile).not.toHaveBeenCalled();
  });

  it('shares one run between overlapping checks', async () => {
    const r = router();
    const module = await load();
    module.startCliAutoUpdate(r.send, vi.fn());
    const first = module.checkCliAutoUpdate();
    expect(module.checkCliAutoUpdate()).toBe(first);
    expect(await first).toBe(true);
    expect(r.updates()).toHaveLength(1);
  });
});

describe('startCliAutoUpdate and triggerCliAutoUpdate', () => {
  it('ignores a trigger before the server has started it', async () => {
    (await load()).triggerCliAutoUpdate();
    await Promise.resolve();
    expect(mocks.state).not.toHaveBeenCalled();
  });

  it('checks once shortly after start, then never again on its own', async () => {
    vi.useFakeTimers();
    const r = router();
    const announce = vi.fn();
    (await load()).startCliAutoUpdate(r.send, announce);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(r.send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(announce).toHaveBeenCalledOnce());
    // An idle backend: hours pass, nothing spawns `claude`.
    await vi.advanceTimersByTimeAsync(6 * 60 * MINUTE);
    expect(r.send).toHaveBeenCalledTimes(2);
  });

  it('checks when a chat spawns claude, at most once per 30 minutes', async () => {
    vi.useFakeTimers();
    const r = router();
    const { startCliAutoUpdate, triggerCliAutoUpdate } = await load();
    startCliAutoUpdate(r.send, vi.fn());
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.waitFor(() => expect(r.send).toHaveBeenCalledTimes(2));

    await vi.advanceTimersByTimeAsync(29 * MINUTE);
    triggerCliAutoUpdate();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.state).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1 * MINUTE);
    triggerCliAutoUpdate();
    await vi.waitFor(() => expect(mocks.state).toHaveBeenCalledTimes(2));
  });

  it('does not start the half-hour wait when auto-updates were off', async () => {
    vi.useFakeTimers();
    const r = router();
    mocks.state.mockResolvedValue({ enabled: false, lock: null, settingsPath: '', channel: CliUpdateChannel.LATEST });
    const { startCliAutoUpdate, triggerCliAutoUpdate } = await load();
    startCliAutoUpdate(r.send, vi.fn());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(r.send).not.toHaveBeenCalled();

    // The user turns them on; the next chat, a minute later, checks at once.
    mocks.state.mockResolvedValue({ enabled: true, lock: null, settingsPath: '', channel: CliUpdateChannel.LATEST });
    await vi.advanceTimersByTimeAsync(1 * MINUTE);
    triggerCliAutoUpdate();
    await vi.waitFor(() => expect(r.updates()).toHaveLength(1));
  });

  it('checks at once when asked to, inside the half-hour wait', async () => {
    vi.useFakeTimers();
    const r = router(info({ cliVersion: '2.1.285' }));
    const { startCliAutoUpdate, triggerCliAutoUpdate, triggerCliAutoUpdateNow } = await load();
    startCliAutoUpdate(r.send, vi.fn());
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.waitFor(() => expect(mocks.state).toHaveBeenCalledTimes(1));

    triggerCliAutoUpdate();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.state).toHaveBeenCalledTimes(1);

    triggerCliAutoUpdateNow();
    await vi.waitFor(() => expect(mocks.state).toHaveBeenCalledTimes(2));
  });

  it('returns before the check finishes, so a spawn never waits on it', async () => {
    const { startCliAutoUpdate, triggerCliAutoUpdate } = await load();
    let answer: (value: Record<string, unknown>) => void = () => {};
    const send = vi.fn(() => new Promise<Record<string, unknown>>(resolve => { answer = resolve; }));
    startCliAutoUpdate(send, vi.fn());
    expect(triggerCliAutoUpdate()).toBeUndefined();
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    answer({ ...info(), cliVersion: '2.1.285' });
  });
});
