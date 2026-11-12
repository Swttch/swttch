import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ merged: vi.fn(), installation: vi.fn(), reset: vi.fn(), exists: vi.fn(), read: vi.fn() }));
vi.mock('../features/settings', () => ({ readMergedSettings: mocks.merged }));
vi.mock('../extend-kit', () => ({
  getGlobalPackageInstallation: mocks.installation, resetGlobalPackageRoots: mocks.reset,
}));
vi.mock('node:fs', () => ({ existsSync: mocks.exists }));
vi.mock('node:fs/promises', () => ({ readFile: mocks.read }));

const root = '/g/node_modules';
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.installation.mockResolvedValue({ root, version: '0.1.1' });
  mocks.read.mockResolvedValue(JSON.stringify({ bin: { 'swttch-session-manager-mcp': 'src/cli.js' } }));
  mocks.exists.mockReturnValue(true);
});
const load = () => import('../session-mcp');

describe('normalizeSessionMcpSettings', () => {
  it('is on, with the two default areas, when nothing readable says otherwise', async () => {
    const { normalizeSessionMcpSettings } = await load();
    for (const raw of [undefined, null, 'on', 5, []]) {
      expect(normalizeSessionMcpSettings(raw)).toEqual({ enabled: true, areas: ['session_mgmt', 'session'] });
    }
  });
  it('turns off only for a real false, and drops names that are not areas', async () => {
    const { normalizeSessionMcpSettings } = await load();
    expect(normalizeSessionMcpSettings({ enabled: 'no' }).enabled).toBe(true);
    expect(normalizeSessionMcpSettings({ enabled: false }).enabled).toBe(false);
    expect(normalizeSessionMcpSettings({ enabled: true, areas: ['pr', '../evil', 'nope', 'sidebar'] }))
      .toEqual({ enabled: true, areas: ['sidebar', 'pr'] });
  });
});

describe('resolveInstalledSessionMcp', () => {
  it('attaches the areas that manage and start sessions once the package is installed, with no setting written', async () => {
    mocks.merged.mockResolvedValue({ settings: {} });
    const { resolveInstalledSessionMcp } = await load();
    expect(await resolveInstalledSessionMcp('/p')).toEqual({
      entry: '/g/node_modules/@swttch/session-manager-mcp/src/cli.js',
      areas: ['session_mgmt', 'session'],
    });
  });
  it('attaches nothing while a settings file turns it off, without even looking for the package', async () => {
    mocks.merged.mockResolvedValue({ settings: { sessionMcp: { enabled: false, areas: ['session_mgmt'] } } });
    const { resolveInstalledSessionMcp } = await load();
    expect(await resolveInstalledSessionMcp('/p')).toBeNull();
    expect(mocks.installation).not.toHaveBeenCalled();
  });
  it('attaches nothing when no area is chosen', async () => {
    mocks.merged.mockResolvedValue({ settings: { sessionMcp: { enabled: true, areas: [] } } });
    const { resolveInstalledSessionMcp } = await load();
    expect(await resolveInstalledSessionMcp('/p')).toBeNull();
  });
  it('attaches nothing, and installs nothing, when the package is missing', async () => {
    mocks.merged.mockResolvedValue({ settings: { sessionMcp: { enabled: true, areas: ['pr'] } } });
    mocks.installation.mockResolvedValue(null);
    const { resolveInstalledSessionMcp } = await load();
    expect(await resolveInstalledSessionMcp('/p')).toBeNull();
  });
  it('returns the entry named by the installed package\'s own bin, with the chosen areas', async () => {
    mocks.merged.mockResolvedValue({ settings: { sessionMcp: { enabled: true, areas: ['pr', 'session_mgmt'] } } });
    const { resolveInstalledSessionMcp } = await load();
    expect(await resolveInstalledSessionMcp('/p')).toEqual({
      entry: '/g/node_modules/@swttch/session-manager-mcp/src/cli.js',
      areas: ['session_mgmt', 'pr'],
    });
  });
  it('treats a bin file that does not exist as not installed, and re-checks after a reset', async () => {
    mocks.merged.mockResolvedValue({ settings: { sessionMcp: { enabled: true, areas: ['pr'] } } });
    mocks.exists.mockReturnValue(false);
    const { resolveInstalledSessionMcp, resetSessionMcpCache } = await load();
    expect(await resolveInstalledSessionMcp('/p')).toBeNull();
    mocks.exists.mockReturnValue(true);
    resetSessionMcpCache();
    expect(await resolveInstalledSessionMcp('/p')).not.toBeNull();
    expect(mocks.reset).toHaveBeenCalledWith('swttch-session-manager-mcp');
  });
  it('stops handing out the script once the package is removed in a terminal, with no restart', async () => {
    mocks.merged.mockResolvedValue({ settings: {} });
    const { resolveInstalledSessionMcp, resolveSessionMcpEntry } = await load();
    expect(await resolveInstalledSessionMcp('/p')).not.toBeNull();

    // `npm uninstall -g`: the script is gone and so is the installation.
    mocks.exists.mockReturnValue(false);
    mocks.installation.mockResolvedValue(null);

    expect(await resolveSessionMcpEntry()).toBeNull();
    expect(await resolveInstalledSessionMcp('/p')).toBeNull();
    // The remembered locations were dropped, so the package managers are asked again.
    expect(mocks.reset).toHaveBeenCalledWith('swttch-session-manager-mcp');
  });
});

