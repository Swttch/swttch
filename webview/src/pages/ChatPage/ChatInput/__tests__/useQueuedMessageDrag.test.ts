import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useQueuedMessageDrag } from '../useQueuedMessageDrag';
import { MESSAGE_DRAG_DWELL_MS } from '../queuedMessageDrag';

function setup(messageIds = ['a', 'b', 'c']) {
  const onMove = vi.fn();
  const onMerge = vi.fn();
  const view = renderHook(() => useQueuedMessageDrag({ messageIds, onMove, onMerge }));
  return { ...view, onMove, onMerge };
}
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe('useQueuedMessageDrag', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('changes nothing before the hold delay', () => {
    const { result } = setup();
    act(() => result.current.start('c'));
    act(() => result.current.hover('a', 'merge'));
    wait(MESSAGE_DRAG_DWELL_MS - 1);
    expect(result.current.mergeTargetId).toBeNull();
    act(() => result.current.hover('a', 'before'));
    wait(MESSAGE_DRAG_DWELL_MS - 1);
    expect(result.current.orderedIds).toEqual(['a', 'b', 'c']);
  });

  it('outlines the target after holding over its middle, without moving anything', () => {
    const { result } = setup();
    act(() => result.current.start('c'));
    act(() => result.current.hover('a', 'merge'));
    wait(MESSAGE_DRAG_DWELL_MS);
    expect(result.current.mergeTargetId).toBe('a');
    expect(result.current.orderedIds).toEqual(['a', 'b', 'c']);
  });

  it('makes room after holding near an edge', () => {
    const { result } = setup();
    act(() => result.current.start('c'));
    act(() => result.current.hover('a', 'before'));
    wait(MESSAGE_DRAG_DWELL_MS);
    expect(result.current.orderedIds).toEqual(['c', 'a', 'b']);
    expect(result.current.mergeTargetId).toBeNull();
  });

  it('restarts the delay when the zone changes', () => {
    const { result } = setup();
    act(() => result.current.start('c'));
    act(() => result.current.hover('a', 'merge'));
    wait(200);
    act(() => result.current.hover('a', 'after'));
    wait(200);
    expect(result.current.mergeTargetId).toBeNull();
    expect(result.current.orderedIds).toEqual(['a', 'b', 'c']);
    wait(MESSAGE_DRAG_DWELL_MS - 200);
    expect(result.current.orderedIds).toEqual(['a', 'c', 'b']);
  });

  it('drops the outline as soon as the pointer leaves the outlined message', () => {
    const { result } = setup();
    act(() => result.current.start('c'));
    act(() => result.current.hover('a', 'merge'));
    wait(MESSAGE_DRAG_DWELL_MS);
    act(() => result.current.hover('b', 'after'));
    expect(result.current.mergeTargetId).toBeNull();
  });

  it('ignores hovering the dragged message itself', () => {
    const { result } = setup();
    act(() => result.current.start('c'));
    act(() => result.current.hover('c', 'merge'));
    wait(MESSAGE_DRAG_DWELL_MS);
    expect(result.current.mergeTargetId).toBeNull();
  });

  it('merges on drop when a target is outlined', () => {
    const { result, onMerge, onMove } = setup();
    act(() => result.current.start('c'));
    act(() => result.current.hover('a', 'merge'));
    wait(MESSAGE_DRAG_DWELL_MS);
    act(() => result.current.drop());
    expect(onMerge).toHaveBeenCalledWith('c', 'a');
    expect(onMove).not.toHaveBeenCalled();
    expect(result.current.draggingId).toBeNull();
    expect(result.current.mergeTargetId).toBeNull();
  });

  it('moves on drop to the previewed place', () => {
    const { result, onMove, onMerge } = setup();
    act(() => result.current.start('c'));
    act(() => result.current.hover('a', 'before'));
    wait(MESSAGE_DRAG_DWELL_MS);
    act(() => result.current.drop());
    expect(onMove).toHaveBeenCalledWith('c', 0);
    expect(onMerge).not.toHaveBeenCalled();
    expect(result.current.orderedIds).toEqual(['a', 'b', 'c']);
  });

  it('does nothing on a drop before anything was previewed', () => {
    const { result, onMove, onMerge } = setup();
    act(() => result.current.start('c'));
    act(() => result.current.hover('a', 'merge'));
    wait(100);
    act(() => result.current.drop());
    wait(MESSAGE_DRAG_DWELL_MS);
    expect(onMove).not.toHaveBeenCalled();
    expect(onMerge).not.toHaveBeenCalled();
    expect(result.current.mergeTargetId).toBeNull();
  });

  it('does nothing when released outside the stack, even after a preview', () => {
    const { result, onMove, onMerge } = setup();
    act(() => result.current.start('c'));
    act(() => result.current.hover('a', 'before'));
    wait(MESSAGE_DRAG_DWELL_MS);
    act(() => result.current.hover(null, null));
    act(() => result.current.drop());
    expect(onMove).not.toHaveBeenCalled();
    expect(onMerge).not.toHaveBeenCalled();
    expect(result.current.orderedIds).toEqual(['a', 'b', 'c']);
  });

  it('does nothing on cancel', () => {
    const { result, onMove, onMerge } = setup();
    act(() => result.current.start('c'));
    act(() => result.current.hover('a', 'merge'));
    wait(MESSAGE_DRAG_DWELL_MS);
    act(() => result.current.cancel());
    expect(onMove).not.toHaveBeenCalled();
    expect(onMerge).not.toHaveBeenCalled();
    expect(result.current.draggingId).toBeNull();
  });

  it('counts a hover fired right after start, with one captured handle', () => {
    const { result } = setup();
    const drag = result.current;
    act(() => { drag.start('c'); drag.hover('a', 'merge'); });
    wait(MESSAGE_DRAG_DWELL_MS);
    expect(result.current.mergeTargetId).toBe('a');
  });

  it('merges on drop through a stale handle', () => {
    const { result, onMerge, onMove } = setup();
    const drag = result.current;
    act(() => { drag.start('c'); drag.hover('a', 'merge'); });
    wait(MESSAGE_DRAG_DWELL_MS);
    act(() => drag.drop());
    expect(onMerge).toHaveBeenCalledWith('c', 'a');
    expect(onMove).not.toHaveBeenCalled();
  });

  it('moves on drop through a stale handle', () => {
    const { result, onMerge, onMove } = setup();
    const drag = result.current;
    act(() => { drag.start('c'); drag.hover('a', 'before'); });
    wait(MESSAGE_DRAG_DWELL_MS);
    act(() => drag.drop());
    expect(onMove).toHaveBeenCalledWith('c', 0);
    expect(onMerge).not.toHaveBeenCalled();
  });
});
