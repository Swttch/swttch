import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ paths: vi.fn(), exec: vi.fn(), update: vi.fn(), resetTelemetry: vi.fn() }));
vi.mock('../handlers/getCliUpdateInfo', () => ({ resolveClaudePaths: mocks.paths }));
vi.mock('../handlers/updateCli', () => ({ runUpdateSpec: mocks.update }));
vi.mock('../features/telemetry', () => ({ resetCachedCliVersion: mocks.resetTelemetry }));
vi.mock('../claude', () => ({ Claude: { exec: mocks.exec } }));

const doctor = (autoUpdates: string) => ({
  stdout: `Running: native (2.1.223)\nConfig install method: native\nAuto-updates: ${autoUpdates}\nAuto-update channel: latest\n`,
  stderr: '',
});
const updated = { ok: true, output: 'Current version: 2.1.223\nChecking for updates to latest version...\nSuccessfully updated from 2.1.223 to version 2.1.283' };
const upToDate = (version: string) => ({ ok: true, output: `Current version: ${version}\nChecking for updates to latest version...\nClaude Code is up to date (${version})` });

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.paths.mockResolvedValue(['/home/dev/.local/bin/claude', '/home/dev/.local/share/claude/versions/2.1.223']);
  mocks.exec.mockResolvedValue(doctor('enabled'));
  mocks.update.mockResolvedValue(updated);
});
afterEach(() => { vi.useRealTimers(); });

async function load() { return import('../cli-auto-update'); }

describe('isAutoUpdateEnabled', () => {
  it('accepts only the enabled verdict', async () => {
    const { isAutoUpdateEnabled } = await load();
    expect(isAutoUpdateEnabled(doctor('enabled').stdout)).toBe(true);
    expect(isAutoUpdateEnabled('Auto-updates: enabled\r\nAuto-update channel: stable\r\n')).toBe(true);
    expect(isAutoUpdateEnabled(doctor('disabled (set by env: DISABLE_AUTOUPDATER)').stdout)).toBe(false);
    expect(isAutoUpdateEnabled(doctor('disabled (config)').stdout)).toBe(false);
    expect(isAutoUpdateEnabled(doctor('Managed by package manager').stdout)).toBe(false);
    expect(isAutoUpdateEnabled('Running: native (2.1.223)\n')).toBe(false);
  });
});

describe('parseUpdateOutput', () => {
  it('reads the active version and whether this run installed it', async () => {
    const { parseUpdateOutput } = await load();
    expect(parseUpdateOutput(updated.output)).toEqual({ version: '2.1.283', installed: true });
    expect(parseUpdateOutput(upToDate('2.1.283').output)).toEqual({ version: '2.1.283', installed: false });
    expect(parseUpdateOutput('Another Claude process (PID 42) is currently running. Please try again in a moment.')).toBeNull();
    expect(parseUpdateOutput('Updates are disabled by your administrator.')).toBeNull();
  });
});

describe('checkCliAutoUpdate', () => {
  it('updates a native install when claude doctor reports auto-updates enabled', async () => {
    expect(await (await load()).checkCliAutoUpdate()).toBe(true);
    expect(mocks.exec).toHaveBeenCalledWith(['doctor'], expect.objectContaining({ timeout: expect.any(Number) }));
    expect(mocks.update).toHaveBeenCalledWith('claude', ['update']);
    expect(mocks.resetTelemetry).toHaveBeenCalledOnce();
  });
  it.each([
    'disabled (set by env: DISABLE_AUTOUPDATER)',
    'disabled (set by env: DISABLE_UPDATES)',
    'disabled (set by env: CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC)',
    'disabled (config)',
  ])('leaves the CLI alone when auto-updates are %s', async verdict => {
    mocks.exec.mockResolvedValue(doctor(verdict));
    expect(await (await load()).checkCliAutoUpdate()).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([
    ['npm', '/home/dev/.npm-global/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe'],
    ['Homebrew', '/opt/homebrew/Caskroom/claude-code/2.1.223/claude'],
  ])('leaves %s installs to the manual update', async (_name, path) => {
    mocks.paths.mockResolvedValue([path, path]);
    expect(await (await load()).checkCliAutoUpdate()).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('reports nothing while the version stays the same', async () => {
    const { checkCliAutoUpdate } = await load();
    mocks.update.mockResolvedValue(upToDate('2.1.283'));
    expect(await checkCliAutoUpdate()).toBe(false);
    expect(await checkCliAutoUpdate()).toBe(false);
    expect(mocks.resetTelemetry).not.toHaveBeenCalled();
  });
  it('reports a version installed elsewhere since the last check', async () => {
    const { checkCliAutoUpdate } = await load();
    mocks.update.mockResolvedValue(upToDate('2.1.283'));
    expect(await checkCliAutoUpdate()).toBe(false);
    mocks.update.mockResolvedValue(upToDate('2.1.284'));
    expect(await checkCliAutoUpdate()).toBe(true);
  });
  it('survives a failing doctor or update', async () => {
    const { checkCliAutoUpdate } = await load();
    mocks.exec.mockRejectedValueOnce(new Error('timed out'));
    expect(await checkCliAutoUpdate()).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.update.mockResolvedValueOnce({ ok: false, output: 'Failed to check for updates' });
    expect(await checkCliAutoUpdate()).toBe(false);
  });
  it('shares one run between overlapping checks', async () => {
    const { checkCliAutoUpdate } = await load();
    const first = checkCliAutoUpdate();
    expect(checkCliAutoUpdate()).toBe(first);
    expect(await first).toBe(true);
    expect(mocks.update).toHaveBeenCalledOnce();
  });
});

describe('startCliAutoUpdate', () => {
  it('checks shortly after start, then every 30 minutes, and reports each update', async () => {
    vi.useFakeTimers();
    const onUpdated = vi.fn();
    (await load()).startCliAutoUpdate(onUpdated);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(mocks.update).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onUpdated).toHaveBeenCalledOnce();
    mocks.update.mockResolvedValue(upToDate('2.1.283'));
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(mocks.update).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(mocks.update).toHaveBeenCalledTimes(3);
    expect(onUpdated).toHaveBeenCalledOnce();
  });
});
