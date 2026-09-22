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
import { ensureProfile, getOnboardingDismissed, setOnboardingDismissed } from '../profile';

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);
const mockExistsSync = vi.mocked(existsSync);

/** The profile as it would sit on disk, with the given dismissal value. */
const storedProfile = (onboardingDismissed: unknown) =>
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
    onboardingDismissed,
  });

/** The dismissal in the most recent write to profile.json. */
const writtenDismissed = () => {
  const [, contents] = mockWriteFile.mock.calls.at(-1) ?? [];
  return JSON.parse(String(contents)).onboardingDismissed as boolean;
};

/**
 * Closing the onboarding checklist has to outlive the window it was closed in.
 *
 * The record lives here rather than in the webview because a JetBrains webview is
 * served from `http://localhost:<a port the OS picks at every launch>`, so its
 * localStorage is partitioned into a fresh empty store on every IDE restart
 * (#453). A dismissal kept there would hold until the IDE was reopened and then
 * silently undo itself.
 */
describe('profile onboardingDismissed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockExistsSync.mockReturnValue(true);
  });

  it('starts undismissed for a profile that has never seen the checklist', async () => {
    mockExistsSync.mockReturnValue(false);

    const profile = await ensureProfile();
    expect(profile.onboardingDismissed).toBe(false);
  });

  it('reads back a stored dismissal', async () => {
    mockReadFile.mockResolvedValue(storedProfile(true));

    expect(await getOnboardingDismissed()).toBe(true);
  });

  it('records a dismissal', async () => {
    mockReadFile.mockResolvedValue(storedProfile(false));

    expect(await setOnboardingDismissed(true)).toBe(true);
    expect(writtenDismissed()).toBe(true);
  });

  it('can be undone, so the record is not a one-way door', async () => {
    mockReadFile.mockResolvedValue(storedProfile(true));

    expect(await setOnboardingDismissed(false)).toBe(false);
    expect(writtenDismissed()).toBe(false);
  });

  it('treats a profile written before the checklist existed as undismissed', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        uuid: 'existing-uuid',
        telemetryConsent: { status: 'accepted', decidedAt: '2026-01-01T00:00:00.000Z' },
        dismissedAnnouncementIds: ['welcome'],
        announcementsEnabled: true,
      }),
    );

    const profile = await ensureProfile();

    expect(profile.onboardingDismissed).toBe(false);
    // Nothing else is disturbed while the field is filled in.
    const [, contents] = mockWriteFile.mock.calls.at(-1) ?? [];
    expect(JSON.parse(String(contents)).dismissedAnnouncementIds).toEqual(['welcome']);
  });

  it('does not rewrite an otherwise complete profile just because the field is absent', async () => {
    // Introducing a field must not touch every existing user's file on first read:
    // absent and false mean the same thing, so there is nothing to repair.
    const complete = JSON.parse(storedProfile(false)) as Record<string, unknown>;
    delete complete.onboardingDismissed;
    mockReadFile.mockResolvedValue(JSON.stringify(complete));

    await ensureProfile();

    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing field', undefined],
    ['a corrupted string', 'yes'],
    ['a number', 1],
    ['null', null],
  ])('repairs %s to false', async (_label, value) => {
    mockReadFile.mockResolvedValue(storedProfile(value));

    const profile = await ensureProfile();
    expect(profile.onboardingDismissed).toBe(false);
  });

  it('leaves the rest of the profile untouched when recording a dismissal', async () => {
    mockReadFile.mockResolvedValue(storedProfile(false));

    await setOnboardingDismissed(true);

    const [, contents] = mockWriteFile.mock.calls.at(-1) ?? [];
    const written = JSON.parse(String(contents));
    expect(written.uuid).toBe('test-uuid');
    expect(written.telemetryConsent.status).toBe('accepted');
    expect(written.whatsNewSeenVersion).toBe('0.32.1');
  });
});
