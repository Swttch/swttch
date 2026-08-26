/**
 * The reviewer's typing surviving a refresh on the IDE's diff (#359).
 *
 * The built-in surface already did this; the IDE's viewer did not, and the two
 * were not sharing a merge. Measured in QA: an edit from `CLAUDE` to `CLAUDE22`
 * vanished on Refresh, with nothing said about it, even though the disk change
 * was on a different line entirely.
 *
 * The merge itself is covered by the shared mergeEdits suite. What is pinned
 * here is this path's own decisions: when to merge at all, and what a refresh
 * with nothing to carry must leave alone.
 */
import { describe, it, expect } from 'vitest';
import { carryEditAcrossRefresh } from '../carryEditAcrossRefresh';

const before = 'line 1\nline 5 CLAUDE\nline 9\n';

describe('carryEditAcrossRefresh', () => {
  /**
   * The reported case: the reviewer typed on line 2, the disk change landed on
   * line 1. Nothing overlaps, so nothing should be lost.
   */
  it('keeps typing that does not collide with the rebuilt proposal', () => {
    const edited = 'line 1\nline 5 CLAUDE22\nline 9\n';
    const rebuilt = 'line 1 EDITED ON DISK\nline 5 CLAUDE\nline 9\n';

    const carried = carryEditAcrossRefresh(before, edited, rebuilt);

    expect(carried.newContent).toBe('line 1 EDITED ON DISK\nline 5 CLAUDE22\nline 9\n');
    expect(carried.conflicts).toEqual([]);
  });

  /**
   * Both sides rewrote the same line. The rebuilt proposal wins, because it is
   * the one stated against content that exists — but the loss is reported so it
   * can be said out loud rather than happening silently.
   */
  it('reports the line when both sides changed it', () => {
    const edited = 'line 1\nline 5 MINE\nline 9\n';
    const rebuilt = 'line 1\nline 5 THEIRS\nline 9\n';

    const carried = carryEditAcrossRefresh(before, edited, rebuilt);

    expect(carried.newContent).toBe(rebuilt);
    expect(carried.conflicts).toEqual([2]);
  });

  it('leaves the rebuilt proposal alone when nothing was typed', () => {
    const rebuilt = 'line 1 EDITED ON DISK\nline 5 CLAUDE\nline 9\n';

    const carried = carryEditAcrossRefresh(before, before, rebuilt);

    expect(carried.newContent).toBe(rebuilt);
    expect(carried.conflicts).toEqual([]);
  });

  /**
   * Both absences are ordinary, not errors: a review nobody typed into sends no
   * edit, and one the IDE could not read back sends none either. Neither may
   * turn a refresh into a no-op.
   */
  it('passes the rebuilt proposal through when there is no edit to carry', () => {
    const rebuilt = 'line 1 EDITED ON DISK\nline 5 CLAUDE\nline 9\n';

    expect(carryEditAcrossRefresh(before, undefined, rebuilt).newContent).toBe(rebuilt);
    expect(carryEditAcrossRefresh(undefined, 'anything', rebuilt).newContent).toBe(rebuilt);
  });
});
