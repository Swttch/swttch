import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('child_process', () => ({
  exec: vi.fn(), execSync: vi.fn(), execFile: vi.fn(), execFileSync: vi.fn(),
  spawn: vi.fn(), spawnSync: vi.fn(),
}));

import { spawn as cpSpawn, spawnSync as cpSpawnSync } from 'child_process';
import { createFakeOs, loadSleepGuard, type FakeOs } from './fake-os';

/**
 * The guard lasts only as long as the backend, but the user's choice must outlive
 * it: a user who turned sleep prevention on expects it back after Swttch restarts.
 * The evidence is the user's recorded click and nothing else. A backend shutting
 * down for any reason must not rewrite that record.
 */

let os: FakeOs;
let ccgHome: string;
let restore: () => void;

const file = (): string => join(ccgHome, 'sleep-guard.json');

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
});

async function load() {
  const loaded = await loadSleepGuard('darwin');
  restore = loaded.restorePlatform;
  return loaded;
}

describe('restoring the sleep guard after the backend restarts', () => {
  it('puts the guard back when the user had it on', async () => {
    writeFileSync(file(), JSON.stringify({ enabled: true }));
    const { mod } = await load();

    await mod.restoreSleepGuardState();

    expect(mod.getSleepGuardStatus().enabled).toBe(true);
    expect(os.sleepDisabled).toBe(1);
  });

  it('never shows a permission dialog nobody asked for', async () => {
    writeFileSync(file(), JSON.stringify({ enabled: true }));
    os.authorized = false;
    const { mod } = await load();

    await mod.restoreSleepGuardState();

    // The switch stays off until the user turns it on, which is when a dialog is expected.
    expect(os.dialogs).toBe(0);
    expect(mod.getSleepGuardStatus().enabled).toBe(false);
    expect(os.sleepDisabled).toBe(0);
    // The saved choice stays, so the next start (once authorized) restores it.
    expect(JSON.parse(readFileSync(file(), 'utf8')).enabled).toBe(true);
  });

  it('leaves it off when the user had it off', async () => {
    writeFileSync(file(), JSON.stringify({ enabled: false }));
    const { mod } = await load();

    await mod.restoreSleepGuardState();

    expect(mod.getSleepGuardStatus().enabled).toBe(false);
    expect(os.sleepDisabled).toBe(0);
  });

  it('leaves it off when the user never chose', async () => {
    const { mod } = await load();

    await mod.restoreSleepGuardState();

    expect(mod.getSleepGuardStatus().enabled).toBe(false);
  });

  it('treats a damaged file as "never chose" rather than turning the guard on', async () => {
    writeFileSync(file(), '{ not json');
    const { mod } = await load();

    await mod.restoreSleepGuardState();

    expect(mod.getSleepGuardStatus().enabled).toBe(false);
  });
});

describe('what records the choice', () => {
  it('the user turning it on and off is recorded, next to the rest of the state', async () => {
    const { mod } = await load();
    await mod.enableSleepGuard();

    await mod.persistSleepGuardIntent(true);
    const on = JSON.parse(readFileSync(file(), 'utf8'));
    expect(on.enabled).toBe(true);
    // Recording the choice must not erase what the lid setting needs to be put back.
    expect(on.external).toEqual({ disableSleep: 0 });

    await mod.persistSleepGuardIntent(false);
    expect(JSON.parse(readFileSync(file(), 'utf8')).enabled).toBe(false);
  });

  it('a backend shutting down does not rewrite the choice', async () => {
    writeFileSync(file(), JSON.stringify({ enabled: true }));
    const { mod, runHandlers } = await load();
    await mod.restoreSleepGuardState();

    runHandlers('exit');
    runHandlers('SIGTERM');

    expect(JSON.parse(readFileSync(file(), 'utf8')).enabled).toBe(true);
    // ...while the system setting it changed is put back.
    expect(os.sleepDisabled).toBe(0);
  });

  it('turning the guard on or off by itself does not record a choice', async () => {
    const { mod } = await load();

    await mod.enableSleepGuard();
    await mod.disableSleepGuard();

    expect(JSON.parse(readFileSync(file(), 'utf8')).enabled).toBeUndefined();
    expect(existsSync(file())).toBe(true);
  });
});
