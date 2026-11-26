/**
 * Telling a middle-click paste apart (#754). It pastes the selection, not the
 * clipboard, and its paste event says nothing about where it came from.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { takeMiddleClickPaste, watchMiddleClicks } from '../middleClickPaste';

const mouse = (type: 'mousedown' | 'mouseup', button: number) =>
  document.body.dispatchEvent(new MouseEvent(type, { button, bubbles: true }));

describe('middle-click paste', () => {
  let stop: () => void = () => {};

  const watch = () => {
    stop = watchMiddleClicks(document);
  };

  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it.each(['mousedown', 'mouseup'] as const)('knows a paste that follows a middle %s', (type) => {
    watch();
    mouse(type, 1);

    expect(takeMiddleClickPaste()).toBe(true);
  });

  it('answers for one paste only', () => {
    watch();
    mouse('mousedown', 1);
    takeMiddleClickPaste();

    expect(takeMiddleClickPaste()).toBe(false);
  });

  it.each([0, 2])('is not fooled by button %i, which also forgets an earlier middle click', (button) => {
    watch();
    mouse('mouseup', 1);
    mouse('mousedown', button);

    expect(takeMiddleClickPaste()).toBe(false);
  });

  it('forgets the click once a key is pressed, as for a keyboard paste', () => {
    watch();
    mouse('mouseup', 1);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }));

    expect(takeMiddleClickPaste()).toBe(false);
  });

  it('does not claim a paste that comes long after the click', () => {
    vi.useFakeTimers();
    watch();
    mouse('mouseup', 1);
    vi.advanceTimersByTime(1_001);

    expect(takeMiddleClickPaste()).toBe(false);
  });

  it('sees the click even where something stops it from bubbling', () => {
    watch();
    const swallow = (event: Event) => event.stopPropagation();
    document.body.addEventListener('mousedown', swallow);
    mouse('mousedown', 1);
    document.body.removeEventListener('mousedown', swallow);

    expect(takeMiddleClickPaste()).toBe(true);
  });

  it('sees nothing once it stops watching', () => {
    watch();
    stop();
    mouse('mousedown', 1);

    expect(takeMiddleClickPaste()).toBe(false);
  });
});
