import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  installation: vi.fn(), version: vi.fn(), reset: vi.fn(), tags: vi.fn(), run: vi.fn(), usage: vi.fn(),
}));
vi.mock('../extend-kit', () => ({
  getExtendKitInstallation: mocks.installation, getExtendKitVersion: mocks.version, resetExtendKitCache: mocks.reset,
}));
vi.mock('../handlers/getCliUpdateInfo', () => ({ fetchDistTags: mocks.tags }));
vi.mock('../run-launcher', () => ({ runLauncher: mocks.run }));
vi.mock('../handlers/getUsage', () => ({ resetUsageCache: mocks.usage }));

const installed = { root: '/Users/test/.volta/tools/image/packages/@swttch/extend-kit/lib/node_modules', version: '0.4.0' };
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.installation.mockResolvedValue(installed);
  mocks.version.mockResolvedValue('0.5.0');
  mocks.tags.mockResolvedValue({ latest: '0.5.0' });
  mocks.run.mockResolvedValue({ ok: true, output: '' });
});

async function update() { return (await import('../extend-kit-update')).updateInstalledExtendKit(); }

describe('startup companion update', () => {
  it('does not query the registry or install for a missing kit', async () => {
    mocks.installation.mockResolvedValue(null);
    expect(await update()).toBe(false);
    expect(mocks.tags).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it.each([null, '0.4.0', '0.3.0'])('skips offline/current/newer installations (latest=%s)', async latest => {
    mocks.tags.mockResolvedValue({ latest });
    expect(await update()).toBe(false);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it('updates the existing Volta store, pins the release, and verifies the loaded version', async () => {
    expect(await update()).toBe(true);
    expect(mocks.run).toHaveBeenCalledWith(expect.any(String), ['install', '@swttch/extend-kit@0.5.0'],
      expect.objectContaining({ timeout: 180000, maxBuffer: 10485760, env: { VOLTA_HOME: '/Users/test/.volta' } }));
    expect(mocks.usage).toHaveBeenCalledOnce();
  });
  it('does not report success when the installed version has not changed', async () => {
    mocks.version.mockResolvedValue('0.4.0');
    expect(await update()).toBe(false);
    expect(mocks.usage).not.toHaveBeenCalled();
  });
  it('keeps boot running after a permission or timeout failure', async () => {
    mocks.run.mockResolvedValue({ ok: false, output: 'EACCES' });
    expect(await update()).toBe(false);
    expect(mocks.usage).not.toHaveBeenCalled();
  });
  it('cancels if uninstalled while checking the registry', async () => {
    mocks.installation.mockResolvedValueOnce(installed).mockResolvedValueOnce(null);
    expect(await update()).toBe(false);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it('does not update another pnpm store', async () => {
    mocks.installation.mockResolvedValue({ root: '/home/test/.local/share/pnpm/global/5/node_modules', version: '0.4.0' });
    mocks.run.mockResolvedValue({ ok: true, output: '/somewhere/else/node_modules' });
    expect(await update()).toBe(false);
    expect(mocks.run).toHaveBeenCalledOnce();
    expect(mocks.run.mock.calls[0][1]).toEqual(['root', '-g']);
  });
  it('updates yarn only when the same launcher reports the loaded store', async () => {
    mocks.installation.mockResolvedValue({ root: '/home/test/.config/yarn/global/node_modules', version: '0.4.0' });
    mocks.run.mockResolvedValueOnce({ ok: true, output: '/home/test/.config/yarn/global' }).mockResolvedValue({ ok: true, output: '' });
    expect(await update()).toBe(true);
    expect(mocks.run.mock.calls[1][1]).toEqual(['global', 'add', '@swttch/extend-kit@0.5.0']);
  });
  it('does not mutate after a malformed registry response', async () => {
    mocks.tags.mockResolvedValue({ latest: '99.0.0 --force' });
    expect(await update()).toBe(false);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('shares one update per boot and lets manual mutations wait for it', async () => {
    let finish = (_result: { ok: boolean; output: string }) => {};
    mocks.run.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { updateInstalledExtendKit, waitForExtendKitStartupUpdate } = await import('../extend-kit-update');
    const first = updateInstalledExtendKit();
    expect(updateInstalledExtendKit()).toBe(first);
    await vi.waitFor(() => expect(mocks.run).toHaveBeenCalledOnce());
    let done = false;
    const manual = waitForExtendKitStartupUpdate().then(() => { done = true; });
    expect(done).toBe(false);
    finish({ ok: true, output: '' });
    expect(await first).toBe(true);
    await manual;
    expect(done).toBe(true);
  });
});
