import { describe, it, expect, vi, afterEach } from 'vitest';
import { hasCmdOrCtrl, isZoomInKey, isZoomOutKey, isZoomResetKey, isModifiedWheel } from '../useZoomControls';

vi.mock('@/config/environment', () => ({
  isMac: () => mockIsMac,
}));

let mockIsMac = false;

function keyEvent(init: Partial<KeyboardEvent>): KeyboardEvent {
  return { key: '', metaKey: false, ctrlKey: false, ...init } as KeyboardEvent;
}

function wheelEvent(init: Partial<WheelEvent>): WheelEvent {
  return { deltaY: 0, metaKey: false, ctrlKey: false, ...init } as WheelEvent;
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
  it('accepts every spelling of plus', () => {
    for (const key of ['+', '=', 'Add']) {
      expect(isZoomInKey(keyEvent({ key, ctrlKey: true }))).toBe(true);
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
  it('accepts every spelling of minus', () => {
    for (const key of ['-', '_', 'Subtract']) {
      expect(isZoomOutKey(keyEvent({ key, ctrlKey: true }))).toBe(true);
    }
  });

  it('requires the modifier', () => {
    expect(isZoomOutKey(keyEvent({ key: '-' }))).toBe(false);
  });
});

describe('isZoomResetKey', () => {
  it('accepts CmdOrCtrl+0', () => {
    expect(isZoomResetKey(keyEvent({ key: '0', ctrlKey: true }))).toBe(true);
  });

  it('requires the modifier', () => {
    expect(isZoomResetKey(keyEvent({ key: '0' }))).toBe(false);
  });
});

describe('isModifiedWheel', () => {
  it('accepts an integer-delta Ctrl+wheel off macOS (a real wheel notch)', () => {
    mockIsMac = false;
    expect(isModifiedWheel(wheelEvent({ ctrlKey: true, deltaY: -120 }))).toBe(true);
  });

  it('accepts an integer-delta Cmd+wheel on macOS', () => {
    mockIsMac = true;
    expect(isModifiedWheel(wheelEvent({ metaKey: true, deltaY: -3 }))).toBe(true);
  });

  // Browsers synthesise pinch as a wheel event with ctrlKey forced true. On
  // macOS our modifier is Command, so a ctrl-only wheel there must be a pinch
  // and fall through to the browser's native handling — never our zoom.
  it('rejects a ctrl-only wheel on macOS (synthesised pinch)', () => {
    mockIsMac = true;
    expect(isModifiedWheel(wheelEvent({ ctrlKey: true, deltaY: -5.3 }))).toBe(false);
  });

  // Pinch/precise-trackpad streams report fractional deltas; a notched wheel
  // reports whole numbers.
  it('rejects a fractional-delta wheel even with the right modifier', () => {
    mockIsMac = false;
    expect(isModifiedWheel(wheelEvent({ ctrlKey: true, deltaY: -5.3 }))).toBe(false);
  });

  it('rejects a wheel without the modifier', () => {
    mockIsMac = false;
    expect(isModifiedWheel(wheelEvent({ deltaY: -120 }))).toBe(false);
  });
});
