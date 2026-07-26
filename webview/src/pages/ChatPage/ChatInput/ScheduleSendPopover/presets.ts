/**
 * Time presets for the "schedule send" popover. Each preset resolves to an
 * absolute send time relative to a caller-supplied `now` (passed in, never read
 * from Date.now() here, so the calculation is pure and unit-testable).
 *
 * The popover offers these one-tap presets plus a free-form datetime-local
 * input for an exact custom time. Relative presets add a fixed offset; the
 * "tomorrow morning" preset jumps to 09:00 local time on the next day.
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
  /** free-form datetime-local input */
  Custom = 'custom',
}

/** i18n label key (commandPalette namespace) for each preset chip. */
export const PRESET_LABEL_KEY: Record<SchedulePresetId, string> = {
  [SchedulePresetId.In5Min]: 'scheduleSend.presets.in5min',
  [SchedulePresetId.In30Min]: 'scheduleSend.presets.in30min',
  [SchedulePresetId.In1Hour]: 'scheduleSend.presets.in1hour',
  [SchedulePresetId.TomorrowMorning]: 'scheduleSend.presets.tomorrowMorning',
  [SchedulePresetId.Custom]: 'scheduleSend.presets.custom',
};

/** The one-tap presets, in display order. Custom is handled separately (input). */
export const RELATIVE_PRESETS: SchedulePresetId[] = [
  SchedulePresetId.In5Min,
  SchedulePresetId.In30Min,
  SchedulePresetId.In1Hour,
  SchedulePresetId.TomorrowMorning,
];

/**
 * Resolve a non-custom preset to an absolute send time. Returns a Date. `now` is
 * supplied by the caller (Date.now() at click time) so this stays pure.
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
    case SchedulePresetId.Custom:
      // Custom has no fixed offset; the caller reads the datetime-local input
      // instead. Fall back to `now` so a mis-call never yields NaN.
      return new Date(now);
  }
}

/**
 * Format a Date as the `value` a native <input type="datetime-local"> expects:
 * `YYYY-MM-DDTHH:mm` in LOCAL time (no timezone suffix, no seconds). Used to
 * seed the custom input from a preset and as the default (now + 1h).
 */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}
