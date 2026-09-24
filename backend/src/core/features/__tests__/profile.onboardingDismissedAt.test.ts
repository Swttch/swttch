import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs so ensureProfile()/writeProfile() never touch the real home directory
// (same isolation style as profile.runnerBestScore.test.ts).
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  // The profile is saved atomically (temp file + rename), so the mock has to
  // cover that whole path and not just writeFile.
  rename: vi.fn(),
  stat: vi.fn(),
  chmod: vi.fn(),
  unlink: vi.fn(),
}));
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { ensureProfile, getOnboardingDismissedAt, dismissOnboarding } from '../profile';

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);
const mockExistsSync = vi.mocked(existsSync);

const CLOSED_AT = '2026-02-03T04:05:06.000Z';

/** The profile as it would sit on disk, with the given dismissal value. */
const storedProfile = (onboardingDismissedAt: unknown) =>
  JSON.stringify({
    uuid: 'test-uuid',
    telemetryConsent: { status: 'accepted', decidedAt: '2026-01-01T00:00:00.000Z' },
    dismissedAnnouncementIds: [],
    announcementsEnabled: true,
    runnerBestScore: 0,
    // Present so the profile reads as complete: a missing field is normalized on
    // load and rewrites the file, which the "does not rewrite" case asserts against.
    voicePrompt: { status: 'pending', askedAt: null, decidedAt: null },
    whatsNewSeenVersion: '0.32.1',
    onboardingDismissedAt,
  });

/** The dismissal value in the most recent write to profile.json. */
const writtenDismissedAt = () => {
  const [, contents] = mockWriteFile.mock.calls.at(-1) ?? [];
  return JSON.parse(String(contents)).onboardingDismissedAt as string | null;
};

/**
 * When the onboarding card was closed has to outlive the window that closed it.
 *
 * The record lives here rather than in the webview because a JetBrains webview is
 * served from `http://localhost:<a port the OS picks at every launch>`, so its
 * localStorage is partitioned into a fresh empty store on every IDE restart
 * (#453). A record kept there would hold until the IDE was reopened and then
 * silently undo itself, and the card would come back at someone who had already
 * closed it.
 */
describe('profile onboardingDismissedAt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockExistsSync.mockReturnValue(true);
  });

  it('starts unclosed for a profile that has never seen the card', async () => {
    mockExistsSync.mockReturnValue(false);

    const profile = await ensureProfile();
    expect(profile.onboardingDismissedAt).toBeNull();
  });

  it('reads back the moment the card was closed', async () => {
    mockReadFile.mockResolvedValue(storedProfile(CLOSED_AT));

    expect(await getOnboardingDismissedAt()).toBe(CLOSED_AT);
  });

  it('records the moment the card is closed', async () => {
    mockReadFile.mockResolvedValue(storedProfile(null));

    const recorded = await dismissOnboarding();

    expect(recorded).not.toBeNull();
    expect(Date.parse(recorded as string)).not.toBeNaN();
    expect(writtenDismissedAt()).toBe(recorded);
  });

  // Closing twice is not a thing that can happen — a closed card is never raised
  // again — but if it somehow did, the first time is the one worth keeping.
  it('keeps the original moment when the card was already closed', async () => {
    mockReadFile.mockResolvedValue(storedProfile(CLOSED_AT));

    expect(await dismissOnboarding()).toBe(CLOSED_AT);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('treats a profile written before the card existed as unclosed', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        uuid: 'existing-uuid',
        telemetryConsent: { status: 'accepted', decidedAt: '2026-01-01T00:00:00.000Z' },
        dismissedAnnouncementIds: ['welcome'],
        announcementsEnabled: true,
      }),
    );

    const profile = await ensureProfile();

    expect(profile.onboardingDismissedAt).toBeNull();
    // Nothing else is disturbed while the field is filled in.
    const [, contents] = mockWriteFile.mock.calls.at(-1) ?? [];
    expect(JSON.parse(String(contents)).dismissedAnnouncementIds).toEqual(['welcome']);
  });

  // v0.32.2 recorded the same fact as a boolean under `onboardingDismissed`.
  // Someone who closed the card there has closed it, and a change of field must
  // not make it come back at them.
  it('carries a v0.32.2 dismissal over to the new field', async () => {
    const legacy = JSON.parse(storedProfile(null)) as Record<string, unknown>;
    delete legacy.onboardingDismissedAt;
    legacy.onboardingDismissed = true;
    mockReadFile.mockResolvedValue(JSON.stringify(legacy));

    const profile = await ensureProfile();

    // The old field said THAT it was closed but not when, so the migration is
    // the only moment available.
    expect(profile.onboardingDismissedAt).not.toBeNull();
    // Moved into the new field on that first read, so the old one is never
    // consulted again.
    expect(writtenDismissedAt()).toBe(profile.onboardingDismissedAt);
  });

  it('leaves a v0.32.2 profile that was never closed alone', async () => {
    const legacy = JSON.parse(storedProfile(null)) as Record<string, unknown>;
    delete legacy.onboardingDismissedAt;
    legacy.onboardingDismissed = false;
    mockReadFile.mockResolvedValue(JSON.stringify(legacy));

    const profile = await ensureProfile();

    expect(profile.onboardingDismissedAt).toBeNull();
    // False and absent mean the same thing, so there is nothing to repair and no
    // reason to touch the file.
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('does not rewrite an otherwise complete profile just because the field is absent', async () => {
    // Introducing a field must not touch every existing user's file on first read:
    // absent and null mean the same thing, so there is nothing to repair.
    const complete = JSON.parse(storedProfile(null)) as Record<string, unknown>;
    delete complete.onboardingDismissedAt;
    mockReadFile.mockResolvedValue(JSON.stringify(complete));

    await ensureProfile();

    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing field', undefined],
    ['an empty string', ''],
    ['a number', 1],
    ['a boolean', true],
    ['null', null],
  ])('repairs %s to null', async (_label, value) => {
    mockReadFile.mockResolvedValue(storedProfile(value));

    const profile = await ensureProfile();
    expect(profile.onboardingDismissedAt).toBeNull();
  });

  it('leaves the rest of the profile untouched when recording a dismissal', async () => {
    mockReadFile.mockResolvedValue(storedProfile(null));

    await dismissOnboarding();

    const [, contents] = mockWriteFile.mock.calls.at(-1) ?? [];
    const written = JSON.parse(String(contents));
    expect(written.uuid).toBe('test-uuid');
    expect(written.telemetryConsent.status).toBe('accepted');
    expect(written.whatsNewSeenVersion).toBe('0.32.1');
  });
});
