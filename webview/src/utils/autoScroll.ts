/** Default auto-scroll resume distance in pixels. */
export const AUTO_SCROLL_THRESHOLD_DEFAULT = 80;
/** Smallest meaningful resume distance. */
export const AUTO_SCROLL_THRESHOLD_MIN = 1;
/**
 * Upper bound for the resume distance. This is how close to the bottom the user
 * must scroll back before auto-follow re-engages; values larger than a typical
 * viewport make the chat re-grab the stream from almost anywhere, which is the
 * spirit of the bug reported in issue #87 (user had set it to 20000). Cap it to
 * keep the setting usable.
 */
export const AUTO_SCROLL_THRESHOLD_MAX = 1000;

/**
 * Distance from the bottom (in px) below which the view is considered already
 * pinned, so no further programmatic scroll is issued.
 */
export const AUTO_SCROLL_BOTTOM_EPS = 5;

/**
 * How long, in ms, the view is left where the reader put it after the reader
 * last moved it up. Slow mouse-wheel notches arrive a few hundred milliseconds
 * apart, so this has to be longer than the gap between two of them.
 */
export const AUTO_SCROLL_HOLD_MS = 500;

/**
 * Smallest upward move of the view in one frame, in px, that counts as the
 * reader moving it. Anything smaller is rounding noise from a fractional
 * scrollTop. This never decides whether auto-scroll is on, only whether the
 * pull to the bottom waits (see `shouldPullToBottom`), so a stray frame of
 * noise costs at most one hold time of not following.
 */
export const AUTO_SCROLL_UP_MOVE_EPS = 1;

/** Clamp a user-supplied resume distance into the supported range. */
export function clampAutoScrollThreshold(value: number): number {
  if (!Number.isFinite(value)) return AUTO_SCROLL_THRESHOLD_DEFAULT;
  const rounded = Math.round(value);
  return Math.min(AUTO_SCROLL_THRESHOLD_MAX, Math.max(AUTO_SCROLL_THRESHOLD_MIN, rounded));
}

/**
 * Decide the next auto-follow state from a single scroll measurement.
 *
 * The user-configured distance (`resumeThreshold`, the "Auto-scroll resume
 * distance" setting) is the single decision boundary:
 *  - within it, the view keeps following and is pulled back to the bottom
 *  - beyond it, following stops so the user can read undisturbed
 *
 * Using one boundary for both directions is what keeps this in step with
 * `shouldShowScrollToBottom`, which reads the same distance: auto-scroll being
 * off and the "Scroll to bottom" button being visible are the same condition,
 * so the view can never go quietly unfollowed while the button stays hidden.
 *
 * `scrollDelta` is deliberately not consulted. Distance alone decides, so
 * sub-pixel jitter cannot stop the view from following, and no separate
 * "deliberate scroll" epsilon is needed.
 *
 * Content growth is therefore harmless (issue #100): a large block inserted at
 * once grows `scrollHeight` while `scrollTop` stays put, pushing the bottom
 * beyond the distance. `prev` carries following through that, since only the
 * user moving out past the distance clears it.
 */
export function nextAutoFollow(
  prev: boolean,
  scrollDelta: number,
  distanceFromBottom: number,
  resumeThreshold: number,
): boolean {
  // Within the configured distance the resting state is "following": the view
  // resumes on its own, so a small nudge up near the bottom cannot strand it.
  if (distanceFromBottom <= resumeThreshold) return true;
  // Beyond it, only a deliberate move by the user releases following; growth
  // that pushes the bottom away on its own must not (issue #100).
  if (scrollDelta < 0) return false;
  return prev;
}

/**
 * Decide whether the "Scroll to bottom" button should be visible.
 *
 * The button is only useful when the user is genuinely stranded above the
 * stream, so it hides whenever ANY of these hold:
 *  - auto-follow is active (the view already tracks the bottom)
 *  - there are no messages (an uninitialized session has nothing to scroll)
 *  - the view is already within `threshold` px of the bottom
 *
 * This must NOT be conflated with auto-follow alone: auto-follow tracks user
 * *intent*, so a tiny upward nudge while pinned near the bottom releases it —
 * but the button should stay hidden there because the user can already see the
 * bottom. Visibility is therefore a separate, position-aware decision.
 */
export function shouldShowScrollToBottom(
  autoFollow: boolean,
  hasMessages: boolean,
  distanceFromBottom: number,
  threshold: number,
): boolean {
  if (autoFollow) return false;
  if (!hasMessages) return false;
  if (distanceFromBottom <= threshold) return false;
  return true;
}

/**
 * Whether the reader moved the view up since the last frame.
 *
 * `scrollDelta` is the change in scrollTop. The browser also lowers scrollTop
 * by itself when the content gets shorter than the position it was holding; that
 * is the content moving, not the reader, so a frame in which the content shrank
 * is never the reader.
 */
export function isReaderMovingUp(scrollDelta: number, contentShrank: boolean): boolean {
  if (contentShrank) return false;
  return scrollDelta <= -AUTO_SCROLL_UP_MOVE_EPS;
}

/**
 * Whether the reader moved the view down since the last frame. A reader who
 * turns around and heads back to the bottom is no longer holding the view up,
 * so the pull to the bottom stops waiting for them.
 */
export function isReaderMovingDown(scrollDelta: number): boolean {
  return scrollDelta >= AUTO_SCROLL_UP_MOVE_EPS;
}

/**
 * Whether this frame should pull the view down to the new bottom.
 *
 * Inside the resume distance the resting state is "following", and new content
 * pulls the view to the bottom. That pull must not fight the reader's hand: a
 * reader who is only starting to scroll up is inside the distance for the first
 * few moves, each new line of an answer landing between two moves would undo
 * the move before it, and the reader could only get out by moving past the
 * distance faster than the answer grew (issue #530).
 *
 * So the pull waits while the reader keeps moving the view up
 * (`msSinceReaderMovedUp` under `AUTO_SCROLL_HOLD_MS`). Whether following is on
 * is decided elsewhere (`nextAutoFollow`) and is not touched by this: a reader
 * who stops inside the distance is still following, and the next growth after
 * the hold time pulls the view down as it always did.
 */
export function shouldPullToBottom(
  following: boolean,
  contentGrew: boolean,
  distanceFromBottom: number,
  msSinceReaderMovedUp: number,
): boolean {
  if (!following || !contentGrew) return false;
  if (distanceFromBottom <= AUTO_SCROLL_BOTTOM_EPS) return false;
  return msSinceReaderMovedUp >= AUTO_SCROLL_HOLD_MS;
}
