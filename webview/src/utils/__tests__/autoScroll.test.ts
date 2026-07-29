import { describe, it, expect } from 'vitest';
import {
  clampAutoScrollThreshold,
  nextAutoFollow,
  shouldShowScrollToBottom,
  AUTO_SCROLL_THRESHOLD_DEFAULT,
  AUTO_SCROLL_THRESHOLD_MAX,
  AUTO_SCROLL_THRESHOLD_MIN,
} from '../autoScroll';

describe('clampAutoScrollThreshold', () => {
  it('keeps in-range values unchanged', () => {
    expect(clampAutoScrollThreshold(80)).toBe(80);
    expect(clampAutoScrollThreshold(200)).toBe(200);
  });

  it('caps absurdly large values (issue #87: user set 20000)', () => {
    expect(clampAutoScrollThreshold(20000)).toBe(AUTO_SCROLL_THRESHOLD_MAX);
  });

  it('floors values below the minimum', () => {
    expect(clampAutoScrollThreshold(0)).toBe(AUTO_SCROLL_THRESHOLD_MIN);
    expect(clampAutoScrollThreshold(-5)).toBe(AUTO_SCROLL_THRESHOLD_MIN);
  });

  it('falls back to the default for non-finite input', () => {
    expect(clampAutoScrollThreshold(NaN)).toBe(AUTO_SCROLL_THRESHOLD_DEFAULT);
    expect(clampAutoScrollThreshold(Infinity)).toBe(AUTO_SCROLL_THRESHOLD_DEFAULT);
  });

  it('rounds fractional values', () => {
    expect(clampAutoScrollThreshold(80.6)).toBe(81);
  });
});

describe('nextAutoFollow', () => {
  const THRESHOLD = 80;

  // The configured distance is the single decision boundary: inside it the view
  // keeps following, outside it the view stops and waits for the user. That is
  // the same boundary `shouldShowScrollToBottom` uses, so "auto-scroll is off"
  // and "the button is showing" always agree.
  describe('inside the configured distance', () => {
    it('keeps following while the user scrolls up but stays within it', () => {
      expect(nextAutoFollow(true, -20, 30, THRESHOLD)).toBe(true);
      expect(nextAutoFollow(true, -60, THRESHOLD, THRESHOLD)).toBe(true);
    });

    it('resumes once the user scrolls back within it', () => {
      expect(nextAutoFollow(false, 50, 10, THRESHOLD)).toBe(true);
      expect(nextAutoFollow(false, 5, THRESHOLD, THRESHOLD)).toBe(true);
    });

    it('follows again on an idle tick within it', () => {
      // Nothing pins the user outside the distance, so following is the correct
      // resting state — the view should be dragged back down to the bottom.
      expect(nextAutoFollow(false, 0, 10, THRESHOLD)).toBe(true);
    });
  });

  describe('outside the configured distance', () => {
    it('releases when the user scrolls up past it', () => {
      expect(nextAutoFollow(true, -20, THRESHOLD + 1, THRESHOLD)).toBe(false);
      expect(nextAutoFollow(true, -200, 500, THRESHOLD)).toBe(false);
    });

    it('stays released while the user scrolls down but is still outside it', () => {
      expect(nextAutoFollow(false, 50, THRESHOLD + 1, THRESHOLD)).toBe(false);
    });

    it('stays released on an idle tick outside it', () => {
      expect(nextAutoFollow(false, 0, 500, THRESHOLD)).toBe(false);
    });
  });

  // Issue #100: a large block inserted at once grows `scrollHeight` while
  // `scrollTop` stays put, which pushes the bottom far away without the user
  // having moved. Growth alone must not stop following.
  it('keeps following when content growth alone pushes the bottom away', () => {
    expect(nextAutoFollow(true, 0, 4000, THRESHOLD)).toBe(true);
  });

  it('honours a custom threshold', () => {
    // The user raised the distance, so a position that would release at the
    // default still counts as "near the bottom" here.
    expect(nextAutoFollow(true, -50, 150, 200)).toBe(true);
    expect(nextAutoFollow(true, -50, 250, 200)).toBe(false);
  });
});

describe('shouldShowScrollToBottom', () => {
  const THRESHOLD = 80;

  // The button is meaningful ONLY when all three hide-conditions are false:
  // auto-follow off AND there are messages AND the view is beyond the threshold.
  it('shows when auto-follow is off, has messages, and far from the bottom', () => {
    expect(shouldShowScrollToBottom(false, true, 500, THRESHOLD)).toBe(true);
  });

  // Hide-condition 1: auto-follow is active -> the view already tracks the bottom.
  it('hides while auto-follow is active, even when far from the bottom', () => {
    expect(shouldShowScrollToBottom(true, true, 500, THRESHOLD)).toBe(false);
  });

  // Hide-condition 2: no messages (an uninitialized session has nothing to scroll).
  it('hides when there are no messages', () => {
    expect(shouldShowScrollToBottom(false, false, 500, THRESHOLD)).toBe(false);
  });

  // Hide-condition 3: already within the threshold of the bottom.
  it('hides when within the threshold of the bottom', () => {
    expect(shouldShowScrollToBottom(false, true, THRESHOLD, THRESHOLD)).toBe(false);
    expect(shouldShowScrollToBottom(false, true, THRESHOLD - 1, THRESHOLD)).toBe(false);
    expect(shouldShowScrollToBottom(false, true, 0, THRESHOLD)).toBe(false);
  });

  // The exact bug: pinned near the bottom, a tiny upward nudge releases
  // auto-follow, but the position is still within the threshold -> stay hidden.
  it('stays hidden when auto-follow released but still within the threshold', () => {
    expect(shouldShowScrollToBottom(false, true, 10, THRESHOLD)).toBe(false);
  });

  it('shows just past the threshold boundary', () => {
    expect(shouldShowScrollToBottom(false, true, THRESHOLD + 1, THRESHOLD)).toBe(true);
  });
});

// The button's visibility is what tells the user whether auto-scroll is off, so
// the two must never disagree: there must be no distance at which auto-scroll
// has stopped while the button is still hidden.
describe('auto-follow and the button agree at every distance', () => {
  const THRESHOLD = 80;

  it('never stops following while the button is hidden', () => {
    for (let dist = 0; dist <= 400; dist++) {
      // The user is scrolling up at this distance from the bottom.
      const following = nextAutoFollow(true, -20, dist, THRESHOLD);
      const buttonShown = shouldShowScrollToBottom(following, true, dist, THRESHOLD);
      expect({ dist, stoppedButHidden: !following && !buttonShown })
        .toEqual({ dist, stoppedButHidden: false });
    }
  });

  it('shows the button exactly when following has stopped', () => {
    for (let dist = 0; dist <= 400; dist++) {
      const following = nextAutoFollow(true, -20, dist, THRESHOLD);
      const buttonShown = shouldShowScrollToBottom(following, true, dist, THRESHOLD);
      expect({ dist, buttonShown }).toEqual({ dist, buttonShown: !following });
    }
  });
});
