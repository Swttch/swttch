import { describe, it, expect } from 'vitest';
import { relativeTime } from '../relativeTime';

const NOW = Date.UTC(2026, 9, 26, 12, 0, 0);
const ago = (seconds: number) => NOW - seconds * 1000;

describe('relativeTime', () => {
  it('picks the largest unit that fits', () => {
    expect(relativeTime(ago(30), NOW, 'en')).toBe('now');
    expect(relativeTime(ago(5 * 60), NOW, 'en')).toBe('5 minutes ago');
    expect(relativeTime(ago(3 * 3600), NOW, 'en')).toBe('3 hours ago');
    expect(relativeTime(ago(2 * 86400), NOW, 'en')).toBe('2 days ago');
    expect(relativeTime(ago(400 * 86400), NOW, 'en')).toBe('last year');
  });

  it('speaks in the language it is given', () => {
    expect(relativeTime(ago(3 * 3600), NOW, 'ko')).toBe('3시간 전');
  });
});
