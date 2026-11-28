import { describe, it, expect, vi, afterEach } from 'vitest';

const macState = vi.hoisted(() => ({ mac: true }));
vi.mock('@/config/environment', async (orig) => ({
  ...(await orig<typeof import('@/config/environment')>()),
  isMac: () => macState.mac,
}));

import { isDownloadLogShortcut } from '../downloadLogShortcut';

const press = (patch: Partial<KeyboardEvent>): KeyboardEvent =>
  ({ altKey: true, shiftKey: true, ctrlKey: false, metaKey: false, repeat: false, code: 'KeyG', key: '', ...patch }) as KeyboardEvent;

describe('isDownloadLogShortcut', () => {
  afterEach(() => {
    macState.mac = true;
  });

  it('is Cmd+Option+Shift+G on macOS, on the physical key whatever character it types', () => {
    expect(isDownloadLogShortcut(press({ metaKey: true, key: '˝' }))).toBe(true);
    expect(isDownloadLogShortcut(press({ ctrlKey: true }))).toBe(false);
  });

  it('is Ctrl+Alt+Shift+G elsewhere', () => {
    macState.mac = false;
    expect(isDownloadLogShortcut(press({ ctrlKey: true, key: 'G' }))).toBe(true);
    expect(isDownloadLogShortcut(press({ metaKey: true }))).toBe(false);
  });

  it('leaves other combinations and a held key alone', () => {
    expect(isDownloadLogShortcut(press({}))).toBe(false);
    expect(isDownloadLogShortcut(press({ metaKey: true, shiftKey: false }))).toBe(false);
    expect(isDownloadLogShortcut(press({ metaKey: true, altKey: false }))).toBe(false);
    expect(isDownloadLogShortcut(press({ metaKey: true, code: 'KeyL' }))).toBe(false);
    expect(isDownloadLogShortcut(press({ metaKey: true, repeat: true }))).toBe(false);
  });
});
