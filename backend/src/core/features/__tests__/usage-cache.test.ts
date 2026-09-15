import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The store writes under the user-data directory, so the suite gives it one of its own.
 * Without this the assertions would read whatever usage the developer's own machine had
 * cached, and pass or fail on state no fixture set up.
 */
const CCG_HOME = mkdtempSync(join(tmpdir(), 'ccg-usage-cache-test-'));
process.env.CCG_HOME = CCG_HOME;

const {
  LIVE_ACCOUNT_ID, armCooldown, clearCooldown, readCooldownUntil, readUsageSnapshot,
  writeUsageSnapshot, resetUsageStore, crossedReset, hasAnyWindow,
  USAGE_COOLDOWN_DEFAULT_SEC, USAGE_COOLDOWN_MAX_SEC, USAGE_CACHE_FRESH_TTL_MS,
} = await import('../usage-cache');

type Usage = Parameters<typeof writeUsageSnapshot>[1];

const OTHER_ACCOUNT = 'acc-11111111-2222-3333-4444-555555555555';

function usageWith(resetsAt: string | null, utilization = 42): Usage {
  return {
    five_hour: { utilization, resets_at: resetsAt },
    seven_day: null,
    seven_day_oauth_apps: null,
    seven_day_sonnet: null,
    seven_day_opus: null,
    seven_day_cowork: null,
    iguana_necktie: null,
    extra_usage: null,
  } as Usage;
}

const HOUR = 60 * 60 * 1000;

