import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MessageType } from '@/shared';
import { useEmacsTextKeys } from '../useEmacsTextKeys';
import { killRing } from '@/utils/killRing';

const platform = vi.hoisted(() => ({ mac: true }));
vi.mock('@/config/environment', () => ({ isMac: () => platform.mac }));

type BridgeHandler = (msg: { type: string; payload: Record<string, string | number | boolean | null> }) => void;

const handlers = new Map<string, Set<BridgeHandler>>();
const mockBridge = {
  subscribe: vi.fn((type: string, handler: BridgeHandler) => {
    if (!handlers.has(type)) handlers.set(type, new Set());
    handlers.get(type)!.add(handler);
    return () => {
      handlers.get(type)?.delete(handler);
    };
  }),
};

vi.mock('@/api/bridge/Bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/bridge/Bridge')>()),
  getBridge: () => mockBridge,
}));

/** What the backend delivers when the IDE reports an Emacs text key. */
function deliver(payload: Record<string, string | number | boolean | null>) {
  handlers.get(MessageType.EMACS_TEXT_KEY_PRESSED)?.forEach((h) =>
    h({ type: MessageType.EMACS_TEXT_KEY_PRESSED, payload }),
  );
}

/**
 * Under JCEF off-screen rendering the page sees every Ctrl+letter as Ctrl+A, so
 * the IDE names the letter and the webview moves the caret or edits the text of
 * whatever editable has focus (issue #506). jsdom has no execCommand editing, so
 * edits are asserted through the form-field fallback. `<input>`/`<textarea>` are the half jsdom can assert,
 * since their selection is character offsets rather than a laid-out Selection.
 */
