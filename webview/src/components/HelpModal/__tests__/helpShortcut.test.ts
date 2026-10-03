import { describe, it, expect, vi, beforeEach } from 'vitest';

let mac = true;
vi.mock('@/config/environment', async () => {
  const actual = await vi.importActual<typeof import('@/config/environment')>('@/config/environment');
  return { ...actual, isMac: () => mac };
});

import { isHelpShortcut } from '../helpShortcut';

const press = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

describe('isHelpShortcut', () => {
  beforeEach(() => {
    mac = true;
  });

  it('matches Cmd+/ on macOS and not Ctrl+/', () => {
    expect(isHelpShortcut(press({ key: '/', metaKey: true }))).toBe(true);
    expect(isHelpShortcut(press({ key: '/', ctrlKey: true }))).toBe(false);
  });

  it('matches Ctrl+/ elsewhere and not the Windows key', () => {
    mac = false;
    expect(isHelpShortcut(press({ key: '/', ctrlKey: true }))).toBe(true);
    expect(isHelpShortcut(press({ key: '/', metaKey: true }))).toBe(false);
  });

  it('matches the physical slash key when the layout types something else', () => {
    expect(isHelpShortcut(press({ key: '-', code: 'Slash', metaKey: true }))).toBe(true);
  });

  it('ignores other keys, extra modifiers and key repeat', () => {
    expect(isHelpShortcut(press({ key: '/' }))).toBe(false);
    expect(isHelpShortcut(press({ key: 'n', metaKey: true }))).toBe(false);
    expect(isHelpShortcut(press({ key: '?', metaKey: true, shiftKey: true }))).toBe(false);
    expect(isHelpShortcut(press({ key: '/', metaKey: true, altKey: true }))).toBe(false);
    expect(isHelpShortcut(press({ key: '/', metaKey: true, repeat: true }))).toBe(false);
  });
});
