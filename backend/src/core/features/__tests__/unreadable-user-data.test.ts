import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, readFile, writeFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

/**
 * "Cannot be read" must never become "is empty" for a file in
 * `~/.claude-code-gui`, because the writers there read the whole file, change one
 * thing and save it back. Reading an unreadable file as empty makes that last
 * step replace everything the user had with a default.
 *
 * `atomic-json.ts` states the rule (issue #386) and enforces it for the JSON
 * files that can route through `updateJsonFile`. Four files cannot, and these are
 * the tests for those four:
 *
 *   profile.json              — telemetry consent, runner best score, dismissed
 *                               announcements, the version What's new was shown for
 *   settings.js               — every global preference (a JS module, not JSON)
 *   accounts.json             — which Claude accounts are saved, their pools and order
 *   scheduled-messages.json   — every session's "send later" reservations
 *                               (covered in scheduled-messages-store.test.ts)
 *
 * The real incident these were written for: a profile.json that had been emptied
 * held a telemetry consent accepted on 2026-06-21, and one backend start replaced
 * the whole file with defaults. `JSON.parse('')` throws, and the old catch wrote a
 * fresh profile over it.
 *
 * Every assertion below is about the BYTES ON DISK, not about what a function
 * returned. A refusal that still rewrote the file would satisfy a return-value
 * assertion and lose the user's data anyway.
 *
 * No fs mocking here on purpose: these tests write real files into the throwaway
 * home that `vitest.setup.ts` hands every test file, so what they prove is what
 * the filesystem actually holds afterwards.
 */

import {
  ensureProfile,
  loadProfile,
  readProfile,
  setTelemetryConsent,
  setAnnouncementsEnabled,
  setDismissedAnnouncement,
  setOnboardingDismissed,
  setRunnerBestScore,
  setVoicePromptDecision,
  setWhatsNewSeenVersion,
  ConsentStatus,
  VoicePromptStatus,
} from '../profile';
import { readSettingsFile, saveSettingToFile } from '../settings';
import { readRegistry, writeRegistry, upsertAccount, setCurrentAccount } from '../account-store';
import { AccountPoolStrategy, type StoredAccount } from '../../../shared';

const USER_DATA_DIR = join(homedir(), '.claude-code-gui');
const PROFILE_FILE = join(USER_DATA_DIR, 'profile.json');
const SETTINGS_FILE = join(USER_DATA_DIR, 'settings.js');
const REGISTRY_FILE = join(USER_DATA_DIR, 'accounts.json');

/** A complete, readable profile holding a consent the user really gave. */
const RECORDED_PROFILE = {
  uuid: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
  telemetryConsent: { status: 'accepted', decidedAt: '2026-06-21T19:36:06.957Z' },
  dismissedAnnouncementIds: ['ann-1', 'ann-2'],
  announcementsEnabled: true,
  runnerBestScore: 1234,
  voicePrompt: {
    status: 'accepted',
    askedAt: '2026-08-18T03:00:00.000Z',
    decidedAt: '2026-08-18T03:00:05.000Z',
  },
  whatsNewSeenVersion: '0.32.2',
  onboardingDismissed: true,
};

/** Every shape that parses to something we cannot read fields off, plus the two that do not parse. */
const UNREADABLE_CONTENTS: Array<[label: string, content: string]> = [
  ['an empty file', ''],
  ['whitespace only', '   \n  '],
  ['truncated JSON', '{"uuid": "abc", "telemetry'],
  ['not JSON at all', '{not json'],
  ['a JSON array', '[1, 2, 3]'],
  ['a JSON string', '"text"'],
  ['JSON null', 'null'],
];

beforeEach(async () => {
  await rm(USER_DATA_DIR, { recursive: true, force: true });
  await mkdir(USER_DATA_DIR, { recursive: true });
  vi.restoreAllMocks();
});

afterEach(async () => {
  await rm(USER_DATA_DIR, { recursive: true, force: true });
});

