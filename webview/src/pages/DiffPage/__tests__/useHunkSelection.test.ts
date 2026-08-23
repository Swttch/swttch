/**
 * Which parts of a proposal get written.
 *
 * The ranges this produces are handed straight to the backend, which rebuilds
 * the file from them — so an off-by-one here is a wrong file on disk, not a
 * wrong pixel. The coordinate change is the risk: a hunk counts from 1 and
 * carries a length, a range counts from 0 and ends one past its last line.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHunkSelection } from '../useHunkSelection';
import { hunkToAcceptedRange, type Hunk } from '@/shared';

/** Two hunks, far enough apart to be unmistakable in a range list. */
const HUNKS: Hunk[] = [
  { index: 0, oldStart: 10, oldLines: 3, newStart: 10, newLines: 5, lines: [] },
  { index: 1, oldStart: 40, oldLines: 2, newStart: 42, newLines: 2, lines: [] },
];

describe('hunkToAcceptedRange', () => {
  it('converts a 1-based hunk into a 0-based end-exclusive range', () => {
    // Lines 10..12 of the original (1-based, 3 lines) are rows 9..11, which the
    // backend names as [9, 12).
    expect(hunkToAcceptedRange(HUNKS[0])).toEqual({
      oldStart: 9,
      oldEnd: 12,
      newStart: 9,
      newEnd: 14,
    });
  });

  it('handles a hunk whose two sides sit at different offsets', () => {
    // An earlier hunk that added lines pushes the proposed side down; the two
    // sides must not be assumed to line up.
    expect(hunkToAcceptedRange(HUNKS[1])).toEqual({
      oldStart: 39,
      oldEnd: 41,
      newStart: 41,
      newEnd: 43,
    });
  });
});

describe('useHunkSelection', () => {
  it('keeps everything to begin with', () => {
    // The reviewer is reading a proposal, not assembling one.
    const { result } = renderHook(() => useHunkSelection(HUNKS));

    expect(result.current.keptCount).toBe(2);
    expect(result.current.total).toBe(2);
    expect(result.current.acceptedRanges).toHaveLength(2);
  });

  it('drops the hunk that was toggled and nothing else', () => {
    const { result } = renderHook(() => useHunkSelection(HUNKS));

    act(() => result.current.toggle(0));

    expect(result.current.isKept(0)).toBe(false);
    expect(result.current.isKept(1)).toBe(true);
    expect(result.current.acceptedRanges).toEqual([hunkToAcceptedRange(HUNKS[1])]);
  });

  it('brings a dropped hunk back', () => {
    const { result } = renderHook(() => useHunkSelection(HUNKS));

    act(() => result.current.toggle(0));
    act(() => result.current.toggle(0));

    expect(result.current.isKept(0)).toBe(true);
    expect(result.current.keptCount).toBe(2);
  });

  it('drops every hunk at once, which is a refusal', () => {
    // An empty range list is how the backend hears "write nothing".
    const { result } = renderHook(() => useHunkSelection(HUNKS));

    act(() => result.current.dropAll());

    expect(result.current.keptCount).toBe(0);
    expect(result.current.acceptedRanges).toEqual([]);
  });

  it('keeps every hunk at once', () => {
    const { result } = renderHook(() => useHunkSelection(HUNKS));

    act(() => result.current.dropAll());
    act(() => result.current.keepAll());

    expect(result.current.keptCount).toBe(2);
  });

  it('emits ranges in ascending order, which is what the backend requires', () => {
    // applyAcceptedRanges refuses to guess at overlapping or unsorted input.
    const { result } = renderHook(() => useHunkSelection(HUNKS));

    const starts = result.current.acceptedRanges.map((r) => r.oldStart);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('has nothing to keep when there are no hunks', () => {
    // The backend answers null for a change too large to split, and stores an
    // empty list. The screen falls back to a whole-file decision there.
    const { result } = renderHook(() => useHunkSelection([]));

    expect(result.current.total).toBe(0);
    expect(result.current.acceptedRanges).toEqual([]);
  });
});
