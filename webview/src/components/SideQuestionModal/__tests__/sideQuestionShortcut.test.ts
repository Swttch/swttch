import { describe, it, expect, vi, afterEach } from 'vitest';

const macState = vi.hoisted(() => ({ mac: true }));
vi.mock('@/config/environment', async (orig) => ({
  ...(await orig<typeof import('@/config/environment')>()),
  isMac: () => macState.mac,
}));

import { isSideQuestionShortcut } from '../sideQuestionShortcut';

function key(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', init);
}

describe('isSideQuestionShortcut', () => {
  afterEach(() => {
    macState.mac = true;
  });

  it('matches Cmd+Shift+B on macOS', () => {
    expect(isSideQuestionShortcut(key({ metaKey: true, shiftKey: true, key: 'B', code: 'KeyB' }))).toBe(true);
  });

  it('matches Ctrl+Shift+B elsewhere', () => {
    macState.mac = false;
    expect(isSideQuestionShortcut(key({ ctrlKey: true, shiftKey: true, key: 'B', code: 'KeyB' }))).toBe(true);
  });

  it('matches the physical key when a layout or IME types something else', () => {
    expect(isSideQuestionShortcut(key({ metaKey: true, shiftKey: true, key: 'ㅠ', code: 'KeyB' }))).toBe(true);
  });

  it('needs Shift, so Cmd+B is left alone', () => {
    expect(isSideQuestionShortcut(key({ metaKey: true, key: 'b', code: 'KeyB' }))).toBe(false);
  });

  it('ignores the key repeat so holding it does not flicker the window', () => {
    expect(isSideQuestionShortcut(key({ metaKey: true, shiftKey: true, key: 'B', code: 'KeyB', repeat: true }))).toBe(false);
  });
});
