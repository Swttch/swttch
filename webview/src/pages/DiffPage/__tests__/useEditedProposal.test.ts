/**
 * The proposed side of a review, as the reviewer has it.
 *
 * Two bugs live here, both of which reached the screen:
 *
 *  1. The page renders once before the change is fetched, so the hook is first
 *     called with an empty proposal. Seeding with `useState(proposal)` alone
 *     keeps that empty string forever — the diff then showed the whole file as
 *     deleted against nothing (`-60 +1`).
 *  2. `isEdited` counted edited hunks. A change the backend could not split has
 *     no hunks, so no amount of typing counted and the edit never reached the
 *     backend.
 *
 * Neither is visible in a type signature, and neither failed an existing test.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEditedProposal } from '../useEditedProposal';
import type { Hunk } from '@/shared';

const PROPOSAL = 'line 1\nline 2\nline 3\n';

/** One hunk covering proposed lines 2..3 (1-based). */
const HUNKS: Hunk[] = [
  { index: 0, oldStart: 2, oldLines: 2, newStart: 2, newLines: 2, lines: [] },
];

/** An editor change replacing zero-based lines [start, end]. */
function change(start: number, end: number) {
  return {
    range: { start: { line: start, character: 0 }, end: { line: end, character: 0 } },
    start: 0,
    end: 0,
    text: '',
  };
}

describe('useEditedProposal', () => {
  it('starts as the proposal itself', () => {
    const { result } = renderHook(() => useEditedProposal(PROPOSAL, HUNKS));

    expect(result.current.contents).toBe(PROPOSAL);
    expect(result.current.isEdited).toBe(false);
  });

  // The `-60 +1` bug: the first render has no change fetched yet.
  it('picks up the proposal when it arrives after the first render', () => {
    const { result, rerender } = renderHook(
      ({ proposal }) => useEditedProposal(proposal, HUNKS),
      { initialProps: { proposal: '' } },
    );

    expect(result.current.contents).toBe('');

    rerender({ proposal: PROPOSAL });

    expect(result.current.contents).toBe(PROPOSAL);
  });

  it('keeps an edit made after the proposal arrived', () => {
    // The re-seed must not fight the reviewer for the text on every render.
    const { result, rerender } = renderHook(
      ({ proposal }) => useEditedProposal(proposal, HUNKS),
      { initialProps: { proposal: '' } },
    );

    rerender({ proposal: PROPOSAL });
    act(() => result.current.applyEdit('edited\n', [change(1, 2)]));
    rerender({ proposal: PROPOSAL });

    expect(result.current.contents).toBe('edited\n');
  });

  it('records an edit and reports it', () => {
    const { result } = renderHook(() => useEditedProposal(PROPOSAL, HUNKS));

    act(() => result.current.applyEdit('edited\n', [change(1, 2)]));

    expect(result.current.contents).toBe('edited\n');
    expect(result.current.isEdited).toBe(true);
  });

  // The dropped-edit bug: no hunks to count, but text that plainly changed.
  it('reports an edit even when the change could not be split into hunks', () => {
    const { result } = renderHook(() => useEditedProposal(PROPOSAL, []));

    act(() => result.current.applyEdit('edited\n', [change(1, 2)]));

    expect(result.current.isEdited).toBe(true);
  });

  describe('which hunk was edited', () => {
    it('marks a hunk the change overlapped', () => {
      const { result } = renderHook(() => useEditedProposal(PROPOSAL, HUNKS));

      // Zero-based lines 1..2 are 1-based 2..3, which is the hunk.
      act(() => result.current.applyEdit('edited\n', [change(1, 2)]));

      expect(result.current.isHunkEdited(0)).toBe(true);
    });

    it('leaves a hunk the change did not reach alone', () => {
      const { result } = renderHook(() => useEditedProposal(PROPOSAL, HUNKS));

      // Zero-based line 0 is 1-based line 1, above the hunk.
      act(() => result.current.applyEdit('edited\n', [change(0, 0)]));

      expect(result.current.isHunkEdited(0)).toBe(false);
    });

    it('forgets a hunk once it is reset', () => {
      const { result } = renderHook(() => useEditedProposal(PROPOSAL, HUNKS));

      act(() => result.current.applyEdit('edited\n', [change(1, 2)]));
      act(() => result.current.resetHunk(0));

      expect(result.current.isHunkEdited(0)).toBe(false);
    });
  });
});
