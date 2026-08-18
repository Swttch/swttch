import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs so ensureProfile()/writeProfile() never touch the real home directory
// (same isolation style as settings.test.ts).
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import {
  ensureProfile,
  getAnnouncementsEnabled,
  setAnnouncementsEnabled,
} from '../profile';

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);
const mockExistsSync = vi.mocked(existsSync);

describe('profile announcementsEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
  });

  it('defaults to true when no profile.json exists yet', async () => {
    mockExistsSync.mockReturnValue(false);

    const profile = await ensureProfile();

    expect(profile.announcementsEnabled).toBe(true);
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const written = JSON.parse((mockWriteFile.mock.calls[0][1] as string));
    expect(written.announcementsEnabled).toBe(true);
  });

  it('normalizes a missing announcementsEnabled field (legacy profile.json) to true and rewrites', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        uuid: 'existing-uuid',
        telemetryConsent: { status: 'accepted', decidedAt: '2026-01-01T00:00:00.000Z' },
        dismissedAnnouncementIds: [],
        // announcementsEnabled intentionally absent
      }),
    );

    const profile = await ensureProfile();

    expect(profile.announcementsEnabled).toBe(true);
    expect(profile.uuid).toBe('existing-uuid');
    expect(mockWriteFile).toHaveBeenCalledTimes(1); // rewritten to normalize
  });

  it('normalizes a corrupt (non-boolean) announcementsEnabled value to true and rewrites', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        uuid: 'existing-uuid',
        telemetryConsent: { status: 'pending', decidedAt: null },
        dismissedAnnouncementIds: [],
        announcementsEnabled: 'yes',
      }),
    );

    const profile = await ensureProfile();

    expect(profile.announcementsEnabled).toBe(true);
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
  });

  it('preserves an explicit false without rewriting', async () => {
    mockExistsSync.mockReturnValue(true);
    // Every field must be present and valid: a profile missing any of them is
    // repaired on read, which would itself trigger the write this asserts against.
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        uuid: 'existing-uuid',
        telemetryConsent: { status: 'pending', decidedAt: null },
        dismissedAnnouncementIds: [],
        announcementsEnabled: false,
        runnerBestScore: 0,
        voicePrompt: { status: 'pending', askedAt: null, decidedAt: null },
      }),
    );

    const profile = await ensureProfile();

    expect(profile.announcementsEnabled).toBe(false);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('getAnnouncementsEnabled() reads the current value', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        uuid: 'existing-uuid',
        telemetryConsent: { status: 'pending', decidedAt: null },
        dismissedAnnouncementIds: [],
        announcementsEnabled: false,
      }),
    );

    expect(await getAnnouncementsEnabled()).toBe(false);
  });

  it('setAnnouncementsEnabled() persists the new value and returns the updated profile', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        uuid: 'existing-uuid',
        telemetryConsent: { status: 'pending', decidedAt: null },
        dismissedAnnouncementIds: [],
        announcementsEnabled: true,
      }),
    );

    const profile = await setAnnouncementsEnabled(false);

    expect(profile.announcementsEnabled).toBe(false);
    // First write from ensureProfile's read-path rewrite check would not fire here
    // (value was already a clean boolean); the write we assert on is the explicit set.
    const writeCalls = mockWriteFile.mock.calls;
    const lastWritten = JSON.parse(writeCalls[writeCalls.length - 1][1] as string);
    expect(lastWritten.announcementsEnabled).toBe(false);
  });
});
