import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('child_process', () => ({
  exec: vi.fn(), execSync: vi.fn(), execFile: vi.fn(), execFileSync: vi.fn(),
  spawn: vi.fn(), spawnSync: vi.fn(),
}));

import { spawn as cpSpawn, spawnSync as cpSpawnSync } from 'child_process';
import { createFakeOs, loadSleepGuard, SCHEME_A, SCHEME_B, type FakeOs } from './fake-os';

/**
 * #485 on Windows. The sleep guard changes ONE thing in the user's power plan, the
 * lid close action, and only while the guard is on. It never touches the sleep
 * timeouts the reporter had set to "Never", and it puts the lid setting back to what
 * it found, including after an outsider edits it and after the backend is gone.
 *
 * Judged by reading the simulated plan back, so any route to a setting, by any
 * author, shows up as the setting moving.
 */

let os: FakeOs;
let ccgHome: string;
let restore: () => void;

const stateFile = (): string => join(ccgHome, 'sleep-guard.json');
const readState = (): Record<string, unknown> => JSON.parse(readFileSync(stateFile(), 'utf8'));

beforeEach(() => {
  vi.clearAllMocks();
  ccgHome = mkdtempSync(join(tmpdir(), 'ccg-sleep-'));
  process.env.CCG_HOME = ccgHome;
  os = createFakeOs({ spawn: vi.mocked(cpSpawn), spawnSync: vi.mocked(cpSpawnSync) });
});

afterEach(() => {
  restore?.();
  delete process.env.CCG_HOME;
  rmSync(ccgHome, { recursive: true, force: true });
  vi.useRealTimers();
});

async function load() {
  const loaded = await loadSleepGuard('win32');
  restore = loaded.restorePlatform;
  return loaded;
}

describe("the user's own sleep timeouts (#485)", () => {
  it('are left exactly as they were across a full start, use and shutdown', async () => {
    // The reporter: AC "Never" set by himself, battery 10 min, guard never turned on.
    os.standby = { ac: 0, dc: 600 };
    const { mod, runHandlers } = await load();

    await mod.restoreSleepGuardState();
    expect(mod.getSleepGuardStatus().enabled).toBe(false);

    await mod.enableSleepGuard();
    await mod.disableSleepGuard();
    runHandlers('exit');
    runHandlers('SIGTERM');

    expect(os.standby).toEqual({ ac: 0, dc: 600 });
    expect(os.commands.filter((c) => /standby|STANDBYIDLE|SUB_SLEEP/i.test(c))).toEqual([]);
  });
});

describe('the sleep request', () => {
  it('is held by a helper process that waits on the backend', async () => {
    const { mod } = await load();
    await mod.enableSleepGuard();

    expect(mod.getSleepGuardStatus().enabled).toBe(true);
    const argv = os.lastSpawn.split(' ');
    const script = Buffer.from(argv[argv.indexOf('-EncodedCommand') + 1], 'base64').toString('utf16le');
    // ES_CONTINUOUS | ES_SYSTEM_REQUIRED, in decimal: PowerShell reads the hex form as a negative Int32.
    expect(script).toContain('SetThreadExecutionState');
    expect(script).toContain('2147483649');
    expect(script).toContain(`Get-Process -Id ${process.pid} `);
    expect(script).toContain('WaitForExit()');
    expect(script.toLowerCase()).not.toContain('powercfg');
  });

  it('stays off, and touches nothing, when the helper cannot hold it', async () => {
    os.helperBehavior = 'dies';
    const { mod } = await load();

    await expect(mod.enableSleepGuard()).rejects.toThrow(/sleep guard helper/i);

    expect(mod.getSleepGuardStatus().enabled).toBe(false);
    expect(os.lid[SCHEME_A]).toEqual({ ac: 1, dc: 1 });
  });

  it('is not reported on while the helper has said nothing', async () => {
    vi.useFakeTimers();
    os.helperBehavior = 'silent';
    const { mod } = await load();

    const pending = mod.enableSleepGuard();
    const settled = expect(pending).rejects.toThrow(/readiness/i);
    await vi.advanceTimersByTimeAsync(11_000);
    await settled;

    expect(mod.getSleepGuardStatus().enabled).toBe(false);
    expect(os.helper?.kill).toHaveBeenCalledTimes(1);
  });
});

