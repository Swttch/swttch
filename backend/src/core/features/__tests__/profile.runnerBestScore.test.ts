import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs so ensureProfile()/writeProfile() never touch the real home directory
// (same isolation style as profile.announcementsEnabled.test.ts).
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
import { ensureProfile, getRunnerBestScore, setRunnerBestScore } from '../profile';

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);
const mockExistsSync = vi.mocked(existsSync);

/** The profile as it would sit on disk, with the given best score. */
const storedProfile = (runnerBestScore: unknown) =>
  JSON.stringify({
    uuid: 'test-uuid',
    telemetryConsent: { status: 'accepted', decidedAt: '2026-01-01T00:00:00.000Z' },
    dismissedAnnouncementIds: [],
    announcementsEnabled: true,
    runnerBestScore,
    // Present so the profile reads as complete: a missing field is normalized on
    // load and rewrites the file, which the "does not rewrite" cases below assert
    // against.
    voicePrompt: { status: 'pending', askedAt: null, decidedAt: null },
  });

/** The score in the most recent write to profile.json. */
const writtenScore = () => {
  const [, contents] = mockWriteFile.mock.calls.at(-1) ?? [];
  return JSON.parse(String(contents)).runnerBestScore as number;
};

describe('profile runnerBestScore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockExistsSync.mockReturnValue(true);
  });

  it('starts at zero for a profile that has never played', async () => {
    mockExistsSync.mockReturnValue(false);

    const profile = await ensureProfile();
    expect(profile.runnerBestScore).toBe(0);
  });

  it('reads back a stored score', async () => {
    mockReadFile.mockResolvedValue(storedProfile(320));

    expect(await getRunnerBestScore()).toBe(320);
  });

  it('fills the field in on a profile written before the game existed', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        uuid: 'existing-uuid',
        telemetryConsent: { status: 'accepted', decidedAt: '2026-01-01T00:00:00.000Z' },
        dismissedAnnouncementIds: ['welcome'],
        announcementsEnabled: true,
      }),
    );

    const profile = await ensureProfile();

    expect(profile.runnerBestScore).toBe(0);
    // The repaired profile is written back, and nothing else is disturbed.
    expect(writtenScore()).toBe(0);
    const [, contents] = mockWriteFile.mock.calls.at(-1) ?? [];
    expect(JSON.parse(String(contents)).dismissedAnnouncementIds).toEqual(['welcome']);
  });

  it('records a score that beats the stored best', async () => {
    mockReadFile.mockResolvedValue(storedProfile(100));

    expect(await setRunnerBestScore(250)).toBe(250);
    expect(writtenScore()).toBe(250);
  });

  it('keeps the record when a later run scores lower', async () => {
    mockReadFile.mockResolvedValue(storedProfile(500));
    mockWriteFile.mockClear();

    // A finished run is reported unconditionally, so this must not overwrite.
    expect(await setRunnerBestScore(120)).toBe(500);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('ignores a score equal to the record rather than rewriting the file', async () => {
    mockReadFile.mockResolvedValue(storedProfile(300));
    mockWriteFile.mockClear();

    expect(await setRunnerBestScore(300)).toBe(300);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing field', undefined],
    ['a corrupted string', 'not a number'],
    ['a negative score', -50],
    ['NaN', null],
  ])('repairs %s to zero', async (_label, value) => {
    mockReadFile.mockResolvedValue(storedProfile(value));

    const profile = await ensureProfile();
    expect(profile.runnerBestScore).toBe(0);
  });

  it('stores whole points, so a fractional score cannot creep in', async () => {
    mockReadFile.mockResolvedValue(storedProfile(0));

    expect(await setRunnerBestScore(42.9)).toBe(42);
  });

  it('leaves the rest of the profile untouched when recording a score', async () => {
    mockReadFile.mockResolvedValue(storedProfile(10));

    await setRunnerBestScore(99);

    const [, contents] = mockWriteFile.mock.calls.at(-1) ?? [];
    const written = JSON.parse(String(contents));
    expect(written.uuid).toBe('test-uuid');
    expect(written.telemetryConsent.status).toBe('accepted');
    expect(written.announcementsEnabled).toBe(true);
  });
});
