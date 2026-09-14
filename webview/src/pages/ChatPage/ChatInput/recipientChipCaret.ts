/**
 * Caret rules that make the recipient chip behave like one character.
 *
 * The chip is an address wearing a session's title. Its letters are not text the
 * user wrote and never text they can usefully edit: deleting one character out
 * of `@@fix the proxy` leaves `@@fix the prox`, which addresses nothing and says
 * nothing. So the caret is not allowed to stop inside it, the arrow keys step
 * over the whole run, and a delete takes all of it.
 *
 * This is how a tag behaves in every mention field the user already knows, which
 * is why nothing here is configurable.
 */

/** Where the chip sits in the composer value, or null when it is not there. */
export interface ChipRange {
  start: number;
  /** Offset just past the chip's last character. */
  end: number;
  /**
   * Offset just past the chip AND the single space inserted with it.
   *
   * The space arrived with the chip, so it leaves with the chip: deleting the
   * chip and leaving a stray leading space would make the message start with
   * whitespace the user never typed.
   */
  endWithSpace: number;
}

export function findChipRange(value: string, token: string): ChipRange | null {
  if (!token) return null;
  const start = value.indexOf(token);
  if (start === -1) return null;
  const end = start + token.length;
  return { start, end, endWithSpace: value[end] === ' ' ? end + 1 : end };
}

/**
 * Where a caret at `caret` should go when the given arrow key is pressed, or
 * null to let the browser move it normally.
 *
 * Left from anywhere just inside or just past the chip lands on its start; right
 * from anywhere just inside or just before it lands on its end. One press
 * crosses the whole chip, in both directions.
 */
export function caretAfterArrow(
  range: ChipRange,
  caret: number,
  key: 'ArrowLeft' | 'ArrowRight',
): number | null {
  if (key === 'ArrowLeft') {
    return caret > range.start && caret <= range.end ? range.start : null;
  }
  return caret >= range.start && caret < range.end ? range.end : null;
}

/**
 * Where a caret that landed strictly inside the chip should be pushed, or null
 * when it is already somewhere it may rest.
 *
 * Covers every way in that the arrow keys do not: a click in the middle of the
 * chip, a drag that ends there, a restored selection. Pushed to the nearer edge,
 * so a click near the end does not throw the caret to the far side.
 */
export function caretPushedOutOfChip(range: ChipRange, caret: number): number | null {
  if (caret <= range.start || caret >= range.end) return null;
  const fromStart = caret - range.start;
  const fromEnd = range.end - caret;
  return fromStart <= fromEnd ? range.start : range.end;
}

/**
 * The range a Backspace at `caret` should delete, or null when the key means
 * ordinary text deletion.
 *
 * Only from the trailing edge: pressing Backspace with the caret before the chip
 * is deleting whatever comes earlier in the sentence.
 */
export function backspaceRange(range: ChipRange, caret: number): [number, number] | null {
  if (caret !== range.end && caret !== range.endWithSpace) return null;
  return [range.start, range.endWithSpace];
}

/**
 * The range a Delete at `caret` should remove, or null when the key means
 * ordinary forward deletion. The mirror of {@link backspaceRange}: only from the
 * leading edge.
 */
export function deleteRange(range: ChipRange, caret: number): [number, number] | null {
  if (caret !== range.start) return null;
  return [range.start, range.endWithSpace];
}