describe('profile.json that exists but cannot be read', () => {
  for (const [label, content] of UNREADABLE_CONTENTS) {
    it(`leaves ${label} exactly as it is instead of replacing it with defaults`, async () => {
      await writeFile(PROFILE_FILE, content, 'utf-8');

      await ensureProfile();

      expect(await readFile(PROFILE_FILE, 'utf-8')).toBe(content);
    });
  }

  it('reports the read failure as its own outcome rather than as an empty profile', async () => {
    await writeFile(PROFILE_FILE, '{not json', 'utf-8');

    const load = await loadProfile();

    expect(load.status).toBe('unreadable');
    if (load.status === 'unreadable') expect(load.reason).toBeTruthy();
  });

  it('answers reads with values that ask nothing it could not record', async () => {
    // A default profile would say PENDING here, which reopens the consent banner
    // at every launch while the answer cannot be saved. Every field takes the
    // value that keeps quiet instead.
    await writeFile(PROFILE_FILE, '', 'utf-8');

    const profile = await readProfile();

    expect(profile.telemetryConsent.status).toBe(ConsentStatus.DENIED);
    expect(profile.telemetryConsent.decidedAt).toBeNull();
    expect(profile.announcementsEnabled).toBe(false);
    expect(profile.voicePrompt.status).toBe(VoicePromptStatus.DECLINED);
    expect(profile.onboardingDismissed).toBe(true);
  });

  it('never reports PENDING consent, which is what put the banner back', async () => {
    await writeFile(PROFILE_FILE, '', 'utf-8');

    const profile = await readProfile();

    expect(profile.telemetryConsent.status).not.toBe(ConsentStatus.PENDING);
  });

  it('records the failure in the log, which the silent catch never did', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await writeFile(PROFILE_FILE, '{not json', 'utf-8');

    // A fresh module instance, because the "log this reason once" marker is module
    // state and an earlier test in this file may already have logged this reason.
    vi.resetModules();
    const fresh = await import('../profile');
    await fresh.ensureProfile();

    expect(errorLog).toHaveBeenCalled();
    const logged = errorLog.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(logged).toContain('profile.json');
  });

  it('still creates a profile when the file is absent, which loses nothing', async () => {
    expect(existsSync(PROFILE_FILE)).toBe(false);

    const profile = await ensureProfile();

    expect(existsSync(PROFILE_FILE)).toBe(true);
    // Absent is the one case where the defaults are the truth: there was no
    // decision on disk to preserve, so the consent question genuinely is open.
    expect(profile.telemetryConsent.status).toBe(ConsentStatus.PENDING);
    expect(profile.announcementsEnabled).toBe(true);
  });
});

describe('the writers that used to overwrite an unreadable profile', () => {
  const CORRUPT = '{"uuid": "abc", "telemetry';

  const writers: Array<[name: string, run: () => Promise<unknown>]> = [
    ['setTelemetryConsent', () => setTelemetryConsent(true)],
    ['setAnnouncementsEnabled', () => setAnnouncementsEnabled(false)],
    ['setDismissedAnnouncement', () => setDismissedAnnouncement('ann-9')],
    ['setOnboardingDismissed', () => setOnboardingDismissed(true)],
    ['setRunnerBestScore', () => setRunnerBestScore(99999)],
    ['setVoicePromptDecision', () => setVoicePromptDecision(true)],
    ['setWhatsNewSeenVersion', () => setWhatsNewSeenVersion('9.9.9')],
  ];

  for (const [name, run] of writers) {
    it(`${name} leaves the file untouched`, async () => {
      await writeFile(PROFILE_FILE, CORRUPT, 'utf-8');

      await run();

      expect(await readFile(PROFILE_FILE, 'utf-8')).toBe(CORRUPT);
    });
  }

  it('keeps writing normally once the file can be read again', async () => {
    // The refusal is about this file right now, not a latch that disables saving.
    await writeFile(PROFILE_FILE, JSON.stringify(RECORDED_PROFILE), 'utf-8');

    await setRunnerBestScore(99999);

    const saved = JSON.parse(await readFile(PROFILE_FILE, 'utf-8'));
    expect(saved.runnerBestScore).toBe(99999);
  });
});

describe('the incident: a recorded consent behind a file that stopped parsing', () => {
  it('does not erase the consent record, so it is still there when the file parses again', async () => {
    const original = JSON.stringify(RECORDED_PROFILE, null, 2) + '\n';
    await writeFile(PROFILE_FILE, original, 'utf-8');
    expect((await readProfile()).telemetryConsent.decidedAt).toBe('2026-06-21T19:36:06.957Z');

    // The file is emptied (a truncated write, a full disk, an interrupted save).
    await writeFile(PROFILE_FILE, '', 'utf-8');
    await ensureProfile();
    await setTelemetryConsent(true);
    await setRunnerBestScore(1);

    // Nothing was written over it, so restoring the bytes restores the user's
    // data in full. Under the old behaviour the consent, the score, the dismissed
    // announcements and the What's new version were all gone by now.
    expect(await readFile(PROFILE_FILE, 'utf-8')).toBe('');
    await writeFile(PROFILE_FILE, original, 'utf-8');
    const recovered = await readProfile();
    expect(recovered.telemetryConsent.status).toBe(ConsentStatus.ACCEPTED);
    expect(recovered.telemetryConsent.decidedAt).toBe('2026-06-21T19:36:06.957Z');
    expect(recovered.runnerBestScore).toBe(1234);
    expect(recovered.dismissedAnnouncementIds).toEqual(['ann-1', 'ann-2']);
    expect(recovered.whatsNewSeenVersion).toBe('0.32.2');
  });
});

