/**
 * Decisions belong to the blocks they were made against (#359).
 *
 * Found in live QA: after the file moved on disk and the reviewer pressed
 * Refresh, the rebuilt diff was drawn but the previous decisions were replayed
 * over it. The screen looked unchanged, so Confirm went through against a base
 * the reviewer had never seen.
 *
 * Note on `keptCount`: it counts blocks NOT explicitly undone, so an untouched
 * block already counts as kept — whole-file accept is the default and Deny is
 * the explicit act. `openCount` and `decisionFor` are what distinguish "decided"
 * from "not decided yet", so those are what these assert on.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHunkDecisions } from '../useHunkDecisions';
import type { ChangeBlock } from '../changeBlocks';

const block = (index: number, oldStart = index * 10 + 1): ChangeBlock => ({
  index,
  newStart: oldStart,
  newLines: 1,
  oldStart,
  oldLines: 1,
});

describe('useHunkDecisions', () => {
  it('keeps decisions while the blocks stay the same', () => {
    const blocks = [block(0), block(1)];
    const { result, rerender } = renderHook(({ b }) => useHunkDecisions(b), {
      initialProps: { b: blocks },
    });

    act(() => result.current.undo(0));
    expect(result.current.decisionFor(0)).toBe('undo');
    expect(result.current.openCount).toBe(1);

    // Same reference: an unrelated re-render must not lose the decision.
    rerender({ b: blocks });
    expect(result.current.decisionFor(0)).toBe('undo');
    expect(result.current.openCount).toBe(1);
  });

  it('drops decisions when the review is rebuilt against new blocks', () => {
    const { result, rerender } = renderHook(({ b }) => useHunkDecisions(b), {
      initialProps: { b: [block(0), block(1)] },
    });

    act(() => result.current.acceptAll());
    expect(result.current.openCount).toBe(0);

    // A refresh produces a fresh block list: the old decisions address line
    // numbers that no longer mean the same thing.
    rerender({ b: [block(0), block(1)] });

    expect(result.current.openCount).toBe(2);
    expect(result.current.decisionFor(0)).toBeUndefined();
    expect(result.current.decisionFor(1)).toBeUndefined();
  });

  it('records a decision taken after a rebuild against the NEW blocks', () => {
    const { result, rerender } = renderHook(({ b }) => useHunkDecisions(b), {
      initialProps: { b: [block(0), block(1)] },
    });

    act(() => result.current.undo(0));
    rerender({ b: [block(0), block(1)] });

    // Decisions start empty again, and a new one must not merge into the set
    // that was dropped.
    act(() => result.current.undo(1));

    expect(result.current.decisionFor(0)).toBeUndefined();
    expect(result.current.decisionFor(1)).toBe('undo');
    expect(result.current.openCount).toBe(1);
  });

  it('reopens every block on a rebuilt review', () => {
    // What the banner's Refresh is for: the reviewer decides again, so nothing
    // may stay answered on their behalf.
    const { result, rerender } = renderHook(({ b }) => useHunkDecisions(b), {
      initialProps: { b: [block(0)] },
    });

    act(() => result.current.acceptAll());
    expect(result.current.openCount).toBe(0);

    rerender({ b: [block(0), block(1), block(2)] });

    expect(result.current.openCount).toBe(3);
  });
});
