import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { hasCmdOrCtrl, isZoomInKey, isZoomOutKey, isZoomResetKey, useZoomControls } from '../useZoomControls';

vi.mock('@/config/environment', () => ({
  isMac: () => mockIsMac,
}));

// useZoomControls reads the zoom actions from ZoomContext; the registration
// tests below only care about which listeners get attached, so the actions are
// stubbed rather than wrapping the hook in a real provider.
vi.mock('@/contexts/ZoomContext', () => ({
  useZoom: () => ({
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    reset: vi.fn(),
    dismissIndicator: vi.fn(),
  }),
}));

let mockIsMac = false;

function keyEvent(init: Partial<KeyboardEvent>): KeyboardEvent {
  return { key: '', code: '', metaKey: false, ctrlKey: false, shiftKey: false, ...init } as KeyboardEvent;
}

afterEach(() => {
  mockIsMac = false;
});

describe('hasCmdOrCtrl', () => {
  it('accepts Command and rejects Ctrl on macOS', () => {
    mockIsMac = true;
    expect(hasCmdOrCtrl(keyEvent({ metaKey: true }))).toBe(true);
    expect(hasCmdOrCtrl(keyEvent({ ctrlKey: true }))).toBe(false);
  });

  // On Windows/Linux `metaKey` is the Super/logo key, which belongs to the
  // desktop environment — treating it as our modifier would hijack OS shortcuts.
  it('accepts Ctrl and rejects the Super key off macOS', () => {
    mockIsMac = false;
    expect(hasCmdOrCtrl(keyEvent({ ctrlKey: true }))).toBe(true);
    expect(hasCmdOrCtrl(keyEvent({ metaKey: true }))).toBe(false);
  });

  it('rejects an unmodified event', () => {
    expect(hasCmdOrCtrl(keyEvent({ key: '+' }))).toBe(false);
  });
});

describe('isZoomInKey', () => {
  it('accepts both spellings of the number-row plus', () => {
    for (const key of ['+', '=']) {
      expect(isZoomInKey(keyEvent({ key, ctrlKey: true }))).toBe(true);
    }
  });

  // Matched physically, so it holds under either NumLock state.
  it('accepts numpad plus by code whatever NumLock reports', () => {
    for (const key of ['+', 'Add']) {
      expect(isZoomInKey(keyEvent({ key, code: 'NumpadAdd', ctrlKey: true }))).toBe(true);
    }
  });

  it('requires the modifier', () => {
    expect(isZoomInKey(keyEvent({ key: '+' }))).toBe(false);
  });

  it('rejects the minus key', () => {
    expect(isZoomInKey(keyEvent({ key: '-', ctrlKey: true }))).toBe(false);
  });
});

describe('isZoomOutKey', () => {
  it('accepts both spellings of the number-row minus', () => {
    for (const key of ['-', '_']) {
      expect(isZoomOutKey(keyEvent({ key, ctrlKey: true }))).toBe(true);
    }
  });

  it('accepts numpad minus by code whatever NumLock reports', () => {
    for (const key of ['-', 'Subtract']) {
      expect(isZoomOutKey(keyEvent({ key, code: 'NumpadSubtract', ctrlKey: true }))).toBe(true);
    }
  });

  it('requires the modifier', () => {
    expect(isZoomOutKey(keyEvent({ key: '-' }))).toBe(false);
  });
});

describe('isZoomResetKey', () => {
  it('accepts CmdOrCtrl+0 on the number row', () => {
    expect(isZoomResetKey(keyEvent({ key: '0', code: 'Digit0', ctrlKey: true }))).toBe(true);
  });

  it('requires the modifier', () => {
    expect(isZoomResetKey(keyEvent({ key: '0' }))).toBe(false);
  });

  // Chromium binds zoom-reset to VKEY_0 and VKEY_NUMPAD0. NumLock flips numpad
  // 0's `key` between '0' and 'Insert', so only `code` catches it both ways.
  it('accepts numpad 0 by code whatever NumLock reports', () => {
    for (const key of ['0', 'Insert']) {
      expect(isZoomResetKey(keyEvent({ key, code: 'Numpad0', ctrlKey: true }))).toBe(true);
    }
  });

  // Issue #268: Ctrl+Insert is Chromium's built-in copy. Claiming it for zoom
  // reset made the handler preventDefault() and silently killed the copy.
  it('rejects the standalone Insert key so Ctrl+Insert stays a copy', () => {
    expect(isZoomResetKey(keyEvent({ key: 'Insert', code: 'Insert', ctrlKey: true }))).toBe(false);
  });

  // Shift+Insert is Chromium's built-in paste. It never carried our modifier,
  // but pin it down so no future edit starts swallowing it either.
  it('rejects Shift+Insert so it stays a paste', () => {
    expect(isZoomResetKey(keyEvent({ key: 'Insert', code: 'Insert', shiftKey: true }))).toBe(false);
  });

  // Guards the guard: proves the two cases above actually discriminate, by
  // showing the pre-fix predicate — which keyed off `e.key` — fails them. Kept
  // inline so the check lives in the test file rather than in a throwaway
  // experiment against the working tree.
  it('catches the regression the pre-fix predicate had', () => {
    const preFix = (e: KeyboardEvent) => hasCmdOrCtrl(e) && (e.key === '0' || e.key === 'Insert');

    const ctrlInsert = keyEvent({ key: 'Insert', code: 'Insert', ctrlKey: true });
    expect(preFix(ctrlInsert)).toBe(true); // the bug: swallowed, killing the copy
    expect(isZoomResetKey(ctrlInsert)).toBe(false); // fixed

    // The numpad 0 it was meant to catch never worked with NumLock on, either:
    // `key` reads '0' there, so the 'Insert' arm was dead weight both ways.
    const numpad0NumLockOff = keyEvent({ key: 'Insert', code: 'Numpad0', ctrlKey: true });
    expect(preFix(numpad0NumLockOff)).toBe(true);
    expect(isZoomResetKey(numpad0NumLockOff)).toBe(true);
  });
});

// Zoom-by-wheel was removed because a non-passive wheel listener puts EVERY
// scroll on the main thread, app-wide, whether or not a modifier is held —
// which is what made trackpad scrolling stutter and keep coasting for seconds
// after the fingers left the trackpad (issue #267).
//
// The damage came from HOW the listener was registered, not from what it did, so
// this asserts the registration itself: no wheel listener at all, and in
// particular none registered non-passively. A future "just read the wheel to
// zoom" would reintroduce the stutter the moment it needs preventDefault().
describe('useZoomControls wheel registration', () => {
  it('registers no wheel listener on window', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useZoomControls());

    const wheelCalls = addSpy.mock.calls.filter(([type]) => type === 'wheel');
    expect(wheelCalls).toEqual([]);
    addSpy.mockRestore();
  });

  it('registers no non-passive listener of any kind', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useZoomControls());

    const nonPassive = addSpy.mock.calls.filter(([, , options]) =>
      typeof options === 'object' && options !== null && (options as AddEventListenerOptions).passive === false,
    );
    expect(nonPassive).toEqual([]);
    addSpy.mockRestore();
  });
});