describe('settings.js that exists but cannot be read', () => {
  const CORRUPT_SETTINGS = 'export default {not js';

  it('refuses to save one key over it, rather than writing the defaults back', async () => {
    await writeFile(SETTINGS_FILE, CORRUPT_SETTINGS, 'utf-8');

    const result = await saveSettingToFile('theme', 'dark');

    expect(result.status).toBe('error');
    expect(result.error).toMatch(/refusing to overwrite/);
    expect(await readFile(SETTINGS_FILE, 'utf-8')).toBe(CORRUPT_SETTINGS);
  });

  it('still answers readers with defaults, because a screen has to render something', async () => {
    await writeFile(SETTINGS_FILE, CORRUPT_SETTINGS, 'utf-8');

    const settings = await readSettingsFile();

    expect(settings.theme).toBe('system');
    // Reading must not have repaired the file behind the user's back either.
    expect(await readFile(SETTINGS_FILE, 'utf-8')).toBe(CORRUPT_SETTINGS);
  });

  it('saves normally when the file is readable', async () => {
    await writeFile(SETTINGS_FILE, 'export default {\n  theme: "light",\n}\n', 'utf-8');

    const result = await saveSettingToFile('theme', 'dark');

    expect(result.status).toBe('ok');
    expect(await readFile(SETTINGS_FILE, 'utf-8')).toContain('"dark"');
  });
});

describe('accounts.json that exists but cannot be read', () => {
  function account(id: string, email: string): StoredAccount {
    return {
      id,
      emailAddress: email,
      displayName: null,
      organizationName: null,
      subscriptionType: 'team',
      authMethod: 'claudeai',
      createdAt: 1,
      updatedAt: 1,
      usageCached: null,
      usageCachedAt: 0,
    } as StoredAccount;
  }

  const TWO_ACCOUNTS = {
    current: 'acc-aaaaaaaa-1111-2222-3333-444444444444',
    accounts: {
      'acc-aaaaaaaa-1111-2222-3333-444444444444': account(
        'acc-aaaaaaaa-1111-2222-3333-444444444444',
        'first@example.com',
      ),
      'acc-bbbbbbbb-1111-2222-3333-444444444444': account(
        'acc-bbbbbbbb-1111-2222-3333-444444444444',
        'second@example.com',
      ),
    },
    accountPools: [],
    accountOrder: [],
  };

  it('refuses to add an account over it, so the other saved accounts stay named', async () => {
    const original = JSON.stringify(TWO_ACCOUNTS, null, 2) + '\n';
    await writeFile(REGISTRY_FILE, original, 'utf-8');
    // Now the registry stops parsing while the two accounts are still in it.
    await writeFile(REGISTRY_FILE, original.slice(0, 40), 'utf-8');

    await expect(upsertAccount(account('acc-cccccccc-1111-2222-3333-444444444444', 'third@example.com')))
      .rejects.toThrow(/refusing to overwrite/);

    expect(await readFile(REGISTRY_FILE, 'utf-8')).toBe(original.slice(0, 40));
    // Restoring the bytes brings both accounts back, which is only possible
    // because nothing was written over them.
    await writeFile(REGISTRY_FILE, original, 'utf-8');
    expect(Object.keys((await readRegistry()).accounts)).toHaveLength(2);
  });

  it('refuses to move the active-account hint over it', async () => {
    const corrupt = '{"accounts": {"acc-';
    await writeFile(REGISTRY_FILE, corrupt, 'utf-8');

    await expect(setCurrentAccount('acc-aaaaaaaa-1111-2222-3333-444444444444')).rejects.toThrow(
      /refusing to overwrite/,
    );

    expect(await readFile(REGISTRY_FILE, 'utf-8')).toBe(corrupt);
  });

  it('still answers readers with an empty registry, and says so in the log', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await writeFile(REGISTRY_FILE, '{"accounts": {"acc-', 'utf-8');

    const registry = await readRegistry();

    expect(registry.accounts).toEqual({});
    const logged = errorLog.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(logged).toContain('accounts.json');
  });

  it('writes normally when the registry is readable', async () => {
    await writeRegistry({
      current: null,
      accounts: {},
      accountPools: [],
      accountOrder: [],
    });

    await upsertAccount(account('acc-dddddddd-1111-2222-3333-444444444444', 'fourth@example.com'));

    const saved = await readRegistry();
    expect(saved.accounts['acc-dddddddd-1111-2222-3333-444444444444'].emailAddress).toBe(
      'fourth@example.com',
    );
    // Keeps the enum import honest: the pool shape is unchanged by this work.
    expect(AccountPoolStrategy.ORDERED).toBeTruthy();
  });
});