describe('the lid close action', () => {
  it('is set to "do nothing" while the guard is on and put back when it is turned off', async () => {
    const { mod } = await load();

    await mod.enableSleepGuard();
    expect(os.lid[SCHEME_A]).toEqual({ ac: 0, dc: 0 });

    await mod.disableSleepGuard();
    expect(os.lid[SCHEME_A]).toEqual({ ac: 1, dc: 1 });
  });

  it('is put back, synchronously, inside the exit handler', async () => {
    const { mod, runHandlers } = await load();
    await mod.enableSleepGuard();

    runHandlers('exit');

    // No await between the handler and the assertions: an exit handler runs to the
    // end of its turn and no further, and the old release was two awaited calls.
    expect(os.helper?.kill).toHaveBeenCalledTimes(1);
    expect(os.lid[SCHEME_A]).toEqual({ ac: 1, dc: 1 });
  });

  it("restores the user's own value when it was not the default", async () => {
    os.lid[SCHEME_A] = { ac: 0, dc: 3 };
    const { mod } = await load();

    await mod.enableSleepGuard();
    await mod.disableSleepGuard();

    expect(os.lid[SCHEME_A]).toEqual({ ac: 0, dc: 3 });
  });

  it('follows an outsider who edits it, tells the user, and restores THEIR value', async () => {
    vi.useFakeTimers();
    const { mod } = await load();
    const seen: string[] = [];
    mod.onSleepGuardStatusChange((s) => seen.push(s.externalChange));

    await mod.enableSleepGuard();
    // Someone sets only the battery value back to "sleep" while we hold the setting.
    os.lid[SCHEME_A].dc = 1;
    await vi.advanceTimersByTimeAsync(31_000);

    expect(seen).toEqual(['setting']);
    expect(mod.getSleepGuardStatus().externalChange).toBe('setting');
    // We do not fight for our value.
    expect(os.lid[SCHEME_A]).toEqual({ ac: 0, dc: 1 });

    await mod.disableSleepGuard();
    // Their DC value stands. The AC value they never touched goes back to the original,
    // not to our 0.
    expect(os.lid[SCHEME_A]).toEqual({ ac: 1, dc: 1 });
  });

  it('tells the user when they switch power plan, and restores the plan we changed', async () => {
    vi.useFakeTimers();
    const { mod } = await load();

    await mod.enableSleepGuard();
    os.activeScheme = SCHEME_B;
    await vi.advanceTimersByTimeAsync(31_000);

    expect(mod.getSleepGuardStatus().externalChange).toBe('scheme');

    await mod.disableSleepGuard();
    expect(os.lid[SCHEME_A]).toEqual({ ac: 1, dc: 1 });
    expect(os.lid[SCHEME_B]).toEqual({ ac: 1, dc: 1 });
  });

  it('is not polled while the guard is off', async () => {
    vi.useFakeTimers();
    const { mod } = await load();
    await mod.enableSleepGuard();
    expect(vi.getTimerCount()).toBe(1);

    await mod.disableSleepGuard();
    os.commands.length = 0;
    await vi.advanceTimersByTimeAsync(120_000);

    // Polling costs a command every time it runs, so a leaked timer is a cost paid
    // for nothing. It is asked directly: a leaked timer that finds nothing to read
    // runs no command, and would slip past a check on commands alone.
    expect(vi.getTimerCount()).toBe(0);
    expect(os.commands).toEqual([]);
  });

  it('keeps the recorded original when a previous backend died holding it', async () => {
    // A backend killed outright never ran its release: the setting is still ours
    // in the file and on the system. Reading it now would record OUR value as the user's.
    writeFileSync(stateFile(), JSON.stringify({
      enabled: true, holders: [2_147_483_000],
      applied: { scheme: SCHEME_A, ac: 0, dc: 0 }, external: { scheme: SCHEME_A, ac: 1, dc: 1 },
    }));
    os.lid[SCHEME_A] = { ac: 0, dc: 0 };
    const { mod } = await load();

    await mod.enableSleepGuard();
    await mod.disableSleepGuard();

    expect(os.lid[SCHEME_A]).toEqual({ ac: 1, dc: 1 });
  });

  it('is put back only by the last backend to let go', async () => {
    const { mod } = await load();
    await mod.enableSleepGuard();
    // A second backend, alive, is holding the same setting.
    const state = readState();
    writeFileSync(stateFile(), JSON.stringify({ ...state, holders: [process.ppid, process.pid] }));

    await mod.disableSleepGuard();
    expect(os.lid[SCHEME_A]).toEqual({ ac: 0, dc: 0 });
    expect(readState().holders).toEqual([process.ppid]);
  });
});