describe('isSessionMcpInstalled', () => {
  it('says yes for an installed package and no for a missing one', async () => {
    const { isSessionMcpInstalled } = await load();
    expect(await isSessionMcpInstalled()).toBe(true);

    mocks.exists.mockReturnValue(false);
    mocks.installation.mockResolvedValue(null);
    expect(await isSessionMcpInstalled()).toBe(false);
  });

  it('asks for a fresh look when it misses, so a terminal install is seen without a restart', async () => {
    mocks.installation.mockResolvedValue(null);
    const { isSessionMcpInstalled } = await load();
    expect(await isSessionMcpInstalled()).toBe(false);
    expect(mocks.reset).toHaveBeenCalledWith('swttch-session-manager-mcp');

    mocks.installation.mockResolvedValue({ root, version: '0.2.0' });
    expect(await isSessionMcpInstalled()).toBe(true);
  });

  it('says yes for a server named by SWTTCH_SESSION_MCP_BIN without looking for a package', async () => {
    mocks.installation.mockResolvedValue(null);
    process.env.SWTTCH_SESSION_MCP_BIN = '/checkout/src/cli.js';
    try {
      const { isSessionMcpInstalled } = await load();
      expect(await isSessionMcpInstalled()).toBe(true);
      expect(mocks.installation).not.toHaveBeenCalled();
    } finally {
      delete process.env.SWTTCH_SESSION_MCP_BIN;
    }
  });
});

describe('a package installed in a terminal while the backend is running', () => {
  // Where global packages live is remembered from the last look, so the package stays unseen
  // until the remembered answer is dropped. The mock keeps that memory.
  function rememberedLookup() {
    let remembered: { root: string; version: string } | null = null;
    let onDisk: { root: string; version: string } | null = null;
    mocks.reset.mockImplementation(() => { remembered = onDisk; });
    mocks.installation.mockImplementation(async () => remembered);
    return { installInTerminal: () => { onDisk = { root, version: '0.1.1' }; } };
  }

  it('is seen by the start after the one that missed, with no restart and no settings screen', async () => {
    mocks.merged.mockResolvedValue({ settings: {} });
    const { installInTerminal } = rememberedLookup();
    const { resolveInstalledSessionMcp } = await load();
    installInTerminal();
    expect(await resolveInstalledSessionMcp('/p')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await resolveInstalledSessionMcp('/p')).toEqual({
      entry: '/g/node_modules/@swttch/session-manager-mcp/src/cli.js',
      areas: ['session_mgmt', 'session'],
    });
  });

  it('looks again at most once a minute while the package stays missing', async () => {
    mocks.merged.mockResolvedValue({ settings: {} });
    rememberedLookup();
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const { resolveInstalledSessionMcp } = await load();
    await resolveInstalledSessionMcp('/p');
    await resolveInstalledSessionMcp('/p');
    await resolveInstalledSessionMcp('/p');
    expect(mocks.reset).toHaveBeenCalledTimes(1);
    now.mockReturnValue(1_000_000 + 61_000);
    await resolveInstalledSessionMcp('/p');
    expect(mocks.reset).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });
});
