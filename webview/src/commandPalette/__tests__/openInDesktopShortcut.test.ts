import { describe, it, expect, vi } from 'vitest';

const macState = vi.hoisted(() => ({ mac: true }));
vi.mock('@/config/environment', async (orig) => ({
  ...(await orig<typeof import('@/config/environment')>()),
  isMac: () => macState.mac,
}));

import { isOpenInDesktopShortcut } from '../openInDesktopShortcut';
import { isOpenDevToolsShortcut } from '../devToolsShortcut';

const key = (patch: Partial<KeyboardEvent>): KeyboardEvent =>
  ({ altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false, code: '', key: '', ...patch }) as KeyboardEvent;

describe('isOpenInDesktopShortcut', () => {
  it('is Cmd+Option+Shift+O on macOS, matched on the physical key (Option+O types a character there)', () => {
    macState.mac = true;
    expect(isOpenInDesktopShortcut(key({ metaKey: true, altKey: true, shiftKey: true, code: 'KeyO', key: 'Ø' }))).toBe(true);
    expect(isOpenInDesktopShortcut(key({ ctrlKey: true, altKey: true, shiftKey: true, code: 'KeyO' }))).toBe(false);
  });

  it('is Ctrl+Alt+Shift+O elsewhere', () => {
    macState.mac = false;
    expect(isOpenInDesktopShortcut(key({ ctrlKey: true, altKey: true, shiftKey: true, code: 'KeyO' }))).toBe(true);
    expect(isOpenInDesktopShortcut(key({ metaKey: true, altKey: true, shiftKey: true, code: 'KeyO' }))).toBe(false);
  });

  it('is not the key without Shift, without Option, held down, or another letter', () => {
    macState.mac = true;
    expect(isOpenInDesktopShortcut(key({ metaKey: true, altKey: true, code: 'KeyO', key: 'ø' }))).toBe(false);
    expect(isOpenInDesktopShortcut(key({ metaKey: true, shiftKey: true, code: 'KeyO' }))).toBe(false);
    expect(isOpenInDesktopShortcut(key({ metaKey: true, altKey: true, shiftKey: true, repeat: true, code: 'KeyO' }))).toBe(false);
    expect(isOpenInDesktopShortcut(key({ metaKey: true, altKey: true, shiftKey: true, code: 'KeyA' }))).toBe(false);
    expect(isOpenInDesktopShortcut(key({ metaKey: true, altKey: true, shiftKey: true, code: 'KeyJ' }))).toBe(false);
  });
});

describe('isOpenDevToolsShortcut', () => {
  it('is Cmd+Option+I on macOS, matched on the physical key', () => {
    macState.mac = true;
    expect(isOpenDevToolsShortcut(key({ metaKey: true, altKey: true, code: 'KeyI', key: 'ˆ' }))).toBe(true);
  });

  it('is not Ctrl+Alt+I, which cycles the transcript view, nor anything off a Mac', () => {
    macState.mac = true;
    expect(isOpenDevToolsShortcut(key({ ctrlKey: true, altKey: true, code: 'KeyI' }))).toBe(false);
    macState.mac = false;
    expect(isOpenDevToolsShortcut(key({ metaKey: true, altKey: true, code: 'KeyI' }))).toBe(false);
    expect(isOpenDevToolsShortcut(key({ ctrlKey: true, altKey: true, code: 'KeyI' }))).toBe(false);
  });

  it('is not the key with Shift or Control added, held down, or another letter', () => {
    macState.mac = true;
    expect(isOpenDevToolsShortcut(key({ metaKey: true, altKey: true, shiftKey: true, code: 'KeyI' }))).toBe(false);
    expect(isOpenDevToolsShortcut(key({ metaKey: true, altKey: true, ctrlKey: true, code: 'KeyI' }))).toBe(false);
    expect(isOpenDevToolsShortcut(key({ metaKey: true, code: 'KeyI' }))).toBe(false);
    expect(isOpenDevToolsShortcut(key({ metaKey: true, altKey: true, repeat: true, code: 'KeyI' }))).toBe(false);
    expect(isOpenDevToolsShortcut(key({ metaKey: true, altKey: true, code: 'KeyJ' }))).toBe(false);
  });
});