describe('useEmacsTextKeys', () => {
  let field: HTMLInputElement;
  let unmount: () => void;

  const originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand');

  beforeEach(() => {
    handlers.clear();
    killRing.clear();
    Object.defineProperty(document, 'execCommand', { configurable: true, writable: true, value: () => false });
    unmount = renderHook(() => useEmacsTextKeys()).unmount;
    field = document.createElement('input');
    field.value = 'hello world';
    document.body.appendChild(field);
    field.focus();
  });

  afterEach(() => {
    unmount();
    field.remove();
    if (originalExecCommand) {
      Object.defineProperty(document, 'execCommand', originalExecCommand);
    } else {
      delete (document as { execCommand?: Document['execCommand'] }).execCommand;
    }
  });

  it('moves an input caret one character with b and f', () => {
    field.setSelectionRange(5, 5);

    deliver({ key: 'b' });
    expect(field.selectionStart).toBe(4);

    deliver({ key: 'f' });
    deliver({ key: 'f' });
    expect(field.selectionStart).toBe(6);
  });

  it('sends an input caret to its ends with a and e', () => {
    field.setSelectionRange(5, 5);

    deliver({ key: 'a' });
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 0]);

    deliver({ key: 'e' });
    expect([field.selectionStart, field.selectionEnd]).toEqual([11, 11]);
  });

  it('moves a row in a textarea with p and n', () => {
    const area = document.createElement('textarea');
    area.value = 'abcdef\nxy\nlonger line';
    document.body.appendChild(area);
    area.focus();
    area.setSelectionRange(4, 4);

    deliver({ key: 'n' });
    expect(area.selectionStart).toBe('abcdef\nxy'.length);

    deliver({ key: 'p' });
    expect(area.selectionStart).toBe(2);
    area.remove();
  });

  it('deletes forward with d and backward with h', () => {
    field.setSelectionRange(5, 5);

    deliver({ key: 'd' });
    expect(field.value).toBe('helloworld');

    deliver({ key: 'h' });
    expect(field.value).toBe('hellworld');
    expect(field.selectionStart).toBe(4);
  });

  it('cuts with k and puts back with y', () => {
    field.setSelectionRange(5, 5);

    deliver({ key: 'k' });
    expect(field.value).toBe('hello');

    field.setSelectionRange(0, 0);
    deliver({ key: 'y' });
    expect(field.value).toBe(' worldhello');
  });

  it('transposes with t', () => {
    field.setSelectionRange(1, 1);

    deliver({ key: 't' });

    expect(field.value).toBe('ehllo world');
    expect(field.selectionStart).toBe(2);
  });

  it('opens a line with o and pages down with v in a textarea', () => {
    const area = document.createElement('textarea');
    area.value = 'ab';
    document.body.appendChild(area);
    area.focus();
    area.setSelectionRange(1, 1);

    deliver({ key: 'o' });
    expect(area.value).toBe('a\nb');
    expect(area.selectionStart).toBe(1);

    deliver({ key: 'v' });
    expect(area.selectionStart).toBe(3);
    area.remove();
  });

  it('leaves the text alone for l', () => {
    field.setSelectionRange(3, 3);

    deliver({ key: 'l' });

    expect(field.value).toBe('hello world');
    expect(field.selectionStart).toBe(3);
  });

  it('extends with v when the payload says Shift was held', () => {
    field.setSelectionRange(2, 2);

    deliver({ key: 'v', shift: true });

    expect([field.selectionStart, field.selectionEnd]).toEqual([2, 11]);
  });

  it('does nothing for d, h, k, l, o, t, y when the payload says Shift was held', () => {
    killRing.recordKill({}, 'ring', 0, 'ring', '');
    field.setSelectionRange(5, 5);

    for (const key of ['d', 'h', 'k', 'l', 'o', 't', 'y']) deliver({ key, shift: true });

    expect(field.value).toBe('hello world');
    expect([field.selectionStart, field.selectionEnd]).toEqual([5, 5]);
    expect(killRing.text()).toBe('ring');

    deliver({ key: 'd', shift: false });
    expect(field.value).toBe('helloworld');
  });

  it('extends the selection with shift true and moves with shift false', () => {
    field.setSelectionRange(5, 5);

    deliver({ key: 'b', shift: true });
    expect([field.selectionStart, field.selectionEnd]).toEqual([4, 5]);

    deliver({ key: 'b', shift: false });
    expect([field.selectionStart, field.selectionEnd]).toEqual([4, 4]);
  });

  it('reads a shift that is absent or not the boolean true as not held', () => {
    for (const shift of [undefined, 'true', 1, null] as const) {
      field.setSelectionRange(5, 5);
      deliver(shift === undefined ? { key: 'f' } : { key: 'f', shift });
      expect([field.selectionStart, field.selectionEnd]).toEqual([6, 6]);
    }
  });

  it('ignores Shift key events the page sees itself', () => {
    // Shift comes from the IDE's key event only; a Shift keydown the page sees
    // must not turn a plain move into an extension.
    field.setSelectionRange(5, 5);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true }));
    deliver({ key: 'f', shift: false });

    expect([field.selectionStart, field.selectionEnd]).toEqual([6, 6]);
  });

  it('ignores a key that is not one of the fourteen', () => {
    field.setSelectionRange(5, 5);

    deliver({ key: 'c' });
    deliver({ key: 'g' });
    deliver({ key: 'B' });
    deliver({ key: 2 });
    deliver({});

    expect([field.selectionStart, field.selectionEnd]).toEqual([5, 5]);
    expect(field.value).toBe('hello world');
  });

  it('does nothing when focus is not on an editable', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    field.setSelectionRange(5, 5);
    button.focus();

    for (const key of ['a', 'd', 'h', 'k', 'o', 't', 'y']) deliver({ key });

    expect(field.selectionStart).toBe(5);
    expect(field.value).toBe('hello world');
    button.remove();
  });

  it('finds an input focused inside a shadow root', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const inner = document.createElement('input');
    inner.value = 'shadow text';
    host.attachShadow({ mode: 'open' }).appendChild(inner);
    inner.focus();
    inner.setSelectionRange(3, 3);

    deliver({ key: 'e' });

    expect(inner.selectionStart).toBe('shadow text'.length);
    host.remove();
  });

  describe('browser keydown under a non-Latin layout', () => {
    /** The Hangul jamo the Korean 2-set layout puts in `key` for Ctrl+B (measured in Chrome). */
    const JAMO_B = String.fromCharCode(0x3160);

    /** A Ctrl+letter keydown as Chrome on macOS delivers it to the focused element. */
    function press(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
      const event = new KeyboardEvent('keydown', {
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
        composed: true,
        ...init,
      });
      target.dispatchEvent(event);
      return event;
    }

    it('moves the caret and prevents the default for a Korean-layout Ctrl+B', () => {
      field.setSelectionRange(5, 5);

      const event = press(field, { key: JAMO_B, code: 'KeyB' });

      expect(event.defaultPrevented).toBe(true);
      expect([field.selectionStart, field.selectionEnd]).toEqual([4, 4]);
    });

    it('leaves an ASCII Ctrl+B to the browser, which already performs it', () => {
      field.setSelectionRange(5, 5);

      const event = press(field, { key: 'b', code: 'KeyB' });

      expect(event.defaultPrevented).toBe(false);
      expect([field.selectionStart, field.selectionEnd]).toEqual([5, 5]);
    });

    it('extends the selection when Shift is held', () => {
      field.setSelectionRange(5, 5);

      const event = press(field, { key: JAMO_B, code: 'KeyB', shiftKey: true });

      expect(event.defaultPrevented).toBe(true);
      expect([field.selectionStart, field.selectionEnd]).toEqual([4, 5]);
    });

    it('leaves the keydown alone when focus is not on an editable', () => {
      const button = document.createElement('button');
      document.body.appendChild(button);
      button.focus();
      field.setSelectionRange(5, 5);

      const event = press(button, { key: JAMO_B, code: 'KeyB' });

      expect(event.defaultPrevented).toBe(false);
      expect(field.selectionStart).toBe(5);
      button.remove();
    });

    it('stops listening once the hook unmounts', () => {
      field.setSelectionRange(5, 5);
      unmount();

      const event = press(field, { key: JAMO_B, code: 'KeyB' });

      expect(event.defaultPrevented).toBe(false);
      expect(field.selectionStart).toBe(5);
      unmount = () => {};
    });
  });

  describe('on a platform other than macOS', () => {
    beforeEach(() => {
      unmount();
      handlers.clear();
      mockBridge.subscribe.mockClear();
      platform.mac = false;
      unmount = renderHook(() => useEmacsTextKeys()).unmount;
    });

    afterEach(() => {
      platform.mac = true;
    });

    it('registers nothing', () => {
      const addListener = vi.spyOn(window, 'addEventListener');
      unmount();
      unmount = renderHook(() => useEmacsTextKeys()).unmount;

      expect(mockBridge.subscribe).not.toHaveBeenCalled();
      expect(addListener.mock.calls.filter(([type]) => type === 'keydown')).toEqual([]);
      addListener.mockRestore();

      field.setSelectionRange(5, 5);
      const event = new KeyboardEvent('keydown', {
        key: String.fromCharCode(0x3160), code: 'KeyB', ctrlKey: true, bubbles: true, cancelable: true,
      });
      field.dispatchEvent(event);
      deliver({ key: 'b' });

      expect(event.defaultPrevented).toBe(false);
      expect(field.selectionStart).toBe(5);
    });
  });
});
