import { AutoResumeStatusPhase } from '@/shared';

/**
 * Pure helpers for the "auto-resume on limit reset" feature. Kept free of React
 * so the timing math (send-at offset, countdown) and the status→label mapping
 * are unit-testable in isolation from the hook and the banner.
 */

/** The prompt delivered when a reservation (or immediate resume) fires. */
export const AUTO_RESUME_MESSAGE = 'continue';

/**
 * Gap (ms) between the quota `resetsAt` and the reservation `sendAt`. The
 * webview computes `sendAt = resetsAt + 30s` (user-confirmed spec): the extra
 * 30s is the window during which the backend pre-send gate polls ccb to confirm
 * the quota actually recharged. This same 30s drives the banner countdown.
 */
export const SEND_AT_DELAY_MS = 30_000;

/** The countdown length in whole seconds (30 → 0). */
export const COUNTDOWN_SECONDS = SEND_AT_DELAY_MS / 1000;

/**
 * Compute the reservation `sendAt` (ISO 8601) from a quota `resetsAt` (ISO
 * 8601). Returns null when `resetsAt` is missing or unparseable — the caller
 * then cannot schedule (there is no known reset time to gate on).
 */
export function computeSendAt(resetsAtIso: string | null | undefined): string | null {
  if (!resetsAtIso) return null;
  const ms = Date.parse(resetsAtIso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms + SEND_AT_DELAY_MS).toISOString();
}

/**
 * Seconds remaining in the post-reset countdown (the [resetsAt, resetsAt+30s]
 * window during which the backend gate runs), or null when the countdown is not
 * currently active:
 *   - `now` before `resetsAt`      → null (reset not reached yet)
 *   - `now` at/after resetsAt+30s   → null (window elapsed; gate has fired)
 *   - otherwise                     → whole seconds left, 30 … 0
 */
export function computeCountdownSeconds(
  resetsAtMs: number,
  nowMs: number,
): number | null {
  if (Number.isNaN(resetsAtMs)) return null;
  const end = resetsAtMs + SEND_AT_DELAY_MS;
  if (nowMs < resetsAtMs) return null;
  if (nowMs > end) return null;
  const secs = Math.ceil((end - nowMs) / 1000);
  return Math.min(COUNTDOWN_SECONDS, Math.max(0, secs));
}

/** The subset of an AUTO_RESUME_STATUS the banner needs to render a label. */
export interface AutoResumeStatusView {
  phase: AutoResumeStatusPhase;
  /** Raw backend error string (e.g. 'timeout' or a classifyError message). */
  error?: string;
  /** classifyError kind for a usage-fetch failure ('network' | 'auth' | ...). */
  errorKind?: string;
}

/**
 * Map an auto-resume status to the i18n key (relative to the `chat` namespace)
 * the banner should show, or null when there is nothing to show. Network errors
 * MUST localize to "네트워크 연결 에러" (spec), so `errorKind === 'network'` wins
 * over the raw English `error` text; a bare `error === 'timeout'` maps to the
 * timeout label; anything else FAILED falls back to a generic error label.
 */
export function resolveAutoResumeStatusKey(
  status: AutoResumeStatusView | null | undefined,
): string | null {
  if (!status) return null;
  switch (status.phase) {
    case AutoResumeStatusPhase.RETRYING:
      return 'autoResume.status.retrying';
    case AutoResumeStatusPhase.PROCEEDING:
      return 'autoResume.status.proceeding';
    case AutoResumeStatusPhase.FAILED:
      if (status.errorKind === 'network') return 'autoResume.error.network';
      if (status.error === 'timeout') return 'autoResume.error.timeout';
      if (status.errorKind === 'auth') return 'autoResume.error.auth';
      return 'autoResume.error.generic';
    default:
      return null;
  }
}

