/**
 * Pure formatters for the scheduled-messages panel. Kept free of React so the
 * relative-time math is unit-testable with a fixed `now`.
 */

/**
 * Absolute send time, to the SECOND, in 24-hour form (shorter than 12h + AM/PM).
 * `YYYY-MM-DD HH:mm:ss` in local time. Used as the card's precise timestamp.
 */
export function formatAbsolute(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/** The unit + count for a relative "in N …" label, resolved from ms-until-send. */
export interface RelativeParts {
  /** i18n unit key suffix: 'day' | 'hour' | 'minute' | 'second' | 'now'. */
  unit: 'day' | 'hour' | 'minute' | 'second' | 'now';
  /** The count for the chosen unit (absent for 'now'). */
  count: number;
}

/**
 * Resolve how long until `sendAtMs` from `nowMs` into a coarse unit + count,
 * choosing the largest whole unit that fits (days → hours → minutes → seconds).
 * Non-positive (due or past) → { unit: 'now' } so the UI can say "곧"/"now".
 * `nowMs` is passed in (not read from Date.now()) so this stays pure.
 */
export function relativeParts(sendAtMs: number, nowMs: number): RelativeParts {
  const diff = sendAtMs - nowMs;
  if (Number.isNaN(diff) || diff <= 0) return { unit: 'now', count: 0 };

  const sec = Math.floor(diff / 1000);
  if (sec < 60) return { unit: 'second', count: sec };
  const min = Math.floor(sec / 60);
  if (min < 60) return { unit: 'minute', count: min };
  const hr = Math.floor(min / 60);
  if (hr < 24) return { unit: 'hour', count: hr };
  const day = Math.floor(hr / 24);
  return { unit: 'day', count: day };
}
