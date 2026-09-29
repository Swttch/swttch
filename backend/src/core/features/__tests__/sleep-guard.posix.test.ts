import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

/**
 * #485, the macOS and Linux half: the helper must not outlive the backend.
 *
 * Both platforms spawn their helper `detached`, which on its own means a backend
 * killed outright (SIGKILL, a crash, a force quit) leaves the helper running and
 * reparented to init. Measured on both: `caffeinate` stayed with ppid 1 and pmset
 * still reported "asserting forever", and `systemd-inhibit` stayed in
 * `systemd-inhibit --list`. Either one is a machine that can never sleep again,
 * held by a process nobody can see a reason for.
 *
 * Neither platform can be fixed by an exit handler, because the case being
 * guarded against is precisely the one where no handler runs. The helper itself
 * has to watch the backend's pid.
 */

vi.mock('child_process', () => ({
  exec: vi.fn(),
  execSync: vi.fn(),
  execFile: vi.fn(),
  execFileSync: vi.fn(),
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

import { spawn as cpSpawn } from 'child_process';

const mockSpawn = vi.mocked(cpSpawn);

class FakeProcess extends EventEmitter {
  pid = 4321;
  unref = vi.fn();
  kill = vi.fn();
  stdin = null;
  stdout = null;
  stderr = null;
}

type SleepGuardModule = typeof import('../sleep-guard');

async function loadSleepGuard(platform: NodeJS.Platform): Promise<SleepGuardModule> {
  vi.resetModules();
  platformSpy = vi.spyOn(process, 'platform', 'get');
  platformSpy.mockReturnValue(platform);
  return import('../sleep-guard');
}

/** The full command line the helper was spawned with. */
function spawnedCommand(): string {
  const [command, args] = mockSpawn.mock.calls[0];
  return [String(command), ...((args as string[]) ?? [])].join(' ');
}

let platformSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockSpawn.mockImplementation((() => new FakeProcess()) as never);
});

afterEach(() => {
  platformSpy?.mockRestore();
});

describe('macOS sleep guard', () => {
  it('ties the assertion to the backend pid so it cannot be orphaned', async () => {
    const mod = await loadSleepGuard('darwin');
    await mod.enableSleepGuard();

    const command = spawnedCommand();
    expect(command).toContain('caffeinate');
    // -w releases the assertion when that pid exits. Measured without it:
    // caffeinate survived a SIGKILL of its parent and kept asserting.
    expect(command).toContain(`-w ${process.pid}`);
    // -i covers battery, where -s is documented to be ignored.
    expect(command).toContain('-i');
  });

  it('never reaches for a command that edits power configuration', async () => {
    const mod = await loadSleepGuard('darwin');
    await mod.enableSleepGuard();
    await mod.disableSleepGuard();

    for (const [command] of mockSpawn.mock.calls) {
      expect(String(command)).not.toMatch(/pmset|systemsetup/i);
    }
  });
});

describe('Linux sleep guard', () => {
  it('ties the inhibitor to the backend pid so it cannot be orphaned', async () => {
    const mod = await loadSleepGuard('linux');
    await mod.enableSleepGuard();

    const command = spawnedCommand();
    expect(command).toContain('systemd-inhibit');
    expect(command).toContain('--what=sleep');
    // The inhibitor lives as long as this command does, so the command must be a
    // wait on the backend rather than an unconditional forever-sleep.
    expect(command).toContain(`--pid=${process.pid}`);
    expect(command).not.toContain('sleep infinity');
  });

  it('describes itself to the user without claiming the tunnel is involved', async () => {
    // `--why` is what `systemd-inhibit --list` prints. Sleep prevention is
    // independent of the tunnel, so the reason must not name the tunnel.
    const mod = await loadSleepGuard('linux');
    await mod.enableSleepGuard();

    const command = spawnedCommand();
    expect(command).toMatch(/--why=/);
    expect(command.toLowerCase()).not.toContain('tunnel');
  });

  it('never reaches for a command that edits power configuration', async () => {
    const mod = await loadSleepGuard('linux');
    await mod.enableSleepGuard();
    await mod.disableSleepGuard();

    for (const [command] of mockSpawn.mock.calls) {
      expect(String(command)).not.toMatch(/logind\.conf|systemctl|gsettings/i);
    }
  });
});
