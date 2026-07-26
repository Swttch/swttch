import { describe, it, expect } from 'vitest';
import { formatAbsolute, relativeParts } from '../formatSchedule';

describe('formatAbsolute', () => {
  it('formats to the second in 24-hour local time', () => {
    // Construct a local Date and round-trip through its ISO string.
    const d = new Date(2026, 6, 26, 21, 5, 9); // 2026-07-26 21:05:09 local
    expect(formatAbsolute(d.toISOString())).toBe('2026-07-26 21:05:09');
  });

  it('zero-pads all fields', () => {
    const d = new Date(2026, 0, 3, 4, 7, 8); // 2026-01-03 04:07:08 local
    expect(formatAbsolute(d.toISOString())).toBe('2026-01-03 04:07:08');
  });

  it('returns the input unchanged when unparseable', () => {
    expect(formatAbsolute('not-a-date')).toBe('not-a-date');
  });
});

describe('relativeParts', () => {
  const now = 1_000_000_000_000; // fixed anchor

  it('picks seconds under a minute', () => {
    expect(relativeParts(now + 45_000, now)).toEqual({ unit: 'second', count: 45 });
  });

  it('picks whole minutes under an hour', () => {
    expect(relativeParts(now + 30 * 60_000, now)).toEqual({ unit: 'minute', count: 30 });
    // 90s → 1 minute (floored)
    expect(relativeParts(now + 90_000, now)).toEqual({ unit: 'minute', count: 1 });
  });

  it('picks whole hours under a day', () => {
    expect(relativeParts(now + 90 * 60_000, now)).toEqual({ unit: 'hour', count: 1 });
    expect(relativeParts(now + 5 * 3_600_000, now)).toEqual({ unit: 'hour', count: 5 });
  });

  it('picks whole days at a day or more', () => {
    expect(relativeParts(now + 25 * 3_600_000, now)).toEqual({ unit: 'day', count: 1 });
    expect(relativeParts(now + 3 * 86_400_000, now)).toEqual({ unit: 'day', count: 3 });
  });

  it('returns "now" for due-or-past times', () => {
    expect(relativeParts(now, now)).toEqual({ unit: 'now', count: 0 });
    expect(relativeParts(now - 5_000, now)).toEqual({ unit: 'now', count: 0 });
  });

  it('returns "now" for an unparseable time', () => {
    expect(relativeParts(NaN, now)).toEqual({ unit: 'now', count: 0 });
  });
});
