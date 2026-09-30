import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  readCliAutoUpdateState,
  readNonessentialTrafficState,
  saveCliAutoUpdate,
  saveNonessentialTraffic,
} from '../cli-auto-update-setting';
import { CliAutoUpdateLockKind, CliUpdateChannel } from '../../../shared';

/**
 * The About toggle's reading of Claude Code's auto-update setting.
 *
 * The expected verdicts follow `claude doctor`'s `Auto-updates:` line in 2.1.284, which was
 * run against the same shapes of file: settings.json outranks the shell, "0" is not a
 * disabling value for DISABLE_AUTOUPDATER, and any value at all disables for
 * CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC.
 */

let root: string;
let configDir: string;
let managedDir: string;
let claudeJsonPath: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cli-auto-update-setting-'));
  configDir = join(root, 'claude');
  managedDir = join(root, 'managed');
  claudeJsonPath = join(root, '.claude.json');
  await mkdir(configDir, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const settingsFile = () => join(configDir, 'settings.json');

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + '\n');
}

function read(env: NodeJS.ProcessEnv = {}) {
  return readCliAutoUpdateState({ configDir, managedDir, claudeJsonPath, env });
}

describe('readCliAutoUpdateState', () => {
  it('is on, and unlocked, when nothing turns it off', async () => {
    expect(await read()).toMatchObject({ enabled: true, lock: null });
  });

  it('is off, and unlocked, when only the toggle\'s own variable turns it off', async () => {
    await writeJson(settingsFile(), { env: { DISABLE_AUTOUPDATER: '1' } });
    expect(await read()).toMatchObject({ enabled: false, lock: null });
  });

  it.each(['true', 'YES', ' on '])('reads %j as off, as the CLI does', async (value) => {
    await writeJson(settingsFile(), { env: { DISABLE_AUTOUPDATER: value } });
    expect((await read()).enabled).toBe(false);
  });

  it('lets settings.json outrank the inherited environment', async () => {
    await writeJson(settingsFile(), { env: { DISABLE_AUTOUPDATER: '0' } });
    expect((await read({ DISABLE_AUTOUPDATER: '1' })).enabled).toBe(true);
  });

  it('names the environment when a variable the toggle cannot remove turns it off', async () => {
    expect(await read({ DISABLE_AUTOUPDATER: '1' })).toMatchObject({
      enabled: false,
      lock: { kind: CliAutoUpdateLockKind.ENVIRONMENT, variable: 'DISABLE_AUTOUPDATER', path: null },
    });
  });

  it('still reports the environment when settings.json also turns it off', async () => {
    await writeJson(settingsFile(), { env: { DISABLE_AUTOUPDATER: '1' } });
    expect((await read({ DISABLE_AUTOUPDATER: '1' })).lock?.kind).toBe(CliAutoUpdateLockKind.ENVIRONMENT);
  });

  it('treats other variables in settings.json as a lock, since the toggle owns only one', async () => {
    await writeJson(settingsFile(), { env: { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' } });
    const state = await read();
    expect(state.enabled).toBe(false);
    expect(state.lock).toMatchObject({
      kind: CliAutoUpdateLockKind.USER_SETTINGS,
      variable: 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
    });
    expect(state.lock?.path).toBe(settingsFile());
  });

  it('reads DISABLE_UPDATES first, the way the CLI orders its checks', async () => {
    const state = await read({ DISABLE_UPDATES: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' });
    expect(state.lock?.variable).toBe('DISABLE_UPDATES');
  });

  it('ignores a false DISABLE_UPDATES but not an empty-looking NONESSENTIAL_TRAFFIC', async () => {
    expect((await read({ DISABLE_UPDATES: '0' })).enabled).toBe(true);
    expect((await read({ CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '0' })).enabled).toBe(false);
  });

  it('ignores a settings.local.json beside settings.json, which claude reads only in a project', async () => {
    await writeJson(join(configDir, 'settings.local.json'), { env: { DISABLE_AUTOUPDATER: '1' } });
    expect(await read()).toMatchObject({ enabled: true, lock: null });
  });

  it('lets managed settings outrank everything, drop-ins included', async () => {
    await writeJson(settingsFile(), { env: { DISABLE_UPDATES: '0' } });
    await writeJson(join(managedDir, 'managed-settings.d', '10-updates.json'), { env: { DISABLE_UPDATES: '1' } });
    const state = await read();
    expect(state.lock).toMatchObject({ kind: CliAutoUpdateLockKind.MANAGED_SETTINGS, variable: 'DISABLE_UPDATES' });
  });

  it('reads the legacy autoUpdates: false in the global config, unless a native install protects it', async () => {
    await writeJson(claudeJsonPath, { autoUpdates: false, installMethod: 'npm' });
    expect((await read()).lock).toMatchObject({ kind: CliAutoUpdateLockKind.GLOBAL_CONFIG, variable: null });
    await writeJson(claudeJsonPath, { autoUpdates: false, installMethod: 'native', autoUpdatesProtectedForNative: true });
    expect((await read()).enabled).toBe(true);
  });
});

describe('channel', () => {
  it('is latest when nothing names one, as the CLI defaults', async () => {
    expect((await read()).channel).toBe(CliUpdateChannel.LATEST);
  });

  it('reads autoUpdatesChannel from the user settings file', async () => {
    await writeJson(settingsFile(), { autoUpdatesChannel: 'stable' });
    expect((await read()).channel).toBe(CliUpdateChannel.STABLE);
  });

  it('lets managed settings outrank the user file, and ignores a value the CLI would reject', async () => {
    await writeJson(settingsFile(), { autoUpdatesChannel: 'stable' });
    await writeJson(join(managedDir, 'managed-settings.json'), { autoUpdatesChannel: 'rc' });
    expect((await read()).channel).toBe(CliUpdateChannel.RC);
    await writeJson(join(managedDir, 'managed-settings.json'), { autoUpdatesChannel: 'nightly' });
    expect((await read()).channel).toBe(CliUpdateChannel.STABLE);
  });
});

describe('saveCliAutoUpdate', () => {
  const original = {
    respectGitignore: true,
    env: { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', FOO: 'bar' },
    permissions: { allow: ['Bash(ls)'] },
    model: 'opus',
  };

  it('writes "1" when turned off and removes only that key when turned on', async () => {
    await writeJson(settingsFile(), original);
    const before = await readFile(settingsFile(), 'utf-8');

    expect(await saveCliAutoUpdate(false, configDir)).toEqual({ status: 'ok' });
    const off = JSON.parse(await readFile(settingsFile(), 'utf-8'));
    expect(off).toEqual({ ...original, env: { ...original.env, DISABLE_AUTOUPDATER: '1' } });

    expect(await saveCliAutoUpdate(true, configDir)).toEqual({ status: 'ok' });
    expect(await readFile(settingsFile(), 'utf-8')).toBe(before);
  });

  it('leaves a file without env as it was after an off and on round trip', async () => {
    await writeJson(settingsFile(), { model: 'opus' });
    const before = await readFile(settingsFile(), 'utf-8');
    await saveCliAutoUpdate(false, configDir);
    expect(JSON.parse(await readFile(settingsFile(), 'utf-8'))).toEqual({ model: 'opus', env: { DISABLE_AUTOUPDATER: '1' } });
    await saveCliAutoUpdate(true, configDir);
    expect(await readFile(settingsFile(), 'utf-8')).toBe(before);
  });

  it('creates the file when there is none', async () => {
    await saveCliAutoUpdate(false, configDir);
    expect(JSON.parse(await readFile(settingsFile(), 'utf-8'))).toEqual({ env: { DISABLE_AUTOUPDATER: '1' } });
    expect((await read()).enabled).toBe(false);
  });

  it('refuses to replace a file it cannot read', async () => {
    await writeFile(settingsFile(), '{ "model": "opus",');
    expect((await saveCliAutoUpdate(false, configDir)).status).toBe('error');
    expect(await readFile(settingsFile(), 'utf-8')).toBe('{ "model": "opus",');
  });

  it('refuses to replace an env that is not an object', async () => {
    await writeJson(settingsFile(), { env: 'nope' });
    const before = await readFile(settingsFile(), 'utf-8');
    expect((await saveCliAutoUpdate(false, configDir)).status).toBe('error');
    expect(await readFile(settingsFile(), 'utf-8')).toBe(before);
  });
});

describe('nonessential traffic', () => {
  const readTraffic = (env: NodeJS.ProcessEnv = {}) => readNonessentialTrafficState({ configDir, managedDir, env });
  const VARIABLE = 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC';

  it('is allowed when nothing sets the variable', async () => {
    expect(await readTraffic()).toMatchObject({ disabled: false, lock: null });
  });

  it('is limited by any non-empty value, as the CLI reads it', async () => {
    await writeJson(settingsFile(), { env: { [VARIABLE]: '0' } });
    expect((await readTraffic()).disabled).toBe(true);
  });

  it('writes "1" to limit it and removes the key to lift it, keeping the rest of the file', async () => {
    await writeJson(settingsFile(), { model: 'opus', env: { FOO: 'bar' } });
    await saveNonessentialTraffic(true, { configDir, env: {} });
    expect(JSON.parse(await readFile(settingsFile(), 'utf-8'))).toEqual({ model: 'opus', env: { FOO: 'bar', [VARIABLE]: '1' } });
    await saveNonessentialTraffic(false, { configDir, env: {} });
    expect(JSON.parse(await readFile(settingsFile(), 'utf-8'))).toEqual({ model: 'opus', env: { FOO: 'bar' } });
  });

  it('lifts a value exported in the shell by writing an empty one over it', async () => {
    const shell = { [VARIABLE]: '1' };
    expect((await readTraffic(shell)).disabled).toBe(true);
    await saveNonessentialTraffic(false, { configDir, env: shell });
    expect(JSON.parse(await readFile(settingsFile(), 'utf-8'))).toEqual({ env: { [VARIABLE]: '' } });
    expect(await readTraffic(shell)).toMatchObject({ disabled: false, lock: null });
    // The auto-update switch reads the same override.
    expect((await readCliAutoUpdateState({ configDir, managedDir, claudeJsonPath, env: shell })).enabled).toBe(true);
  });

  it('is locked only by managed settings', async () => {
    await writeJson(join(managedDir, 'managed-settings.json'), { env: { [VARIABLE]: '1' } });
    expect((await readTraffic()).lock).toMatchObject({ kind: CliAutoUpdateLockKind.MANAGED_SETTINGS, variable: VARIABLE });
  });
});
