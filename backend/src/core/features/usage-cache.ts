import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { CcbUsageResponse } from '../handlers/getUsage';

/**
 * What the usage panel remembers between reads, and when it is allowed to ask again.
 *
 * Two files, both under the user-data directory so they survive a backend restart and
 * are shared by every backend the user has running:
 *
 * - a snapshot of the last successful read, so a restart or a second window does not
 *   spend another request to draw the same bars;
 * - a cool-down armed by a 429, so the answer to being rate limited is to stop asking
 *   rather than to ask again.
 *
 * Both are keyed per account. A pool of accounts is the normal case here, and one
 * account's 429 must not silence the others.
 */

/** How long a stored snapshot may be served without asking again. */
const FRESH_TTL_MS = 10 * 60 * 1000;

/** Past this age a snapshot is not served even as a fallback. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Cool-down applied when a 429 arrives without a Retry-After to go on. */
const DEFAULT_COOLDOWN_SEC = 5 * 60;

/** Ceiling on a cool-down, so a hostile Retry-After cannot mute the panel for a day. */
const MAX_COOLDOWN_SEC = 60 * 60;

/** The id used for the account the CLI is currently logged in as. */
export const LIVE_ACCOUNT_ID = 'live';

/**
 * Where the snapshots and cool-downs live.
 *
 * `CCG_HOME` is honored because it is the documented override for the user-data
 * directory (`cli/install.sh`), and because a test that writes into the developer's
 * real `~/.claude-code-gui` is a test that can both corrupt their state and pass for
 * the wrong reason. Read on each call rather than captured at import, so a test can
 * set it after this module is loaded.
 */
function baseDir(): string {
  const home = process.env.CCG_HOME?.trim();
  return home ? join(home, 'usage') : join(homedir(), '.claude-code-gui', 'usage');
}

// Account ids come from the registry (`acc-<uuid>`) or are the literal "live". Anything
// else is refused rather than joined into a path.
const SAFE_ID = /^(live|acc-[a-f0-9-]+)$/;

function filePath(accountId: string, kind: 'snapshot' | 'cooldown'): string {
  if (!SAFE_ID.test(accountId)) throw new Error(`Invalid account id: ${accountId}`);
  return join(baseDir(), `${accountId}.${kind}.json`);
}

