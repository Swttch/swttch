import { describe, it, expect } from 'vitest';
import { hoverFromPointer, messageDropZone, placeMessage } from '../queuedMessageDrag';

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

  it('gives the id and zone while the pointer is inside the target', () => {
    expect(hoverFromPointer(target, { x: 50, y: 120 })).toEqual({ id: 'b', zone: 'merge' });
    expect(hoverFromPointer(target, { x: 50, y: 102 })).toEqual({ id: 'b', zone: 'before' });
  });

  it('gives null when the pointer is outside on any side', () => {
    expect(hoverFromPointer(target, { x: 50, y: 99 })).toBeNull();
    expect(hoverFromPointer(target, { x: 50, y: 141 })).toBeNull();
    expect(hoverFromPointer(target, { x: 9, y: 120 })).toBeNull();
    expect(hoverFromPointer(target, { x: 211, y: 120 })).toBeNull();
  });

  it('gives null without a target or a shape', () => {
    expect(hoverFromPointer(null, { x: 50, y: 120 })).toBeNull();
    expect(hoverFromPointer(undefined, { x: 50, y: 120 })).toBeNull();
    expect(hoverFromPointer({ id: 'b' }, { x: 50, y: 120 })).toBeNull();
  });
});