// ── Limit detection (front-end, message-based) ──────────────────────────────
// The limit notice (`You've hit your session limit · resets ...`) arrives as a
// plain assistant text block (verified against session JSONL), not an API-error
// message. We detect it from the message text so the banner survives session
// re-entry (the message persists; a live LIMIT_REACHED event would not). Kept in
// sync with the backend `limit-detection.ts` LIMIT_PATTERNS / parseResetTime.
// ⚠️ 실측 조정 대상: real CLI phrasing may vary.

const LIMIT_PATTERNS: RegExp[] = [
  /hit(?:ting)?\s+your\s+[^.\n]*\blimit\b/i,
  /you'?ve\s+reached\s+your\s+[^.\n]*\blimit\b/i,
  /usage\s+limit\s+reached/i,
  /\blimit\s+reached\b/i,
  /exceeded\s+your\s+[^.\n]*\blimit\b/i,
  /\brate[-\s]?limit(?:ed)?\b/i,
];

/** True when text looks like a usage-limit notice. */
export function isLimitReachedText(text: string): boolean {
  if (!text) return false;
  return LIMIT_PATTERNS.some((p) => p.test(text));
}

/** Convert a 12-hour clock reading to a 0–23 hour. `ampm` is 'a'|'p'|undefined. */
function to24Hour(hour: number, ampm: string | undefined): number {
  if (ampm === undefined) return hour;
  const isPm = /p/i.test(ampm);
  if (isPm) return hour === 12 ? 12 : hour + 12;
  return hour === 12 ? 0 : hour;
}

/** The calendar Y/M/D of `date` as seen in `timeZone`. */
function zoneParts(date: Date, timeZone: string): { y: number; m: number; d: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value);
    const y = get('year');
    const m = get('month');
    const d = get('day');
    if ([y, m, d].some((n) => Number.isNaN(n))) return null;
    return { y, m, d };
  } catch {
    return null;
  }
}

/** UTC offset (minutes) of `timeZone` at `date`; null when the zone is unknown. */
function zoneOffsetMinutes(date: Date, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
    }).formatToParts(date);
    const tz = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    if (/^(?:GMT|UTC)$/i.test(tz)) return 0;
    const m = tz.match(/(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?/i);
    if (!m) return null;
    const sign = m[1] === '-' ? -1 : 1;
    return sign * (parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0));
  } catch {
    return null;
  }
}

/** The next instant matching wall-clock `hour24:minute` in `timeZone`, at/after `now`. */
function nextWallClockInZone(
  now: Date,
  hour24: number,
  minute: number,
  timeZone: string,
): string | null {
  const off = zoneOffsetMinutes(now, timeZone);
  if (off === null) return null;
  const ymd = zoneParts(now, timeZone);
  if (ymd === null) return null;
  let utcMs = Date.UTC(ymd.y, ymd.m - 1, ymd.d, hour24, minute) - off * 60_000;
  if (utcMs <= now.getTime()) utcMs += 86_400_000;
  return new Date(utcMs).toISOString();
}

/** The host's IANA time zone, used when the CLI text names no zone. */
function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Best-effort parse of a reset time out of the limit text → ISO 8601, or null.
 * Tries an embedded ISO datetime, then a "4:20am (Asia/Seoul)" wall-clock reading.
 * `now` is injectable for tests.
 */
export function parseResetsAtFromText(text: string, now: Date = new Date()): string | null {
  if (!text) return null;

  const iso = text.match(
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/,
  );
  if (iso) {
    const t = Date.parse(iso[0]);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }

  const clock = text.match(
    /reset\w*[^0-9]{0,24}(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\s*(?:\(\s*([A-Za-z][A-Za-z0-9_+\-/]*)\s*\))?/i,
  );
  if (clock) {
    const hour = parseInt(clock[1], 10);
    const minute = clock[2] ? parseInt(clock[2], 10) : 0;
    const ampm = clock[3];
    const zone = clock[4] && clock[4] !== '' ? clock[4] : localTimeZone();
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      const hour24 = to24Hour(hour, ampm);
      const resolved = nextWallClockInZone(now, hour24, minute, zone);
      if (resolved !== null) return resolved;
    }
  }

  return null;
}