function writeAtomic(path: string, value: unknown): void {
  try {
    mkdirSync(baseDir(), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
    renameSync(tmp, path);
  } catch {
    // A cache that cannot be written is not a failure of the thing it caches.
  }
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** A stored read, with the age information the UI needs to say "updated N minutes ago". */
export interface UsageSnapshot {
  usage: CcbUsageResponse;
  cachedAt: number;
  /** True when served past {@link FRESH_TTL_MS}, so the UI can mark the bars as old. */
  stale: boolean;
}

/**
 * The only thing this module needs from a window: when it rolls over.
 *
 * Kept structural rather than importing the bucket and limit types, because the
 * payload deliberately carries fields nobody has named yet and a closed union here
 * would have to grow every time one appears.
 */
type UsageWindowLike = { resets_at?: string | null } & Record<string, unknown>;

function parseTime(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Every window in a usage payload, including the model-scoped ones that arrive in
 * `limits` rather than as a named field.
 */
function windowsOf(usage: CcbUsageResponse): UsageWindowLike[] {
  const named: unknown[] = [usage.five_hour, usage.seven_day, usage.seven_day_sonnet, usage.seven_day_opus];
  const scoped: unknown[] = Array.isArray(usage.limits) ? usage.limits : [];
  return [...named, ...scoped].filter(
    (w): w is UsageWindowLike => typeof w === 'object' && w !== null,
  );
}

/**
 * Whether a window has rolled over since the snapshot was written.
 *
 * A snapshot stops being usable the moment one of its windows passes the reset it was
 * written with: serving it after that shows a spent window that has in fact just been
 * refilled, which reads as the number being stuck. Only resets that were still ahead at
 * write time count, so a payload stamped with an already-past reset cannot force a live
 * call on every poll.
 */
export function crossedReset(usage: CcbUsageResponse, cachedAt: number, now: number): boolean {
  return windowsOf(usage).some((w) => {
    const resetMs = parseTime(w.resets_at);
    return resetMs !== null && resetMs > cachedAt && resetMs <= now;
  });
}

/** Drop the windows whose reset has already passed; they are stale data, not a fallback. */
function withoutExpiredWindows(usage: CcbUsageResponse, now: number): CcbUsageResponse {
  const usable = (w: unknown): boolean => {
    if (!w || typeof w !== 'object') return false;
    const resetMs = parseTime((w as UsageWindowLike).resets_at);
    return resetMs === null || resetMs > now;
  };
  return {
    ...usage,
    five_hour: usable(usage.five_hour) ? usage.five_hour : null,
    seven_day: usable(usage.seven_day) ? usage.seven_day : null,
    seven_day_sonnet: usable(usage.seven_day_sonnet) ? usage.seven_day_sonnet : null,
    seven_day_opus: usable(usage.seven_day_opus) ? usage.seven_day_opus : null,
    ...(Array.isArray(usage.limits) && { limits: usage.limits.filter(usable) }),
  };
}

/** True when the payload still has something worth drawing. */
export function hasAnyWindow(usage: CcbUsageResponse): boolean {
  return Boolean(
    usage.five_hour || usage.seven_day || usage.seven_day_sonnet || usage.seven_day_opus
    || (Array.isArray(usage.limits) && usage.limits.length > 0),
  );
}

export function writeUsageSnapshot(accountId: string, usage: CcbUsageResponse, now = Date.now()): void {
  writeAtomic(filePath(accountId, 'snapshot'), { cached_at: new Date(now).toISOString(), usage });
}

/**
 * The stored read for this account, or null.
 *
 * `freshOnly` asks the question the caller actually has: "can I skip the request?".
 * Anything else asks "do I have something to show while the request fails?", which
 * tolerates an older snapshot.
 */
export function readUsageSnapshot(
  accountId: string,
  { now = Date.now(), freshOnly = false }: { now?: number; freshOnly?: boolean } = {},
): UsageSnapshot | null {
  const raw = readJson(filePath(accountId, 'snapshot'));
  const cachedAt = parseTime(raw?.cached_at);
  const usage = raw?.usage as CcbUsageResponse | undefined;
  if (cachedAt === null || !usage) return null;
  // A clock that jumped backwards would otherwise make a future snapshot look current.
  if (cachedAt > now + 60_000) return null;
  const age = now - cachedAt;
  if (age > MAX_AGE_MS) return null;
  if (freshOnly && (age > FRESH_TTL_MS || crossedReset(usage, cachedAt, now))) return null;

  const trimmed = withoutExpiredWindows(usage, now);
  if (!hasAnyWindow(trimmed)) return null;
  return { usage: trimmed, cachedAt, stale: age > FRESH_TTL_MS };
}

/**
 * When this account may be asked about again, or null when it may be asked now.
 *
 * The cool-down is stamped with the account's own id, and a caller that hands over a
 * different id never sees it. That is the whole reason this is per-account: an account
 * pool refreshes several accounts in one pass, and one 429 must not silence the rest.
 */
export function readCooldownUntil(accountId: string, now = Date.now()): number | null {
  const raw = readJson(filePath(accountId, 'cooldown'));
  const retryAt = parseTime(raw?.retry_at);
  if (retryAt === null || retryAt <= now) return null;
  return retryAt;
}

export function armCooldown(accountId: string, retryAfterSec: number | undefined, now = Date.now()): number {
  const sec = Number.isFinite(retryAfterSec) && (retryAfterSec as number) > 0
    ? Math.min(retryAfterSec as number, MAX_COOLDOWN_SEC)
    : DEFAULT_COOLDOWN_SEC;
  const retryAt = now + sec * 1000;
  writeAtomic(filePath(accountId, 'cooldown'), { retry_at: new Date(retryAt).toISOString() });
  return retryAt;
}

export function clearCooldown(accountId: string): void {
  try {
    unlinkSync(filePath(accountId, 'cooldown'));
  } catch {
    // Already absent is the state we wanted.
  }
}

/** Test seam: forget everything stored for an account. */
export function resetUsageStore(accountId: string): void {
  for (const kind of ['snapshot', 'cooldown'] as const) {
    try {
      unlinkSync(filePath(accountId, kind));
    } catch {
      // Nothing to forget.
    }
  }
}

export const USAGE_CACHE_FRESH_TTL_MS = FRESH_TTL_MS;
export const USAGE_COOLDOWN_DEFAULT_SEC = DEFAULT_COOLDOWN_SEC;
export const USAGE_COOLDOWN_MAX_SEC = MAX_COOLDOWN_SEC;
