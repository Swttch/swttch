/**
 * Time presets for the "schedule send" popover. Each preset resolves to an
 * absolute send time relative to a caller-supplied `now` (passed in, never read
 * from Date.now() here, so the calculation is pure and unit-testable).
 *
 * The popover surfaces these as a dropdown (a Select — presets can grow long in
 * some locales, so chips would wrap awkwardly). Beyond the fixed one-tap
 * presets there are two open-ended options:
 *   - AfterDuration ("~ later"): user dials in days/hours/minutes/seconds and
 *     the send time is now + that duration.
 *   - Custom: a free-form datetime-local input for an exact wall-clock time.
 */

export enum SchedulePresetId {
  /** now + 5 minutes */
  In5Min = 'in5min',
  /** now + 30 minutes */
  In30Min = 'in30min',
  /** now + 1 hour */
  In1Hour = 'in1hour',
  /** 09:00 local time tomorrow */
  TomorrowMorning = 'tomorrowMorning',
  /** now + a user-dialed duration (days/hours/minutes/seconds) */
  AfterDuration = 'afterDuration',
  /** free-form datetime-local input */
  Custom = 'custom',
}

/** i18n label key (commandPalette namespace) for each preset option. */
export const PRESET_LABEL_KEY: Record<SchedulePresetId, string> = {
  [SchedulePresetId.In5Min]: 'scheduleSend.presets.in5min',
  [SchedulePresetId.In30Min]: 'scheduleSend.presets.in30min',
  [SchedulePresetId.In1Hour]: 'scheduleSend.presets.in1hour',
  [SchedulePresetId.TomorrowMorning]: 'scheduleSend.presets.tomorrowMorning',
  [SchedulePresetId.AfterDuration]: 'scheduleSend.presets.afterDuration',
  [SchedulePresetId.Custom]: 'scheduleSend.presets.custom',
};

/**
 * All preset options in dropdown display order: the fixed presets first, then
 * the two open-ended options (AfterDuration, then Custom — "~ later" sits right
 * before "custom date/time" per the design).
 */
export const PRESET_OPTIONS: SchedulePresetId[] = [
  SchedulePresetId.In5Min,
  SchedulePresetId.In30Min,
  SchedulePresetId.In1Hour,
  SchedulePresetId.TomorrowMorning,
  SchedulePresetId.AfterDuration,
  SchedulePresetId.Custom,
];

/** A user-dialed relative duration for the AfterDuration option. */
export interface Duration {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export const ZERO_DURATION: Duration = { days: 0, hours: 0, minutes: 0, seconds: 0 };

/** Total milliseconds a Duration represents. */
export function durationToMs(d: Duration): number {
  return (
    d.days * 86_400_000 +
    d.hours * 3_600_000 +
    d.minutes * 60_000 +
    d.seconds * 1_000
  );
}

/** now + duration, as an absolute Date. */
export function resolveAfterDurationSendAt(duration: Duration, now: number): Date {
  return new Date(now + durationToMs(duration));
}

/**
 * Resolve a fixed preset (In5Min/In30Min/In1Hour/TomorrowMorning) to an absolute
 * send time. AfterDuration and Custom are resolved by their own helpers/inputs;
 * called with either, this returns `now` so a mis-call never yields NaN.
 * `now` is supplied by the caller (Date.now() at click time) so this stays pure.
 */
export function resolvePresetSendAt(preset: SchedulePresetId, now: number): Date {
  switch (preset) {
    case SchedulePresetId.In5Min:
      return new Date(now + 5 * 60_000);
    case SchedulePresetId.In30Min:
      return new Date(now + 30 * 60_000);
    case SchedulePresetId.In1Hour:
      return new Date(now + 60 * 60_000);
    case SchedulePresetId.TomorrowMorning: {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    }
    case SchedulePresetId.AfterDuration:
    case SchedulePresetId.Custom:
      return new Date(now);
  }
}

/**
 * Format a Date as the `value` a native <input type="datetime-local" step=1>
 * expects: `YYYY-MM-DDTHH:mm:ss` in LOCAL time (no timezone suffix). Seconds are
 * included because the input uses step=1, so the picker shows a seconds field.
 * Used to seed the custom input from a preset and as the default (now + 1h).
 */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
}
