import { describe, it, expect } from 'vitest';
import { EscapeStreak, STREAK_WINDOW_MS } from '../escapeStreak';

/** Press Escape `times` in a row on an idle chat, 100ms apart. */
function pressIdle(streak: EscapeStreak, times: number, from = 1000): boolean[] {
  return Array.from({ length: times }, (_, i) => streak.press(false, from + i * 100));
}

describe('EscapeStreak', () => {
  it('does not fire while the turn is still streaming', () => {
    const streak = new EscapeStreak();
    const fired = Array.from({ length: 5 }, (_, i) => streak.press(true, 1000 + i * 100));
    expect(fired).toEqual([false, false, false, false, false]);
  });

  it('fires on the third Escape after the turn stopped', () => {
    const streak = new EscapeStreak();
    expect(pressIdle(streak, 3)).toEqual([false, false, true]);
  });

  // The rule the user set: a four-tap run is interrupt + three, so the
  // interrupt must not be counted as one of the three.
  it('reads a four-tap run as interrupt + three', () => {
    const streak = new EscapeStreak();
    expect(streak.press(true, 1000)).toBe(false); // 1st — interrupts the turn
    expect(streak.press(false, 1100)).toBe(false); // 2nd
    expect(streak.press(false, 1200)).toBe(false); // 3rd
    expect(streak.press(false, 1300)).toBe(true); // 4th — asks about background
  });

  it('needs three more after an interrupt, not two', () => {
    const streak = new EscapeStreak();
    streak.press(true, 1000);
    expect(pressIdle(streak, 2, 1100)).toEqual([false, false]);
  });

  it('forgets a streak that went quiet for too long', () => {
    const streak = new EscapeStreak();
    streak.press(false, 1000);
    streak.press(false, 1100);
    // Third press arrives past the window, so it starts a new streak.
    expect(streak.press(false, 1100 + STREAK_WINDOW_MS + 1)).toBe(false);
  });

  it('does not fire again while Escape stays held down', () => {
    const streak = new EscapeStreak();
    expect(pressIdle(streak, 6)).toEqual([false, false, true, false, false, true]);
  });

  it('reset() drops a streak in progress', () => {
    const streak = new EscapeStreak();
    pressIdle(streak, 2);
    streak.reset();
    expect(pressIdle(streak, 2, 1200)).toEqual([false, false]);
  });
});
