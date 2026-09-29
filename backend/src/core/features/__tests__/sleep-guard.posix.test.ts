import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('child_process', () => ({
  exec: vi.fn(), execSync: vi.fn(), execFile: vi.fn(), execFileSync: vi.fn(),
  spawn: vi.fn(), spawnSync: vi.fn(),
}));

import { spawn as cpSpawn, spawnSync as cpSpawnSync } from 'child_process';
import { createFakeOs, loadSleepGuard, type FakeOs } from './fake-os';

/**
 * #485 on macOS and Linux.
 *
 * Both spawn their helper `detached`, which alone means a backend killed outright
 * leaves the helper running and reparented to init. Measured on both: `caffeinate`
 * stayed with ppid 1 and pmset kept reporting "asserting forever", and
 * `systemd-inhibit` stayed in its own list. So the helper watches the backend's pid.
 *
 * A held request does not stop a closed lid from sleeping the Mac (measured:
 * `Clamshell Sleep` with the request held). macOS also changes `pmset disablesleep`,
 * under the rule that we record what was there, follow an outsider, and put it back.
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

async function load(platform: NodeJS.Platform) {
  const loaded = await loadSleepGuard(platform);
  restore = loaded.restorePlatform;
  return loaded;
}

describe('macOS idle guard', () => {
  it('ties the assertion to the backend pid so it cannot be orphaned', async () => {
    const { mod } = await load('darwin');
    await mod.enableSleepGuard();

    expect(os.lastSpawn).toContain('caffeinate');
    expect(os.lastSpawn).toContain(`-w ${process.pid}`);
    // -i covers battery, where -s is documented to be ignored.
    expect(os.lastSpawn).toContain('-i');
  });
});

describe('macOS lid close (pmset disablesleep)', () => {
  it('is turned on while the guard is on and put back when it is turned off', async () => {
    const { mod } = await load('darwin');

    await mod.enableSleepGuard();
    expect(os.sleepDisabled).toBe(1);

    await mod.disableSleepGuard();
    expect(os.sleepDisabled).toBe(0);
  });

  it('leaves it on when the user had it on before us', async () => {
    os.sleepDisabled = 1;
    const { mod } = await load('darwin');

    await mod.enableSleepGuard();
    await mod.disableSleepGuard();

    expect(os.sleepDisabled).toBe(1);
  });

  it('asks macOS for permission once, then never again', async () => {
    os.authorized = false;
    const { mod } = await load('darwin');

    await mod.enableSleepGuard();
    expect(os.dialogs).toBe(1);
    expect(os.sleepDisabled).toBe(1);

    await mod.disableSleepGuard();
    await mod.enableSleepGuard();
    expect(os.dialogs).toBe(1);
  });

  it('never lets the password pass through this process', async () => {
    os.authorized = false;
    const { mod } = await load('darwin');
    await mod.enableSleepGuard();

    // The only thing spawned for authorization is macOS's own dialog, driven through
    // osascript, and nothing is ever written to its stdin.
    const dialog = os.commands.find((c) => c.startsWith('/usr/bin/osascript'));
    expect(dialog).toContain('with administrator privileges');
    expect(dialog).toContain('visudo -cf');
    expect(os.commands.filter((c) => /\bsudo\b.*-S\b/.test(c))).toEqual([]);
  });

  it('stays off, and changes nothing, when the user cancels the dialog', async () => {
    os.authorized = false;
    os.dialog = 'cancel';
    const { mod } = await load('darwin');

    await expect(mod.enableSleepGuard()).rejects.toThrow(/cancel/i);

    expect(mod.getSleepGuardStatus().enabled).toBe(false);
    expect(os.sleepDisabled).toBe(0);
    // The helper that was already holding the sleep request is not left behind.
    expect(os.helper?.kill).toHaveBeenCalledTimes(1);
  });

  it('is put back, synchronously, inside the exit handler', async () => {
    const { mod, runHandlers } = await load('darwin');
    await mod.enableSleepGuard();

    runHandlers('exit');

    expect(os.helper?.kill).toHaveBeenCalledTimes(1);
    expect(os.sleepDisabled).toBe(0);
  });

  it('follows an outsider, tells the user, and puts back THEIR value', async () => {
    vi.useFakeTimers();
    const { mod } = await load('darwin');
    const seen: string[] = [];
    mod.onSleepGuardStatusChange((s) => seen.push(s.externalChange));

    await mod.enableSleepGuard();
    os.sleepDisabled = 0; // the user turned it off by hand, in a terminal
    await vi.advanceTimersByTimeAsync(31_000);

    expect(seen).toEqual(['setting']);
    expect(os.sleepDisabled).toBe(0); // we do not fight

    await mod.disableSleepGuard();
    expect(os.sleepDisabled).toBe(0);
  });

  it('keeps the recorded original when a previous backend died holding it', async () => {
    writeFileSync(stateFile(), JSON.stringify({
      enabled: true, holders: [2_147_483_000], applied: { disableSleep: 1 }, external: { disableSleep: 0 },
    }));
    os.sleepDisabled = 1; // the dead backend left it on
    const { mod } = await load('darwin');

    await mod.enableSleepGuard();
    await mod.disableSleepGuard();

    expect(os.sleepDisabled).toBe(0);
  });

  it('is put back only by the last backend to let go', async () => {
    const { mod } = await load('darwin');
    await mod.enableSleepGuard();
    writeFileSync(stateFile(), JSON.stringify({ ...readState(), holders: [process.ppid, process.pid] }));

    await mod.disableSleepGuard();

    expect(os.sleepDisabled).toBe(1);
    expect(readState().holders).toEqual([process.ppid]);
  });
});

describe('Linux', () => {
  it('holds sleep AND the lid switch, tied to the backend pid', async () => {
    const { mod } = await load('linux');
    await mod.enableSleepGuard();

    expect(os.lastSpawn).toContain('systemd-inhibit');
    expect(os.lastSpawn).toContain('--what=sleep:handle-lid-switch');
    // The inhibitor lives as long as this command does, so it waits on the backend
    // rather than sleeping forever.
    expect(os.lastSpawn).toContain(`--pid=${process.pid}`);
    expect(os.lastSpawn).not.toContain('sleep infinity');
  });

  it('describes itself without claiming the tunnel is involved', async () => {
    const { mod } = await load('linux');
    await mod.enableSleepGuard();

    expect(os.lastSpawn).toMatch(/--why=/);
    expect(os.lastSpawn.toLowerCase()).not.toContain('tunnel');
  });

  it('changes no system setting: there is nothing to record or put back', async () => {
    const { mod } = await load('linux');
    await mod.enableSleepGuard();
    await mod.disableSleepGuard();

    expect(os.commands.filter((c) => /logind|systemctl|gsettings|pmset|powercfg/i.test(c))).toEqual([]);
  });
});
