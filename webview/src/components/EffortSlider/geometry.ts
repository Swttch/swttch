/**
 * Track geometry for the effort slider.
 *
 * The notches and the click target have to agree on ONE definition of "where is
 * step i". They used to disagree: notches were laid out along the track minus
 * the thumb's width and insets, while a click was mapped over the button's FULL
 * width. The gap is not cosmetic — with 6 steps in a 72px track, clicking the
 * ultracode notch exactly on its centre resolved to Max, so the top step could
 * not be reached by clicking the dot that advertises it (#377).
 *
 * Both sides now derive from `stepRatio`, so a notch drawn at step i is also the
 * step a click at that position selects.
 */

/** The travel available to the thumb's centre, in px, given the track box. */
export function stepSpan(trackWidth: number, thumbSize: number, thumbInset: number): number {
  return Math.max(0, trackWidth - thumbSize - 2 * thumbInset);
}

/** Position of step `i`'s centre as a 0..1 fraction of the track's own width. */
export function stepRatio(
  index: number,
  count: number,
  trackWidth: number,
  thumbSize: number,
  thumbInset: number,
): number {
  if (count <= 1 || trackWidth <= 0) return 0;
  const centre = thumbInset + (index / (count - 1)) * stepSpan(trackWidth, thumbSize, thumbInset) + thumbSize / 2;
  return centre / trackWidth;
}

/**
 * The step a pointer at `offsetX` (px from the track's left edge) selects.
 * Inverts `stepRatio`, so clicking a notch's centre always yields that notch.
 */
export function indexFromOffset(
  offsetX: number,
  count: number,
  trackWidth: number,
  thumbSize: number,
  thumbInset: number,
): number {
  if (count <= 1) return 0;
  const span = stepSpan(trackWidth, thumbSize, thumbInset);
  // No travel (a track too narrow for the thumb) means every position is step 0.
  if (span <= 0) return 0;
  const travelled = offsetX - thumbInset - thumbSize / 2;
  const r = Math.max(0, Math.min(1, travelled / span));
  return Math.round(r * (count - 1));
}
