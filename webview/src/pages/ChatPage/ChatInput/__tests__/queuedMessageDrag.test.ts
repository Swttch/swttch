import { describe, it, expect } from 'vitest';
import { messageDropZone, placeMessage } from '../queuedMessageDrag';

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