describe('usage store', () => {
  beforeEach(() => {
    resetUsageStore(LIVE_ACCOUNT_ID);
    resetUsageStore(OTHER_ACCOUNT);
  });

  afterAll(() => rmSync(CCG_HOME, { recursive: true, force: true }));

  describe('snapshots', () => {
    it('serves a read back', () => {
      const now = Date.now();
      writeUsageSnapshot(LIVE_ACCOUNT_ID, usageWith(new Date(now + HOUR).toISOString()), now);

      const stored = readUsageSnapshot(LIVE_ACCOUNT_ID, { now });

      expect(stored?.usage.five_hour).toEqual({ utilization: 42, resets_at: expect.any(String) });
      expect(stored?.stale).toBe(false);
    });

    // The question a caller has before spending a request is "can I skip it", which is
    // narrower than "do I have anything to show".
    it('withholds a snapshot older than the fresh window from freshOnly', () => {
      const written = Date.now() - USAGE_CACHE_FRESH_TTL_MS - 1000;
      const now = Date.now();
      writeUsageSnapshot(LIVE_ACCOUNT_ID, usageWith(new Date(now + HOUR).toISOString()), written);

      expect(readUsageSnapshot(LIVE_ACCOUNT_ID, { now, freshOnly: true })).toBeNull();
      expect(readUsageSnapshot(LIVE_ACCOUNT_ID, { now })?.stale).toBe(true);
    });

    /**
     * The trap TTL alone walks into: a five-hour window that reset two minutes ago still
     * has eight minutes of TTL left, and serving it shows the user a spent window that
     * has in fact just refilled. It reads as the number being stuck.
     */
    it('stops serving as fresh once a window has crossed its reset', () => {
      const now = Date.now();
      const written = now - 60_000;
      // One window rolled over between the write and now; the other is still ahead, so
      // the snapshot is NOT empty. Without the reset check it would be served as fresh,
      // which is the point: an emptied snapshot would be rejected for another reason and
      // the test would pass while the check did nothing.
      const rolled = {
        ...usageWith(new Date(now - 30_000).toISOString()),
        seven_day: { utilization: 20, resets_at: new Date(now + 3 * HOUR).toISOString() },
      } as Usage;
      writeUsageSnapshot(LIVE_ACCOUNT_ID, rolled, written);

      expect(readUsageSnapshot(LIVE_ACCOUNT_ID, { now, freshOnly: true })).toBeNull();
      // Still offered as a stale fallback, minus the window that rolled over.
      const fallback = readUsageSnapshot(LIVE_ACCOUNT_ID, { now });
      expect(fallback?.usage.five_hour).toBeNull();
      expect(fallback?.usage.seven_day).toMatchObject({ utilization: 20 });
    });

    it('drops an individual window whose reset has passed', () => {
      const now = Date.now();
      writeUsageSnapshot(LIVE_ACCOUNT_ID, usageWith(new Date(now - HOUR).toISOString()), now);

      // Nothing usable is left, so there is no snapshot to serve rather than one with an
      // expired window in it.
      expect(readUsageSnapshot(LIVE_ACCOUNT_ID, { now })).toBeNull();
    });

    it('refuses a snapshot stamped in the future, which a clock jump would produce', () => {
      const now = Date.now();
      writeUsageSnapshot(LIVE_ACCOUNT_ID, usageWith(new Date(now + 2 * HOUR).toISOString()), now + 10 * 60_000);

      expect(readUsageSnapshot(LIVE_ACCOUNT_ID, { now })).toBeNull();
    });

    it('keeps accounts apart', () => {
      const now = Date.now();
      writeUsageSnapshot(LIVE_ACCOUNT_ID, usageWith(new Date(now + HOUR).toISOString(), 11), now);
      writeUsageSnapshot(OTHER_ACCOUNT, usageWith(new Date(now + HOUR).toISOString(), 99), now);

      expect(readUsageSnapshot(LIVE_ACCOUNT_ID, { now })?.usage.five_hour).toMatchObject({ utilization: 11 });
      expect(readUsageSnapshot(OTHER_ACCOUNT, { now })?.usage.five_hour).toMatchObject({ utilization: 99 });
    });
  });

  describe('cool-down', () => {
    it('is absent until armed', () => {
      expect(readCooldownUntil(LIVE_ACCOUNT_ID)).toBeNull();
    });

    it('uses the seconds the API asked for', () => {
      const now = Date.now();
      const until = armCooldown(LIVE_ACCOUNT_ID, 90, now);

      expect(until).toBe(now + 90_000);
      expect(readCooldownUntil(LIVE_ACCOUNT_ID, now)).toBe(until);
    });

    it('falls back to a default when the API named no wait', () => {
      const now = Date.now();
      armCooldown(LIVE_ACCOUNT_ID, undefined, now);

      expect(readCooldownUntil(LIVE_ACCOUNT_ID, now)).toBe(now + USAGE_COOLDOWN_DEFAULT_SEC * 1000);
    });

    // A Retry-After of a day would otherwise mute the panel for a day.
    it('caps a wait that is too long to be useful', () => {
      const now = Date.now();
      armCooldown(LIVE_ACCOUNT_ID, 24 * 60 * 60, now);

      expect(readCooldownUntil(LIVE_ACCOUNT_ID, now)).toBe(now + USAGE_COOLDOWN_MAX_SEC * 1000);
    });

    it('expires on its own', () => {
      const now = Date.now();
      armCooldown(LIVE_ACCOUNT_ID, 30, now);

      expect(readCooldownUntil(LIVE_ACCOUNT_ID, now + 31_000)).toBeNull();
    });

    it('can be cleared by a success', () => {
      armCooldown(LIVE_ACCOUNT_ID, 300);
      clearCooldown(LIVE_ACCOUNT_ID);

      expect(readCooldownUntil(LIVE_ACCOUNT_ID)).toBeNull();
    });

    /**
     * The reason this is keyed per account at all. An account pool refreshes several
     * accounts in one pass, and one account hitting a 429 must not silence the others.
     */
    it('does not spread from one account to another', () => {
      const now = Date.now();
      armCooldown(LIVE_ACCOUNT_ID, 300, now);

      expect(readCooldownUntil(LIVE_ACCOUNT_ID, now)).not.toBeNull();
      expect(readCooldownUntil(OTHER_ACCOUNT, now)).toBeNull();
    });
  });

  describe('helpers', () => {
    it('sees a crossed reset only for a reset that was ahead at write time', () => {
      const now = Date.now();
      const written = now - 60_000;
      expect(crossedReset(usageWith(new Date(now - 30_000).toISOString()), written, now)).toBe(true);
      // Already in the past when written: a provider stamping stale resets must not force
      // a live call on every single poll.
      expect(crossedReset(usageWith(new Date(written - 30_000).toISOString()), written, now)).toBe(false);
      expect(crossedReset(usageWith(new Date(now + HOUR).toISOString()), written, now)).toBe(false);
    });

    it('counts a model-scoped limit as a window worth drawing', () => {
      const base = usageWith(null);
      const empty = { ...base, five_hour: null } as Usage;
      expect(hasAnyWindow(empty)).toBe(false);
      expect(hasAnyWindow({ ...empty, limits: [{ kind: 'weekly_scoped', percent: 3 }] } as Usage)).toBe(true);
    });
  });
});
