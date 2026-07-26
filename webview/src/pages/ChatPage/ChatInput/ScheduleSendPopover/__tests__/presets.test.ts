import { describe, it, expect } from 'vitest';
import {
  SchedulePresetId,
  resolvePresetSendAt,
  resolveAfterDurationSendAt,
  durationToMs,
  toDatetimeLocalValue,
} from '../presets';

describe('resolvePresetSendAt', () => {
  // A fixed local anchor: 2026-07-26 14:30:00 local time.
  const now = new Date(2026, 6, 26, 14, 30, 0, 0).getTime();

  it('adds 5 minutes for In5Min', () => {
    expect(resolvePresetSendAt(SchedulePresetId.In5Min, now).getTime()).toBe(now + 5 * 60_000);
  });

  it('adds 30 minutes for In30Min', () => {
    expect(resolvePresetSendAt(SchedulePresetId.In30Min, now).getTime()).toBe(now + 30 * 60_000);
  });

  it('adds 1 hour for In1Hour', () => {
    expect(resolvePresetSendAt(SchedulePresetId.In1Hour, now).getTime()).toBe(now + 60 * 60_000);
  });

  it('jumps to 09:00 local the next day for TomorrowMorning', () => {
    const d = resolvePresetSendAt(SchedulePresetId.TomorrowMorning, now);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6); // July
    expect(d.getDate()).toBe(27); // next day
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
  });

  it('rolls the month over correctly for TomorrowMorning on the last day', () => {
    const lastDay = new Date(2026, 6, 31, 23, 0, 0, 0).getTime(); // Jul 31
    const d = resolvePresetSendAt(SchedulePresetId.TomorrowMorning, lastDay);
    expect(d.getMonth()).toBe(7); // August
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(9);
  });

  it('returns `now` for Custom and AfterDuration (resolved by their own inputs)', () => {
    expect(resolvePresetSendAt(SchedulePresetId.Custom, now).getTime()).toBe(now);
    expect(resolvePresetSendAt(SchedulePresetId.AfterDuration, now).getTime()).toBe(now);
  });
});

describe('durationToMs', () => {
  it('sums days/hours/minutes/seconds to milliseconds', () => {
    expect(durationToMs({ days: 0, hours: 0, minutes: 0, seconds: 0 })).toBe(0);
    expect(durationToMs({ days: 1, hours: 2, minutes: 3, seconds: 4 })).toBe(
      86_400_000 + 2 * 3_600_000 + 3 * 60_000 + 4 * 1_000,
    );
  });
});

describe('resolveAfterDurationSendAt', () => {
  const now = new Date(2026, 6, 26, 14, 30, 0, 0).getTime();

  it('adds the duration to now', () => {
    const d = resolveAfterDurationSendAt({ days: 0, hours: 1, minutes: 30, seconds: 0 }, now);
    expect(d.getTime()).toBe(now + 90 * 60_000);
  });

  it('handles a multi-day duration', () => {
    const d = resolveAfterDurationSendAt({ days: 2, hours: 0, minutes: 0, seconds: 15 }, now);
    expect(d.getTime()).toBe(now + 2 * 86_400_000 + 15_000);
  });
});

describe('toDatetimeLocalValue', () => {
  it('formats a Date as YYYY-MM-DDTHH:mm:ss in local time, zero-padded', () => {
    const d = new Date(2026, 0, 5, 9, 7, 3, 0); // 2026-01-05 09:07:03 local
    expect(toDatetimeLocalValue(d)).toBe('2026-01-05T09:07:03');
  });

  it('round-trips through Date.parse back to the same local instant', () => {
    const d = new Date(2026, 6, 26, 14, 30, 45, 0);
    const value = toDatetimeLocalValue(d);
    // datetime-local values parse as local time; with seconds included the
    // second-truncated instant matches exactly.
    expect(new Date(Date.parse(value)).getTime()).toBe(d.getTime());
  });
});
