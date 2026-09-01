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
import {
  ensureProfile,
  getVoicePrompt,
  markVoicePromptAsked,
  setVoicePromptDecision,
  acceptVoicePromptForInstalledKit,
  VoicePromptStatus,
} from '../profile';

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);
const mockExistsSync = vi.mocked(existsSync);

/** The profile as it would sit on disk, with the given voicePrompt. */
const storedProfile = (voicePrompt: unknown) =>
  JSON.stringify({
    uuid: 'test-uuid',
    telemetryConsent: { status: 'accepted', decidedAt: '2026-01-01T00:00:00.000Z' },
    dismissedAnnouncementIds: [],
    announcementsEnabled: true,
    runnerBestScore: 0,
    voicePrompt,
  });

/** The voicePrompt in the most recent write to profile.json. */
const written = () => {
  const [, contents] = mockWriteFile.mock.calls.at(-1) ?? [];
  return JSON.parse(String(contents)).voicePrompt as {
    status: string;
    askedAt: string | null;
    decidedAt: string | null;
  };
};

describe('profile voicePrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockExistsSync.mockReturnValue(true);
  });

  it('starts pending for a profile that has never been asked', async () => {
    mockExistsSync.mockReturnValue(false);

    const profile = await ensureProfile();

    expect(profile.voicePrompt).toEqual({
      status: VoicePromptStatus.PENDING,
      askedAt: null,
      decidedAt: null,
    });
  });

  it('fills the field in on a profile written before voice input existed', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        uuid: 'legacy-uuid',
        telemetryConsent: { status: 'pending', decidedAt: null },
        dismissedAnnouncementIds: [],
        announcementsEnabled: true,
        runnerBestScore: 0,
        // voicePrompt intentionally absent
      }),
    );

    const profile = await ensureProfile();

    // Everyone who upgraded into this feature gets asked once, rather than
    // silently counting as having answered.
    expect(profile.voicePrompt.status).toBe(VoicePromptStatus.PENDING);
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it('normalizes an unknown status to pending', async () => {
    mockReadFile.mockResolvedValue(storedProfile({ status: 'maybe', askedAt: null, decidedAt: null }));

    const profile = await ensureProfile();

    expect(profile.voicePrompt.status).toBe(VoicePromptStatus.PENDING);
  });

  it('drops a decidedAt left behind on a pending profile', async () => {
    mockReadFile.mockResolvedValue(
      storedProfile({ status: 'pending', askedAt: '2026-01-01T00:00:00.000Z', decidedAt: '2026-01-02T00:00:00.000Z' }),
    );

    const profile = await ensureProfile();

    // Undecided but decided-at is a contradiction; the time it was asked stands.
    expect(profile.voicePrompt.decidedAt).toBeNull();
    expect(profile.voicePrompt.askedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('reads back a stored answer', async () => {
    mockReadFile.mockResolvedValue(
      storedProfile({
        status: 'declined',
        askedAt: '2026-01-01T00:00:00.000Z',
        decidedAt: '2026-01-01T00:00:05.000Z',
      }),
    );

    expect(await getVoicePrompt()).toEqual({
      status: VoicePromptStatus.DECLINED,
      askedAt: '2026-01-01T00:00:00.000Z',
      decidedAt: '2026-01-01T00:00:05.000Z',
    });
  });

  it('records when the question was shown without answering it', async () => {
    mockReadFile.mockResolvedValue(storedProfile({ status: 'pending', askedAt: null, decidedAt: null }));

    const prompt = await markVoicePromptAsked();

    // Shown is not answered: a user who closes the app here is asked again, and
    // stays distinguishable from one who was never asked.
    expect(prompt.status).toBe(VoicePromptStatus.PENDING);
    expect(prompt.askedAt).not.toBeNull();
    expect(prompt.decidedAt).toBeNull();
    expect(written().askedAt).toBe(prompt.askedAt);
  });

  it('re-asking moves askedAt to the latest time', async () => {
    mockReadFile.mockResolvedValue(
      storedProfile({ status: 'pending', askedAt: '2026-01-01T00:00:00.000Z', decidedAt: null }),
    );

    const prompt = await markVoicePromptAsked();

    expect(prompt.askedAt).not.toBe('2026-01-01T00:00:00.000Z');
  });

  it('does not re-ask a profile that already answered', async () => {
    mockReadFile.mockResolvedValue(
      storedProfile({
        status: 'accepted',
        askedAt: '2026-01-01T00:00:00.000Z',
        decidedAt: '2026-01-01T00:00:05.000Z',
      }),
    );

    const prompt = await markVoicePromptAsked();

    expect(prompt.askedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('records an accepted answer, keeping the time it was asked', async () => {
    mockReadFile.mockResolvedValue(
      storedProfile({ status: 'pending', askedAt: '2026-01-01T00:00:00.000Z', decidedAt: null }),
    );

    const prompt = await setVoicePromptDecision(true);

    expect(prompt.status).toBe(VoicePromptStatus.ACCEPTED);
    expect(prompt.askedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(prompt.decidedAt).not.toBeNull();
    expect(written().status).toBe('accepted');
  });

  it('records a declined answer', async () => {
    mockReadFile.mockResolvedValue(
      storedProfile({ status: 'pending', askedAt: '2026-01-01T00:00:00.000Z', decidedAt: null }),
    );

    const prompt = await setVoicePromptDecision(false);

    expect(prompt.status).toBe(VoicePromptStatus.DECLINED);
    expect(written().status).toBe('declined');
  });

  it('accepts without asking when the kit is already installed', async () => {
    mockReadFile.mockResolvedValue(storedProfile({ status: 'pending', askedAt: null, decidedAt: null }));

    const prompt = await acceptVoicePromptForInstalledKit();

    // Asking someone who has the kit whether to install it has no meaning, so
    // the question was never put on screen — askedAt stays null.
    expect(prompt.status).toBe(VoicePromptStatus.ACCEPTED);
    expect(prompt.askedAt).toBeNull();
    expect(prompt.decidedAt).not.toBeNull();
  });

  it('an installed kit does not overwrite an answer the user already gave', async () => {
    mockReadFile.mockResolvedValue(
      storedProfile({
        status: 'declined',
        askedAt: '2026-01-01T00:00:00.000Z',
        decidedAt: '2026-01-01T00:00:05.000Z',
      }),
    );

    const prompt = await acceptVoicePromptForInstalledKit();

    // Someone who said no and later installed the kit by hand keeps their answer.
    expect(prompt.status).toBe(VoicePromptStatus.DECLINED);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });
});
