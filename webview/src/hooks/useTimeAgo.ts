import { useEffect, useState } from 'react';
import { timeAgo } from '@/utils/timeAgo';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long until the words of `timeAgo` for a moment change: the next whole minute, hour or day since it, whichever
 * unit it is being said in now. Under a minute the words are "now" until the minute is full.
 */
export function msUntilTimeAgoChanges(timestamp: number, now: number): number {
  const elapsed = Math.max(0, now - timestamp);
  const size = elapsed < MINUTE ? MINUTE : elapsed < HOUR ? MINUTE : elapsed < DAY ? HOUR : DAY;
  return size - (elapsed % size);
}

/**
 * `timeAgo` that keeps itself true: the words ("4 minutes ago") are drawn again when the elapsed time moves on to the
 * next whole unit, so a line that stays on screen does not keep saying 4 while the desktop app's says 7.
 *
 * The timer is of the component that shows the words, so it runs only while they are on screen. It waits for the exact
 * moment the words change (never a fixed poll), but never longer than an hour, since a browser clamps a timer that is
 * set for too far ahead and a machine that slept would show a stale line until the timer woke.
 */
export function useTimeAgo(timestamp: number | undefined, locale: string): string | undefined {
  const valid = timestamp !== undefined && !Number.isNaN(timestamp);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!valid) return undefined;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const current = Date.now();
      setNow(current);
      const wait = Math.min(HOUR, Math.max(1000, msUntilTimeAgoChanges(timestamp as number, current)));
      timer = setTimeout(schedule, wait);
    };
    // A tab that was in the background may have slept through the moment: look again when it comes back.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(timer);
        schedule();
      }
    };
    schedule();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [valid, timestamp]);

  return valid ? timeAgo(timestamp as number, locale, now) : undefined;
}
