import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  installation: vi.fn(), version: vi.fn(), reset: vi.fn(), tags: vi.fn(), run: vi.fn(), kitInstallation: vi.fn(),
}));
vi.mock('../session-mcp', () => ({
  getSessionMcpInstallation: mocks.installation, getSessionMcpVersion: mocks.version, resetSessionMcpCache: mocks.reset,
}));
vi.mock('../extend-kit', () => ({
  getExtendKitInstallation: mocks.kitInstallation, getExtendKitVersion: vi.fn(), resetExtendKitCache: vi.fn(),
}));
vi.mock('../handlers/getCliUpdateInfo', () => ({ fetchDistTags: mocks.tags }));
vi.mock('../run-launcher', () => ({ runLauncher: mocks.run }));
vi.mock('../handlers/getUsage', () => ({ resetUsageCache: vi.fn() }));

const installed = { root: '/Users/test/.volta/tools/image/packages/@swttch/session-manager-mcp/lib/node_modules', version: '0.1.0' };
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.installation.mockResolvedValue(installed);
  mocks.version.mockResolvedValue('0.1.1');
  mocks.tags.mockResolvedValue({ latest: '0.1.1' });
  mocks.run.mockResolvedValue({ ok: true, output: '' });
});
async function update() { return (await import('../extend-kit-update')).updateInstalledSessionMcp(); }

describe('startup update of the session-management MCP', () => {
  it('never installs a package that is not there', async () => {
    mocks.installation.mockResolvedValue(null);
    expect(await update()).toBe(false);
    expect(mocks.tags).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it('asks the registry about this package, not the kit', async () => {
    await update();
    expect(mocks.tags).toHaveBeenCalledWith('@swttch/session-manager-mcp');
    expect(mocks.kitInstallation).not.toHaveBeenCalled();
  });
  it('updates the existing Volta store with a pinned release and checks the version afterwards', async () => {
    expect(await update()).toBe(true);
    expect(mocks.run).toHaveBeenCalledWith(expect.any(String), ['install', '@swttch/session-manager-mcp@0.1.1'],
      expect.objectContaining({ env: { VOLTA_HOME: '/Users/test/.volta' } }));
  });
  it('does not report success when the version did not move', async () => {
    mocks.version.mockResolvedValue('0.1.0');
    expect(await update()).toBe(false);
  });
  it('checks once per boot', async () => {
    const mod = await import('../extend-kit-update');
    await mod.updateInstalledSessionMcp();
    await mod.updateInstalledSessionMcp();
    expect(mocks.tags).toHaveBeenCalledTimes(1);
  });
});

describe('automatic update of the session-management MCP outside the boot check', () => {
  const settle = () => new Promise<boolean>((resolve) => { settled = resolve; });
  let settled: (updated: boolean) => void;
  async function auto(latest = '0.1.1') {
    const mod = await import('../extend-kit-update');
    const done = settle();
    return { mod, running: mod.autoUpdateSessionMcp(latest, (updated) => settled(updated)), done };
  }

  it('updates an installed package that is behind, and reports when it is over', async () => {
    const { running, done } = await auto();
    expect(running).toBe(true);
    expect(await done).toBe(true);
    expect(mocks.run).toHaveBeenCalledWith(expect.any(String), ['install', '@swttch/session-manager-mcp@0.1.1'], expect.anything());
  });
  it('runs one attempt at a time and reports it once', async () => {
    const { mod, done } = await auto();
    const second = vi.fn();
    expect(mod.autoUpdateSessionMcp('0.1.1', second)).toBe(true);
    await done;
    expect(mocks.run).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });
  it('does not try the same release again by itself after an attempt did not reach it', async () => {
    mocks.run.mockResolvedValue({ ok: false, output: 'EACCES' });
    mocks.version.mockResolvedValue('0.1.0');
    const { mod, done } = await auto();
    expect(await done).toBe(false);
    expect(mod.autoUpdateSessionMcp('0.1.1', vi.fn())).toBe(false);
    expect(mocks.run).toHaveBeenCalledTimes(1);
    // A newer release is a new chance.
    expect(mod.autoUpdateSessionMcp('0.1.2', vi.fn())).toBe(true);
  });
  it('makes a manual install wait for the attempt in flight', async () => {
    let finishRun!: (value: { ok: boolean; output: string }) => void;
    mocks.run.mockReturnValue(new Promise((resolve) => { finishRun = resolve; }));
    const { mod, done } = await auto();
    let waited = false;
    const waiting = mod.waitForSessionMcpStartupUpdate().then(() => { waited = true; });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(waited).toBe(false);
    finishRun({ ok: true, output: '' });
    await done;
    await waiting;
    expect(waited).toBe(true);
  });
});
