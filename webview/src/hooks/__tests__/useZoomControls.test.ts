import { describe, it, expect, vi, afterEach } from 'vitest';
import { hasCmdOrCtrl, isZoomInKey, isZoomOutKey, isZoomResetKey } from '../useZoomControls';

vi.mock('@/config/environment', () => ({
  isMac: () => mockIsMac,
}));

let mockIsMac = false;

function keyEvent(init: Partial<KeyboardEvent>): KeyboardEvent {
  return { key: '', metaKey: false, ctrlKey: false, ...init } as KeyboardEvent;
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
