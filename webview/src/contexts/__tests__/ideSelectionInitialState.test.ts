import { describe, it, expect } from 'vitest';
import { resolveInitialInclude } from '../ideSelectionInitialState';

/**
 * The setting decides the chip's state at the START of a session; the chip's
 * own click is session-local and never comes back here. These tests pin the two
 * rules that decision follows (#237).
 */
describe('resolveInitialInclude', () => {
  describe('before the setting has arrived', () => {
    // Safety is asymmetric here. Starting enabled while the value is still
    // unknown can leak a file the user meant to exclude, and that cannot be
    // taken back. Starting disabled costs at most one missed attachment.
    it('starts INACTIVE even though the default is enabled', () => {
      expect(resolveInitialInclude({ isLoading: true, value: undefined })).toBe(false);
    });

    it('stays INACTIVE even when a value happens to be present already', () => {
      expect(resolveInitialInclude({ isLoading: true, value: true })).toBe(false);
    });
  });

  describe('once the setting has arrived', () => {
    it('is ACTIVE when the value is explicitly true', () => {
      expect(resolveInitialInclude({ isLoading: false, value: true })).toBe(true);
    });

    it('is INACTIVE when the value is explicitly false', () => {
      expect(resolveInitialInclude({ isLoading: false, value: false })).toBe(false);
    });

    // "Anything that is not an explicit false counts as enabled" — a missing or
    // unreadable value must leave the feature on, never silently off.
    it.each([
      ['undefined', undefined],
      ['null', null],
      ['a non-boolean string', 'nope'],
      ['zero', 0],
      ['an empty string', ''],
    ])('is ACTIVE when the value is %s', (_label, value) => {
      expect(resolveInitialInclude({ isLoading: false, value })).toBe(true);
    });
  });
});
