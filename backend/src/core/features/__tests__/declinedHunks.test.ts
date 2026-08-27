/**
 * Telling a declined hunk from a rewritten one (#359).
 *
 * Measured in QA on a three-constant file: the reviewer unticked the hunk that
 * lowered a threshold from 50000 to 30000 and kept the one that raised a rate.
 * The notice called it an edit and rendered the decline as "-30000 +50000",
 * which reads as the reviewer having written 50000 themselves. They wrote
 * nothing; 50000 was already in the file.
 *
 * Two earlier attempts at this judgement were wrong, and both are pinned below:
 *
 * - Counting the backend's hunks against the number of accepted ranges. Those
 *   are different splits of the same change — the IDE counted four where the
 *   backend counted two on a real file — so the comparison meant nothing.
 * - Reading the applied text alone. A declined line and a line typed back to
 *   its original value come out identical there, so an ordinary edit was
 *   reported as a decline.
 *
 * What separates them is the accepted ranges: declining removes a region from
 * that list, typing does not.
 */
import { describe, it, expect } from 'vitest';
import { declinedAnything } from '../declinedHunks';
import type { AcceptedRange } from '../hunks';

const original = [
  'const FREE_SHIPPING_THRESHOLD = 50000;',
  'const BULK_DISCOUNT_COUNT = 10;',
  'const BULK_DISCOUNT_RATE = 0.1;',
].join('\n') + '\n';

const proposed = [
  'const FREE_SHIPPING_THRESHOLD = 30000;',
  'const BULK_DISCOUNT_COUNT = 10;',
  'const BULK_DISCOUNT_RATE = 0.15;',
].join('\n') + '\n';

const preview = { oldContent: original, newContent: proposed };

/** The threshold on line 1, as the reviewer's answer would name it. */
const THRESHOLD: AcceptedRange = { oldStart: 0, oldEnd: 1, newStart: 0, newEnd: 1 };
/** The discount rate on line 3. */
const RATE: AcceptedRange = { oldStart: 2, oldEnd: 3, newStart: 2, newEnd: 3 };

describe('declinedAnything', () => {
  /** The reported case: one hunk kept, one turned down. */
  it('sees a decline when a proposed change was left out of the accepted ranges', () => {
    expect(declinedAnything(preview, [RATE])).toBe(true);
  });

  it('sees no decline when every proposed change was accepted', () => {
    expect(declinedAnything(preview, [THRESHOLD, RATE])).toBe(false);
  });

  it('sees a decline when every hunk was turned down', () => {
    expect(declinedAnything(preview, [])).toBe(true);
  });

  /**
   * The case that caught the previous attempt. The reviewer accepted both hunks
   * and then typed one of them back to its original value. Nothing was
   * declined, and calling it one would tell the assistant not to propose a
   * change the reviewer never refused.
   */
  it('sees no decline when the reviewer typed a value back to the original', () => {
    // Both ranges accepted; what the reviewer did afterwards was type.
    expect(declinedAnything(preview, [THRESHOLD, RATE])).toBe(false);
  });

  /**
   * Typing settles it on its own (#305).
   *
   * An edited proposal answers with the reviewer's own text, so the ranges no
   * longer describe what happened — they name hunks of a proposal that has
   * since been rewritten. Measured in QA: a reviewer applied all three hunks
   * and retyped two of them, and judging by ranges alone reported a decline
   * with nothing declined.
   */
  it('sees no decline when the reviewer rewrote the proposal', () => {
    const rewritten = proposed.replace('0.15', '0.2');

    // Ranges that would read as a decline on their own.
    expect(declinedAnything(preview, [], rewritten)).toBe(false);
  });

  it('still judges by the ranges when nothing was typed', () => {
    expect(declinedAnything(preview, [], undefined)).toBe(true);
  });

  /**
   * A line the proposal never touched needs no accepted range covering it.
   * Without this the answer would be true for every partial approval of any
   * file, since most lines are unchanged and uncovered.
   */
  it('ignores lines the proposal did not change', () => {
    const untouched = { oldContent: original, newContent: original };

    expect(declinedAnything(untouched, [])).toBe(false);
  });

  /**
   * Adding or removing lines shifts every line after it, so a line number no
   * longer names the same place on both sides. Answering false keeps the
   * wording that shipped, which errs toward saying less rather than wrong.
   */
  it('declines to judge when the proposal changed the line count', () => {
    const longer = { oldContent: original, newContent: original + 'const EXTRA = 1;\n' };

    expect(declinedAnything(longer, [])).toBe(false);
  });

  /**
   * A range spanning several lines covers all of them, so a multi-line hunk
   * accepted as one is not read as a partial decline.
   */
  it('treats a multi-line range as covering every line in it', () => {
    const wholeFile = { oldContent: original, newContent: proposed };
    const everything: AcceptedRange = { oldStart: 0, oldEnd: 3, newStart: 0, newEnd: 3 };

    expect(declinedAnything(wholeFile, [everything])).toBe(false);
  });
});
