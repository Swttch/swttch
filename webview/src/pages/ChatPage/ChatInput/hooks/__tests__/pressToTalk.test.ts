import { describe, it, expect } from 'vitest';
import { PressToTalk, PressAction, HOLD_THRESHOLD_MS } from '../pressToTalk';

/**
 * Acceptance for: "As someone dictating, I want the shortcut to work like the
 * mouse — tap to keep recording, hold to record only while held."
 */

const TAP = HOLD_THRESHOLD_MS - 100;
const HOLD = HOLD_THRESHOLD_MS + 100;

describe('PressToTalk — tapping', () => {
  it('starts recording and keeps it on after release', () => {
    const p = new PressToTalk();
    expect(p.press(false, 0)).toBe(PressAction.Start);
    expect(p.release(TAP)).toBe(PressAction.None);
  });

  it('stops on the next tap', () => {
    const p = new PressToTalk();
    p.press(false, 0);
    p.release(TAP);

    // Second tap, now that recording is on.
    expect(p.press(true, 1000)).toBe(PressAction.None);
    expect(p.release(1000 + TAP)).toBe(PressAction.Stop);
  });

  it('takes two taps to get back to silence, not one', () => {
    const p = new PressToTalk();
    const actions: PressAction[] = [];
    actions.push(p.press(false, 0), p.release(TAP));
    actions.push(p.press(true, 1000), p.release(1000 + TAP));
    expect(actions).toEqual([
      PressAction.Start,
      PressAction.None,
      PressAction.None,
      PressAction.Stop,
    ]);
  });
});

describe('PressToTalk — holding', () => {
  it('records only while held', () => {
    const p = new PressToTalk();
    expect(p.press(false, 0)).toBe(PressAction.Start);
    expect(p.release(HOLD)).toBe(PressAction.Stop);
  });

  it('ignores the repeats a held key produces', () => {
    // Holding a key makes the OS resend keydown many times a second; each one
    // must not be another press, or recording flickers.
    const p = new PressToTalk();
    expect(p.press(false, 0)).toBe(PressAction.Start);
    for (let i = 1; i <= 10; i++) {
      expect(p.press(false, i * 30)).toBe(PressAction.None);
    }
    expect(p.release(HOLD)).toBe(PressAction.Stop);
  });

  it('treats exactly the threshold as a hold', () => {
    const p = new PressToTalk();
    p.press(false, 0);
    expect(p.release(HOLD_THRESHOLD_MS)).toBe(PressAction.Stop);
  });
});

describe('PressToTalk — stray events', () => {
  it('ignores a release with no press behind it', () => {
    // A key released after the window regained focus, say.
    const p = new PressToTalk();
    expect(p.release(100)).toBe(PressAction.None);
  });

  it('forgets an in-flight press when cancelled', () => {
    const p = new PressToTalk();
    p.press(false, 0);
    p.cancel();
    expect(p.release(HOLD)).toBe(PressAction.None);
  });

  it('starts cleanly after a cancel', () => {
    const p = new PressToTalk();
    p.press(false, 0);
    p.cancel();
    expect(p.press(false, 1000)).toBe(PressAction.Start);
  });
});
