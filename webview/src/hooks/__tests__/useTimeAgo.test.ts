import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { msUntilTimeAgoChanges, useTimeAgo } from '../useTimeAgo';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

describe('msUntilTimeAgoChanges', () => {
  it('waits for the minute to fill while the words are still "now"', () => {
    expect(msUntilTimeAgoChanges(0, 20 * 1000)).toBe(40 * 1000);
  });

  it('waits for the next whole minute once it is said in minutes', () => {
    expect(msUntilTimeAgoChanges(0, 4 * MINUTE + 10 * 1000)).toBe(50 * 1000);
  });

  it('waits for the next whole hour once it is said in hours', () => {
    expect(msUntilTimeAgoChanges(0, 2 * HOUR + 30 * MINUTE)).toBe(30 * MINUTE);
  });
});

describe('useTimeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-23T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('draws the words again as the minutes pass, without anything else making the component draw', () => {
    const sentAt = Date.parse('2026-11-23T11:56:00.000Z');
    const { result } = renderHook(() => useTimeAgo(sentAt, 'en'));
    expect(result.current).toBe('4 minutes ago');

    act(() => {
      vi.advanceTimersByTime(3 * MINUTE);
    });
    expect(result.current).toBe('7 minutes ago');
  });

  it('says nothing for a moment that is not known and sets no timer for it', () => {
    const { result } = renderHook(() => useTimeAgo(undefined, 'en'));
    expect(result.current).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops its timer when the component goes away', () => {
    const { unmount } = renderHook(() => useTimeAgo(Date.now() - MINUTE, 'en'));
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
