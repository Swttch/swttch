import { describe, it, expect } from 'vitest';
import {
  AUTO_SCROLL_HOLD_MS,
  clampAutoScrollThreshold,
  isReaderMovingDown,
  isReaderMovingUp,
  nextAutoFollow,
  shouldPullToBottom,
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

// Issue #530: while an answer streams in, every new line of text lands inside
// the resume distance of a reader who is only just starting to scroll up, and
// the pull to the bottom undid each small move before the next one arrived. The
// reader could only leave by moving past the distance faster than the text grew.
describe('isReaderMovingUp', () => {
  it('is true when the view moved up', () => {
    expect(isReaderMovingUp(-5, false)).toBe(true);
    expect(isReaderMovingUp(-1, false)).toBe(true);
  });

  it('is false when the view stood still or moved down', () => {
    expect(isReaderMovingUp(0, false)).toBe(false);
    expect(isReaderMovingUp(12, false)).toBe(false);
  });

  it('ignores sub-pixel wobble', () => {
    expect(isReaderMovingUp(-0.4, false)).toBe(false);
  });

  // The browser lowers scrollTop by itself when the content gets shorter than
  // the position it was holding. Nobody scrolled.
  it('is false when the content got shorter, whatever scrollTop did', () => {
    expect(isReaderMovingUp(-100, true)).toBe(false);
  });
});

describe('isReaderMovingDown', () => {
  it('is true when the view moved down', () => {
    expect(isReaderMovingDown(40)).toBe(true);
    expect(isReaderMovingDown(1)).toBe(true);
  });

  it('is false when the view stood still, moved up, or only wobbled', () => {
    expect(isReaderMovingDown(0)).toBe(false);
    expect(isReaderMovingDown(-8)).toBe(false);
    expect(isReaderMovingDown(0.4)).toBe(false);
  });
});

describe('shouldPullToBottom', () => {
  const FAR = 100;

  it('pulls when following, the content grew and the view is not at the bottom', () => {
    expect(shouldPullToBottom(true, true, FAR, Infinity)).toBe(true);
  });

  it('does not pull when not following', () => {
    expect(shouldPullToBottom(false, true, FAR, Infinity)).toBe(false);
  });

  it('does not pull when nothing grew', () => {
    expect(shouldPullToBottom(true, false, FAR, Infinity)).toBe(false);
  });

  it('does not pull when already at the bottom', () => {
    expect(shouldPullToBottom(true, true, 0, Infinity)).toBe(false);
  });

  it('does not pull while the reader has just moved the view up', () => {
    expect(shouldPullToBottom(true, true, FAR, 0)).toBe(false);
    expect(shouldPullToBottom(true, true, FAR, AUTO_SCROLL_HOLD_MS - 1)).toBe(false);
  });

  it('pulls again once the reader has been still for the hold time', () => {
    expect(shouldPullToBottom(true, true, FAR, AUTO_SCROLL_HOLD_MS)).toBe(true);
  });
});
