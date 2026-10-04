import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FocusManager } from './FocusManager';

let hasFocus = true;
let visibility: DocumentVisibilityState = 'visible';

beforeEach(() => {
  hasFocus = true;
  visibility = 'visible';
  vi.spyOn(document, 'hasFocus').mockImplementation(() => hasFocus);
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FocusManager', () => {
  it('attaches no listeners until the first subscriber and removes them with the last', () => {
    const addWin = vi.spyOn(window, 'addEventListener');
    const removeWin = vi.spyOn(window, 'removeEventListener');
    const manager = new FocusManager();
    expect(addWin).not.toHaveBeenCalledWith('focus', expect.anything(), expect.anything());

    const off1 = manager.subscribe(() => {});
    const off2 = manager.subscribe(() => {});
    expect(addWin.mock.calls.filter(([type]) => type === 'focus')).toHaveLength(1);

    off1();
    expect(removeWin).not.toHaveBeenCalledWith('focus', expect.anything());
    off2();
    expect(removeWin).toHaveBeenCalledWith('focus', expect.anything());
    expect(removeWin).toHaveBeenCalledWith('blur', expect.anything());
  });

  it('notifies only when the state changes', () => {
    const manager = new FocusManager();
    const listener = vi.fn();
    manager.subscribe(listener);

    window.dispatchEvent(new Event('focus'));
    expect(listener).not.toHaveBeenCalled();

    hasFocus = false;
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('blur'));
    expect(listener.mock.calls).toEqual([[false]]);
  });

  it('follows window focus and blur by default', () => {
    const manager = new FocusManager();
    const listener = vi.fn();
    manager.subscribe(listener);

    hasFocus = false;
    window.dispatchEvent(new Event('blur'));
    hasFocus = true;
    window.dispatchEvent(new Event('focus'));
    expect(listener.mock.calls).toEqual([[false], [true]]);
  });

  it('replays the JCEF sequence as exactly [false, true]', () => {
    const manager = new FocusManager();
    const listener = vi.fn();
    manager.subscribe(listener);

    hasFocus = false;
    window.dispatchEvent(new Event('blur'));
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    visibility = 'visible'; // hasFocus stays false
    document.dispatchEvent(new Event('visibilitychange'));
    hasFocus = true;
    window.dispatchEvent(new Event('focus'));

    expect(listener.mock.calls).toEqual([[false], [true]]);
  });

  it('can swap the detection source with setEventListener', () => {
    const manager = new FocusManager();
    const listener = vi.fn();
    const cleanup = vi.fn();
    let refresh: ((focused?: boolean) => void) | undefined;
    manager.subscribe(listener);

    manager.setEventListener((r) => {
      refresh = r;
      return cleanup;
    });
    // old source is detached
    hasFocus = false;
    window.dispatchEvent(new Event('blur'));
    expect(listener).not.toHaveBeenCalled();

    refresh!(false);
    expect(listener.mock.calls).toEqual([[false]]);

    manager.setEventListener(() => undefined);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('lets setFocused override the state and undefined returns to the default', () => {
    const manager = new FocusManager();
    const listener = vi.fn();
    manager.subscribe(listener);

    manager.setFocused(false);
    expect(manager.isFocused()).toBe(false);
    manager.setFocused(false);
    manager.setFocused(true);
    expect(manager.isFocused()).toBe(true);

    manager.setFocused(false);
    hasFocus = true;
    manager.setFocused(undefined);
    expect(manager.isFocused()).toBe(true);
    expect(listener.mock.calls).toEqual([[false], [true], [false], [true]]);
  });
});
