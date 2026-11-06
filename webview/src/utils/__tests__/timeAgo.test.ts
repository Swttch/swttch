import { describe, it, expect } from 'vitest';
import { timeAgo } from '../timeAgo';

const NOW = Date.UTC(2026, 10, 6, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

describe('timeAgo', () => {
  it('says how long ago in the reader\'s language, by the largest whole unit', () => {
    expect(timeAgo(NOW - 4 * HOUR - 20 * 60 * 1000, 'en', NOW)).toBe('4 hours ago');
    expect(timeAgo(NOW - 4 * HOUR, 'ko', NOW)).toBe('4시간 전');
    expect(timeAgo(NOW - 3 * 24 * HOUR, 'en', NOW)).toBe('3 days ago');
    expect(timeAgo(NOW - 2 * 60 * 1000, 'en', NOW)).toBe('2 minutes ago');
  });

  it('says now under a minute, and never reads a moment ahead of now as the future', () => {
    expect(timeAgo(NOW - 20 * 1000, 'en', NOW)).toBe('now');
    expect(timeAgo(NOW + 5 * HOUR, 'en', NOW)).toBe('now');
  });
});
