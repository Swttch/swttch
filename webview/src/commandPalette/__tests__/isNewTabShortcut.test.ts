import { describe, it, expect } from 'vitest';
import { isNewTabShortcut } from '../isNewTabShortcut';

const ev = (o: { metaKey?: boolean; ctrlKey?: boolean; key?: string }) => ({
  metaKey: false,
  ctrlKey: false,
  key: 'n',
  ...o,
});

describe('isNewTabShortcut', () => {
  it('mac: Cmd+N matches', () => {
    expect(isNewTabShortcut(ev({ metaKey: true }), true)).toBe(true);
  });
  it('mac: Ctrl+N does not match (native next-line)', () => {
    expect(isNewTabShortcut(ev({ ctrlKey: true }), true)).toBe(false);
  });
  it('mac: Ctrl+Cmd+N matches via Cmd', () => {
    expect(isNewTabShortcut(ev({ ctrlKey: true, metaKey: true }), true)).toBe(true);
  });
  it('non-mac: Ctrl+N matches', () => {
    expect(isNewTabShortcut(ev({ ctrlKey: true }), false)).toBe(true);
  });
  it('non-mac: Meta+N still matches', () => {
    expect(isNewTabShortcut(ev({ metaKey: true }), false)).toBe(true);
  });
  it('plain N and other keys do not match', () => {
    expect(isNewTabShortcut(ev({}), false)).toBe(false);
    expect(isNewTabShortcut(ev({ metaKey: true, key: 'm' }), true)).toBe(false);
  });
});
