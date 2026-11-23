import { describe, it, expect } from 'vitest';
import {
  clampWheelScrollSpeed,
  wheelDeltaYInPixels,
  isTakenByNestedScroller,
  WHEEL_SCROLL_SPEED_DEFAULT,
} from '../wheelScrollSpeed';

describe('clampWheelScrollSpeed', () => {
  it('keeps values inside 0.5 to 5 and pulls the rest to the edge', () => {
    expect(clampWheelScrollSpeed(2.5)).toBe(2.5);
    expect(clampWheelScrollSpeed(0.1)).toBe(0.5);
    expect(clampWheelScrollSpeed(50)).toBe(5);
  });
  it('turns anything that is not a number into the default', () => {
    expect(clampWheelScrollSpeed(NaN)).toBe(WHEEL_SCROLL_SPEED_DEFAULT);
    expect(clampWheelScrollSpeed(undefined)).toBe(WHEEL_SCROLL_SPEED_DEFAULT);
  });
});

describe('wheelDeltaYInPixels', () => {
  it('reads pixels as they are, lines as 16px and pages as the page height', () => {
    expect(wheelDeltaYInPixels({ deltaY: 100, deltaMode: 0 }, 600)).toBe(100);
    expect(wheelDeltaYInPixels({ deltaY: 3, deltaMode: 1 }, 600)).toBe(48);
    expect(wheelDeltaYInPixels({ deltaY: 1, deltaMode: 2 }, 600)).toBe(600);
  });
});

describe('isTakenByNestedScroller', () => {
  function box(scrollTop: number): HTMLElement {
    const el = document.createElement('div');
    el.style.overflowY = 'auto';
    Object.defineProperty(el, 'scrollHeight', { value: 500 });
    Object.defineProperty(el, 'clientHeight', { value: 100 });
    el.scrollTop = scrollTop;
    return el;
  }
  it('is true when a scroll box under the pointer can still move in that direction', () => {
    const container = document.createElement('div');
    const inner = box(0);
    const leaf = document.createElement('span');
    inner.appendChild(leaf);
    container.appendChild(inner);
    expect(isTakenByNestedScroller(leaf, container, 50)).toBe(true);
    expect(isTakenByNestedScroller(leaf, container, -50)).toBe(false);
  });
  it('is false when there is no scroll box between the pointer and the chat', () => {
    const container = document.createElement('div');
    const leaf = document.createElement('span');
    container.appendChild(leaf);
    expect(isTakenByNestedScroller(leaf, container, 50)).toBe(false);
  });
});
