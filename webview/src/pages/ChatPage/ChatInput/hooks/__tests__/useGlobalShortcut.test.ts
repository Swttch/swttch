import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGlobalShortcut } from '../useGlobalShortcut';

/**
 * Acceptance for: the voice shortcut has to work wherever the user is, not only
 * while the composer holds focus.
 */

/** Dispatch a real keydown at some element, so focus actually matters. */
function pressAt(target: EventTarget, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe('useGlobalShortcut', () => {
  let onTrigger: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onTrigger = vi.fn();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('fires when nothing in particular has focus', () => {
    renderHook(() => useGlobalShortcut('Alt+D', onTrigger));
    pressAt(document.body, 'd', { altKey: true });
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('fires while a text field has focus', () => {
    // The composer is a text field, and this used to be the ONLY place the
    // shortcut worked. It has to keep working there too.
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    renderHook(() => useGlobalShortcut('Alt+D', onTrigger));
    pressAt(input, 'd', { altKey: true });
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('fires from a button elsewhere in the app', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();

    renderHook(() => useGlobalShortcut('Alt+D', onTrigger));
    pressAt(button, 'd', { altKey: true });
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('leaves every other key alone', () => {
    // Typing must survive: only the bound combination is claimed.
    renderHook(() => useGlobalShortcut('Alt+D', onTrigger));
    const plain = pressAt(document.body, 'd');
    expect(onTrigger).not.toHaveBeenCalled();
    expect(plain.defaultPrevented).toBe(false);
  });

  it('claims the event so the browser does not act on it too', () => {
    renderHook(() => useGlobalShortcut('Alt+D', onTrigger));
    const event = pressAt(document.body, 'd', { altKey: true });
    expect(event.defaultPrevented).toBe(true);
  });

  it('fires once for a held key, not once per repeat', () => {
    renderHook(() => useGlobalShortcut('Alt+D', onTrigger));
    pressAt(document.body, 'd', { altKey: true });
    for (let i = 0; i < 10; i++) pressAt(document.body, 'd', { altKey: true, repeat: true });
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('follows a rebind without needing a remount', () => {
    const { rerender } = renderHook(({ key }) => useGlobalShortcut(key, onTrigger), {
      initialProps: { key: 'Alt+D' },
    });

    rerender({ key: 'Ctrl+M' });
    pressAt(document.body, 'd', { altKey: true });
    expect(onTrigger).not.toHaveBeenCalled();

    pressAt(document.body, 'm', { ctrlKey: true });
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('stops listening once unmounted', () => {
    const { unmount } = renderHook(() => useGlobalShortcut('Alt+D', onTrigger));
    unmount();
    pressAt(document.body, 'd', { altKey: true });
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('does nothing when no shortcut is bound', () => {
    renderHook(() => useGlobalShortcut(null, onTrigger));
    pressAt(document.body, 'd', { altKey: true });
    expect(onTrigger).not.toHaveBeenCalled();
  });
});
