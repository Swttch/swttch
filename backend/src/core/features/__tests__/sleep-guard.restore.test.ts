import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * The guard lasts only as long as the backend, but the user's choice must outlive
 * it: a user who turned sleep prevention on expects it back after Swttch restarts.
 * The evidence is the user's recorded click and nothing else. A backend shutting
 * down for any reason must not rewrite that record.
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
}

type Mod = typeof import('../sleep-guard');
type Handler = () => void;

let ccgHome: string;
let platformSpy: ReturnType<typeof vi.spyOn>;

async function load(): Promise<{ mod: Mod; handlers: Map<string, Handler[]> }> {
  vi.resetModules();
  const handlers = new Map<string, Handler[]>();
  const onSpy = vi.spyOn(process, 'on').mockImplementation(((event: string, h: Handler) => {
    handlers.set(event, [...(handlers.get(event) ?? []), h]);
    return process;
  }) as never);
  const mod = await import('../sleep-guard');
  onSpy.mockRestore();
  return { mod, handlers };
}

const file = (): string => join(ccgHome, 'sleep-guard.json');

beforeEach(() => {
  vi.clearAllMocks();
  ccgHome = mkdtempSync(join(tmpdir(), 'ccg-sleep-'));
  process.env.CCG_HOME = ccgHome;
  platformSpy = vi.spyOn(process, 'platform', 'get');
  platformSpy.mockReturnValue('darwin');
  mockSpawn.mockImplementation((() => new FakeProcess()) as never);
});

afterEach(() => {
  platformSpy.mockRestore();
  delete process.env.CCG_HOME;
  rmSync(ccgHome, { recursive: true, force: true });
});

describe('restoring the sleep guard after the backend restarts', () => {
  it('puts the guard back when the user had it on', async () => {
    writeFileSync(file(), JSON.stringify({ enabled: true }));
    const { mod } = await load();

    await mod.restoreSleepGuardState();

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(mod.getSleepGuardStatus().enabled).toBe(true);
  });

  it('leaves it off when the user had it off', async () => {
    writeFileSync(file(), JSON.stringify({ enabled: false }));
    const { mod } = await load();

    await mod.restoreSleepGuardState();

    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mod.getSleepGuardStatus().enabled).toBe(false);
  });

  it('leaves it off when the user never chose', async () => {
    const { mod } = await load();

    await mod.restoreSleepGuardState();

    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mod.getSleepGuardStatus().enabled).toBe(false);
  });

  it('treats a damaged file as "never chose" rather than turning the guard on', async () => {
    writeFileSync(file(), '{ not json');
    const { mod } = await load();

    await mod.restoreSleepGuardState();

    expect(mockSpawn).not.toHaveBeenCalled();
  });
});

describe('what records the choice', () => {
  it('the user turning it on and off is recorded', async () => {
    const { mod } = await load();

    await mod.persistSleepGuardIntent(true);
    expect(JSON.parse(readFileSync(file(), 'utf8'))).toEqual({ enabled: true });

    await mod.persistSleepGuardIntent(false);
    expect(JSON.parse(readFileSync(file(), 'utf8'))).toEqual({ enabled: false });
  });

  it('a backend shutting down does not rewrite the choice', async () => {
    writeFileSync(file(), JSON.stringify({ enabled: true }));
    const { mod, handlers } = await load();
    await mod.restoreSleepGuardState();

    for (const h of handlers.get('exit') ?? []) h();
    for (const h of handlers.get('SIGTERM') ?? []) h();
    await new Promise((r) => setTimeout(r, 20));

    expect(JSON.parse(readFileSync(file(), 'utf8'))).toEqual({ enabled: true });
  });

  it('enabling or disabling the guard by itself does not write the file', async () => {
    const { mod } = await load();

    await mod.enableSleepGuard();
    await mod.disableSleepGuard();

    expect(existsSync(file())).toBe(false);
  });
});
