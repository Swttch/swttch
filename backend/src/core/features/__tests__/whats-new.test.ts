import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The popup opens once per installed version, and the decision is made while the backend starts.
 *
 * What is pinned here is the comparison itself: the version baked into the running bundle against
 * the one last recorded in profile.json. A fresh install has nothing recorded, and that case opens
 * the popup too — someone who just installed the plugin is exactly who the release notes are for.
 */

const getPluginVersion = vi.fn<[], string>();
const getWhatsNewSeenVersion = vi.fn<[], Promise<string | null>>();
const setWhatsNewSeenVersion = vi.fn<[string], Promise<string | null>>();

vi.mock('../../handlers/getVersion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../handlers/getVersion')>()),
  getPluginVersion: () => getPluginVersion(),
}));

vi.mock('../profile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../profile')>()),
  getWhatsNewSeenVersion: () => getWhatsNewSeenVersion(),
  setWhatsNewSeenVersion: (version: string) => setWhatsNewSeenVersion(version),
}));

/** Each case gets its own module instance, because the pending version is module state. */
async function loadModule() {
  vi.resetModules();
  return import('../whats-new');
}

beforeEach(() => {
  vi.clearAllMocks();
  setWhatsNewSeenVersion.mockResolvedValue(null);
});

describe('resolveWhatsNewOnStartup', () => {
  it('opens for an update, where the installed version differs from the recorded one', async () => {
    getPluginVersion.mockReturnValue('0.32.0');
    getWhatsNewSeenVersion.mockResolvedValue('0.31.0');

    const { resolveWhatsNewOnStartup, getPendingWhatsNewVersion } = await loadModule();

    expect(await resolveWhatsNewOnStartup()).toBe('0.32.0');
    expect(getPendingWhatsNewVersion()).toBe('0.32.0');
  });

  it('opens for a fresh install, which has no recorded version to compare against', async () => {
    getPluginVersion.mockReturnValue('0.32.0');
    getWhatsNewSeenVersion.mockResolvedValue(null);

    const { resolveWhatsNewOnStartup } = await loadModule();

    expect(await resolveWhatsNewOnStartup()).toBe('0.32.0');
  });

  it('stays closed when the same version is launched again', async () => {
    getPluginVersion.mockReturnValue('0.32.0');
    getWhatsNewSeenVersion.mockResolvedValue('0.32.0');

    const { resolveWhatsNewOnStartup, getPendingWhatsNewVersion } = await loadModule();

    expect(await resolveWhatsNewOnStartup()).toBeNull();
    expect(getPendingWhatsNewVersion()).toBeNull();
  });

  it('stays closed rather than failing the boot when the profile cannot be read', async () => {
    getPluginVersion.mockReturnValue('0.32.0');
    getWhatsNewSeenVersion.mockRejectedValue(new Error('profile.json is unreadable'));

    const { resolveWhatsNewOnStartup } = await loadModule();

    await expect(resolveWhatsNewOnStartup()).resolves.toBeNull();
  });
});

describe('markWhatsNewSeen', () => {
  it('records the shown version and stops offering it for the rest of this run', async () => {
    getPluginVersion.mockReturnValue('0.32.0');
    getWhatsNewSeenVersion.mockResolvedValue('0.31.0');

    const { resolveWhatsNewOnStartup, markWhatsNewSeen, getPendingWhatsNewVersion } =
      await loadModule();
    await resolveWhatsNewOnStartup();

    await markWhatsNewSeen('0.32.0');

    expect(setWhatsNewSeenVersion).toHaveBeenCalledWith('0.32.0');
    expect(getPendingWhatsNewVersion()).toBeNull();
  });

  it('still stops offering it when the write fails, so other open tabs do not raise it again', async () => {
    getPluginVersion.mockReturnValue('0.32.0');
    getWhatsNewSeenVersion.mockResolvedValue(null);
    setWhatsNewSeenVersion.mockRejectedValue(new Error('disk full'));

    const { resolveWhatsNewOnStartup, markWhatsNewSeen, getPendingWhatsNewVersion } =
      await loadModule();
    await resolveWhatsNewOnStartup();

    await expect(markWhatsNewSeen('0.32.0')).resolves.toBeUndefined();
    expect(getPendingWhatsNewVersion()).toBeNull();
  });
});
