import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useFableNotice,
  FABLE_NOTICE_DISMISSED_KEY,
  FABLE_UPDATE_NOTICE_DISMISSED_KEY,
} from '../useFableNotice';

// CLI versions on either side of the Fable minimum (2.1.170), used to drive the
// 'available' vs 'update-required' variant.
const SUPPORTED_CLI = '2.1.170';
const OLD_CLI = '2.1.169';

describe('useFableNotice', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is visible during the promo window when not dismissed', () => {
    vi.setSystemTime(new Date('2026-07-03T00:00:00Z'));
    const { result } = renderHook(() => useFableNotice(SUPPORTED_CLI));
    expect(result.current.visible).toBe(true);
  });

  it('is hidden after the promo window ends', () => {
    // Past FABLE_PROMO_END (2026-07-19, extended 07-07 → 07-12 → 07-19).
    vi.setSystemTime(new Date('2026-07-20T00:00:00Z'));
    const { result } = renderHook(() => useFableNotice(SUPPORTED_CLI));
    expect(result.current.visible).toBe(false);
  });

  it('hides and persists the dismissal once dismissed', () => {
    vi.setSystemTime(new Date('2026-07-03T00:00:00Z'));
    const { result } = renderHook(() => useFableNotice(SUPPORTED_CLI));
    act(() => result.current.dismiss());
    expect(result.current.visible).toBe(false);
    expect(localStorage.getItem(FABLE_NOTICE_DISMISSED_KEY)).toBe('1');
  });

  it('stays hidden on remount when previously dismissed', () => {
    vi.setSystemTime(new Date('2026-07-03T00:00:00Z'));
    localStorage.setItem(FABLE_NOTICE_DISMISSED_KEY, '1');
    const { result } = renderHook(() => useFableNotice(SUPPORTED_CLI));
    expect(result.current.visible).toBe(false);
  });

  describe('variant', () => {
    beforeEach(() => {
      vi.setSystemTime(new Date('2026-07-03T00:00:00Z'));
    });

    it("is 'available' when the CLI is new enough to select Fable", () => {
      const { result } = renderHook(() => useFableNotice(SUPPORTED_CLI));
      expect(result.current.variant).toBe('available');
    });

    it("is 'update-required' when the CLI is too old", () => {
      const { result } = renderHook(() => useFableNotice(OLD_CLI));
      expect(result.current.variant).toBe('update-required');
    });

    it("is 'update-required' when the CLI version is unknown (null)", () => {
      const { result } = renderHook(() => useFableNotice(null));
      expect(result.current.variant).toBe('update-required');
    });
  });

  describe('per-variant dismissal', () => {
    beforeEach(() => {
      vi.setSystemTime(new Date('2026-07-03T00:00:00Z'));
    });

    it('dismissing the update nudge writes only its own key', () => {
      const { result } = renderHook(() => useFableNotice(OLD_CLI));
      act(() => result.current.dismiss());
      expect(localStorage.getItem(FABLE_UPDATE_NOTICE_DISMISSED_KEY)).toBe('1');
      expect(localStorage.getItem(FABLE_NOTICE_DISMISSED_KEY)).toBeNull();
    });

    it('shows the available card after a CLI update even if the update nudge was dismissed', () => {
      // User on an old CLI dismisses the update nudge...
      const oldCli = renderHook(() => useFableNotice(OLD_CLI));
      act(() => oldCli.result.current.dismiss());
      expect(oldCli.result.current.visible).toBe(false);

      // ...then updates their CLI: the 'available' card has never been dismissed,
      // so it surfaces (independent keys).
      const newCli = renderHook(() => useFableNotice(SUPPORTED_CLI));
      expect(newCli.result.current.variant).toBe('available');
      expect(newCli.result.current.visible).toBe(true);
    });

    it('keeps the update nudge dismissed independently of the available card', () => {
      // Dismiss the available card first.
      localStorage.setItem(FABLE_NOTICE_DISMISSED_KEY, '1');
      const oldCli = renderHook(() => useFableNotice(OLD_CLI));
      // The update nudge is a different key, so it is still visible.
      expect(oldCli.result.current.variant).toBe('update-required');
      expect(oldCli.result.current.visible).toBe(true);
    });
  });

  describe('unknown CLI version (still loading)', () => {
    beforeEach(() => {
      vi.setSystemTime(new Date('2026-07-03T00:00:00Z'));
    });

    it('stays hidden until the CLI version resolves, to prevent the flash', () => {
      expect(renderHook(() => useFableNotice(null)).result.current.visible).toBe(false);
      expect(renderHook(() => useFableNotice(undefined)).result.current.visible).toBe(false);
    });

    it('does not flash the update nudge when the available card was already dismissed', () => {
      // Exact repro of the reported flash: the user dismissed the 'available' card,
      // but on reload cliVersion is briefly null, so the variant would resolve to
      // 'update-required' (a different, undismissed key) and show. Guarding on the
      // resolved version keeps it hidden until the real variant is known.
      localStorage.setItem(FABLE_NOTICE_DISMISSED_KEY, '1');
      expect(renderHook(() => useFableNotice(null)).result.current.visible).toBe(false);
    });
  });
});
