import { describe, it, expect } from 'vitest';
import { STACK_EDGE_MARGIN, hoverFromPointer, messageDropZone, placeMessage } from '../queuedMessageDrag';

const rect = { top: 100, height: 40 };

describe('messageDropZone', () => {
  it('places before in the top quarter and after in the bottom quarter', () => {
    expect(messageDropZone(105, rect)).toBe('before');
    expect(messageDropZone(135, rect)).toBe('after');
  });

  it('merges over the middle half, its edges included', () => {
    expect(messageDropZone(110, rect)).toBe('merge');
    expect(messageDropZone(120, rect)).toBe('merge');
    expect(messageDropZone(130, rect)).toBe('merge');
  });

  it('reads a pointer above or below the message as before or after', () => {
    expect(messageDropZone(90, rect)).toBe('before');
    expect(messageDropZone(150, rect)).toBe('after');
  });
});

describe('placeMessage', () => {
  it('moves the message right before or right after the target', () => {
    expect(placeMessage(['a', 'b', 'c'], 'c', 'a', 'before')).toEqual(['c', 'a', 'b']);
    expect(placeMessage(['a', 'b', 'c'], 'c', 'a', 'after')).toEqual(['a', 'c', 'b']);
    expect(placeMessage(['a', 'b', 'c'], 'a', 'c', 'after')).toEqual(['b', 'c', 'a']);
  });

  it('leaves the order alone for an unknown message', () => {
    expect(placeMessage(['a', 'b'], 'zz', 'a', 'before')).toEqual(['a', 'b']);
    expect(placeMessage(['a', 'b'], 'a', 'zz', 'before')).toEqual(['a', 'b']);
  });
});

describe('hoverFromPointer', () => {
  const target = { id: 'b', shape: { boundingRectangle: { top: 100, left: 10, width: 200, height: 40 } } };
  const container = { top: 50, left: 0, width: 220, height: 200 };

  it('gives the id and zone while the pointer is inside the target', () => {
    expect(hoverFromPointer(target, { x: 50, y: 120 }, container)).toEqual({ id: 'b', zone: 'merge' });
    expect(hoverFromPointer(target, { x: 50, y: 102 }, container)).toEqual({ id: 'b', zone: 'before' });
  });

  it('gives gap when the pointer is inside the stack but off the target', () => {
    expect(hoverFromPointer(target, { x: 50, y: 143 }, container)).toBe('gap');
    expect(hoverFromPointer(target, { x: 5, y: 120 }, container)).toBe('gap');
  });

  it('gives gap without a target or a shape while inside the stack', () => {
    expect(hoverFromPointer(null, { x: 50, y: 120 }, container)).toBe('gap');
    expect(hoverFromPointer(undefined, { x: 50, y: 120 }, container)).toBe('gap');
    expect(hoverFromPointer({ id: 'b' }, { x: 50, y: 120 }, container)).toBe('gap');
  });

  it('reads the band just above the stack as before the first message and just below as after the last', () => {
    const ends = { first: 'a', last: 'c' };
    expect(hoverFromPointer(target, { x: 50, y: 40 }, container, ends)).toEqual({ id: 'a', zone: 'before' });
    expect(hoverFromPointer(target, { x: 50, y: 260 }, container, ends)).toEqual({ id: 'c', zone: 'after' });
    expect(hoverFromPointer(target, { x: 50, y: 50 - STACK_EDGE_MARGIN - 1 }, container, ends)).toBeNull();
    expect(hoverFromPointer(target, { x: 50, y: 250 + STACK_EDGE_MARGIN + 1 }, container, ends)).toBeNull();
    expect(hoverFromPointer(target, { x: -1, y: 40 }, container, ends)).toBeNull();
  });

  it('gives null when the pointer is outside the stack on any side, whatever the target', () => {
    expect(hoverFromPointer(target, { x: 50, y: 49 }, container)).toBeNull();
    expect(hoverFromPointer(target, { x: 50, y: 251 }, container)).toBeNull();
    expect(hoverFromPointer(target, { x: -1, y: 120 }, container)).toBeNull();
    expect(hoverFromPointer(target, { x: 221, y: 120 }, container)).toBeNull();
  });

  it('gives null when the stack has no box', () => {
    expect(hoverFromPointer(target, { x: 50, y: 120 }, undefined)).toBeNull();
  });
});
