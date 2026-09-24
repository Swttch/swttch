import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The popup opens once per installed version, and the decision is made while the backend starts.
 *
 * What is pinned here is the comparison itself: the version baked into the running bundle against
 * the one last recorded in profile.json. A fresh install has nothing recorded, and that case opens
 * the popup too — someone who just installed the plugin is exactly who the release notes are for.
 */

// Typed as the function each one stands in for. Vitest 4 takes the whole
// signature here, where earlier versions took the arguments and the return as
// two parameters; written the old way these resolve to `never` and every call
// below fails to typecheck.
const getPluginVersion = vi.fn<() => string>();
const loadProfile = vi.fn<() => Promise<ProfileLoad>>();
const setWhatsNewSeenVersion = vi.fn<(version: string) => Promise<string | null>>();

vi.mock('../../handlers/getVersion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../handlers/getVersion')>()),
  getPluginVersion: () => getPluginVersion(),
}));

vi.mock('../profile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../profile')>()),
  loadProfile: () => loadProfile(),
  setWhatsNewSeenVersion: (version: string) => setWhatsNewSeenVersion(version),
}));

import type { ProfileLoad, ProfileData } from '../profile';

/**
 * The startup check reads the recorded version off the loaded profile, so the
 * stub has to hand back a whole profile. Only `whatsNewSeenVersion` is read here;
 * the rest is filled in to satisfy the type.
 */
function profileWithSeenVersion(whatsNewSeenVersion: string | null): ProfileData {
  return {
    uuid: 'uuid-for-test',
    telemetryConsent: { status: 'pending', decidedAt: null } as ProfileData['telemetryConsent'],
    dismissedAnnouncementIds: [],
    announcementsEnabled: true,
    runnerBestScore: 0,
    voicePrompt: { status: 'pending', askedAt: null, decidedAt: null } as ProfileData['voicePrompt'],
    whatsNewSeenVersion,
    onboardingDismissed: false,
  };
}

/** A readable profile that last showed the popup for `seen`. */
function readable(seen: string | null): ProfileLoad {
  return { status: 'ok', profile: profileWithSeenVersion(seen) };
}

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
    loadProfile.mockResolvedValue(readable('0.31.0'));

    const { resolveWhatsNewOnStartup, getPendingWhatsNewVersion } = await loadModule();

    expect(await resolveWhatsNewOnStartup()).toBe('0.32.0');
    expect(getPendingWhatsNewVersion()).toBe('0.32.0');
  });

  it('opens for a fresh install, which has no recorded version to compare against', async () => {
    getPluginVersion.mockReturnValue('0.32.0');
    loadProfile.mockResolvedValue(readable(null));

    const { resolveWhatsNewOnStartup } = await loadModule();

    expect(await resolveWhatsNewOnStartup()).toBe('0.32.0');
  });

  it('stays closed when the same version is launched again', async () => {
    getPluginVersion.mockReturnValue('0.32.0');
    loadProfile.mockResolvedValue(readable('0.32.0'));

    const { resolveWhatsNewOnStartup, getPendingWhatsNewVersion } = await loadModule();

    expect(await resolveWhatsNewOnStartup()).toBeNull();
    expect(getPendingWhatsNewVersion()).toBeNull();
  });

  it('stays closed rather than failing the boot when the profile cannot be read', async () => {
    getPluginVersion.mockReturnValue('0.32.0');
    loadProfile.mockRejectedValue(new Error('profile.json is unreadable'));

    const { resolveWhatsNewOnStartup } = await loadModule();

    await expect(resolveWhatsNewOnStartup()).resolves.toBeNull();
  });

  it('stays closed when the profile reports itself unreadable, rather than reopening every launch', async () => {
    // An unreadable profile answers `whatsNewSeenVersion: null`, and null differs
    // from every installed version — so comparing the value alone would open the
    // popup on every single launch, and the write that would record it is refused
    // for as long as the file stays unreadable. Reading the status is what stops
    // that loop.
    getPluginVersion.mockReturnValue('0.32.0');
    loadProfile.mockResolvedValue({
      status: 'unreadable',
      reason: 'Unexpected end of JSON input',
      profile: profileWithSeenVersion(null),
    });

    const { resolveWhatsNewOnStartup, getPendingWhatsNewVersion } = await loadModule();

    expect(await resolveWhatsNewOnStartup()).toBeNull();
    expect(getPendingWhatsNewVersion()).toBeNull();
  });
});

describe('markWhatsNewSeen', () => {
  it('records the shown version and stops offering it for the rest of this run', async () => {
    getPluginVersion.mockReturnValue('0.32.0');
    loadProfile.mockResolvedValue(readable('0.31.0'));

    const { resolveWhatsNewOnStartup, markWhatsNewSeen, getPendingWhatsNewVersion } =
      await loadModule();
    await resolveWhatsNewOnStartup();

    await markWhatsNewSeen('0.32.0');

    expect(setWhatsNewSeenVersion).toHaveBeenCalledWith('0.32.0');
    expect(getPendingWhatsNewVersion()).toBeNull();
  });

  it('still stops offering it when the write fails, so other open tabs do not raise it again', async () => {
    getPluginVersion.mockReturnValue('0.32.0');
    loadProfile.mockResolvedValue(readable(null));
    setWhatsNewSeenVersion.mockRejectedValue(new Error('disk full'));

    const { resolveWhatsNewOnStartup, markWhatsNewSeen, getPendingWhatsNewVersion } =
      await loadModule();
    await resolveWhatsNewOnStartup();

    await expect(markWhatsNewSeen('0.32.0')).resolves.toBeUndefined();
    expect(getPendingWhatsNewVersion()).toBeNull();
  });
});
