import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGlobalShortcut } from '../useGlobalShortcut';
import { HOLD_THRESHOLD_MS } from '../pressToTalk';

/**
 * Acceptance for: the voice shortcut works wherever the user is, and behaves
 * like the microphone button — tap to keep recording, hold to record only while
 * held.
 */

function keyEvent(type: 'keydown' | 'keyup', key: string, init: KeyboardEventInit = {}) {
  return new KeyboardEvent(type, { key, bubbles: true, cancelable: true, ...init });
}

describe('useGlobalShortcut', () => {
  let onStart: ReturnType<typeof vi.fn<() => void>>;
  let onStop: ReturnType<typeof vi.fn<() => void>>;
  let recording: boolean;

  /** Mount the hook with the shared handlers. */
  function mount(shortcut: string | null = 'Alt+D') {
    return renderHook(
      ({ key }: { key: string | null }) =>
        useGlobalShortcut(key, {
          isRecording: () => recording,
          // Mirror what dictation does, so the hook sees a real state change.
          onStart: () => {
            recording = true;
            onStart();
          },
          onStop: () => {
            recording = false;
            onStop();
          },
        }),
      { initialProps: { key: shortcut } },
    );
  }

  /** Press the shortcut down at some element (defaults to the page itself). */
  function down(target: EventTarget = document.body) {
    act(() => {
      target.dispatchEvent(keyEvent('keydown', 'd', { altKey: true }));
    });
  }

  /** Release it, after `heldFor` milliseconds of holding. */
  function up(heldFor: number, target: EventTarget = document.body) {
    vi.advanceTimersByTime(heldFor);
    act(() => {
      target.dispatchEvent(keyEvent('keyup', 'd', { altKey: true }));
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    onStart = vi.fn<() => void>();
    onStop = vi.fn<() => void>();
    recording = false;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  describe('tapping', () => {
    it('starts recording and leaves it on after the key is released', () => {
      mount();
      down();
      up(HOLD_THRESHOLD_MS - 100);

      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onStop).not.toHaveBeenCalled();
    });

    it('stops on the next tap', () => {
      mount();
      down();
      up(HOLD_THRESHOLD_MS - 100);
      onStart.mockClear();

      down();
      up(HOLD_THRESHOLD_MS - 100);
      expect(onStop).toHaveBeenCalledTimes(1);
      expect(onStart).not.toHaveBeenCalled();
    });
  });

  describe('holding', () => {
    it('records only while the key is held', () => {
      // The bug this fixes: releasing did nothing, so a hold behaved like a tap
      // and needed a second press to stop.
      mount();
      down();
      expect(onStart).toHaveBeenCalledTimes(1);

      up(HOLD_THRESHOLD_MS + 100);
      expect(onStop).toHaveBeenCalledTimes(1);
    });

    it('does not flicker while the key repeats', () => {
      mount();
      down();
      act(() => {
        for (let i = 0; i < 10; i++) {
          document.body.dispatchEvent(keyEvent('keydown', 'd', { altKey: true, repeat: true }));
        }
      });

      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onStop).not.toHaveBeenCalled();
    });

    it('stops when the modifier is released first', () => {
      // Letting go of Alt before D is an ordinary way to end a hold; matching
      // the release on the full combination would miss it and strand recording.
      mount();
      down();
      vi.advanceTimersByTime(HOLD_THRESHOLD_MS + 100);
      act(() => {
        document.body.dispatchEvent(keyEvent('keyup', 'Alt', { altKey: false }));
      });

      expect(onStop).toHaveBeenCalledTimes(1);
    });

    it('stops when the window loses focus mid-hold', () => {
      // A hold interrupted this way never delivers its keyup, which would leave
      // the microphone open.
      mount();
      down();
      vi.advanceTimersByTime(HOLD_THRESHOLD_MS + 100);
      act(() => {
        window.dispatchEvent(new Event('blur'));
      });

      expect(onStop).toHaveBeenCalledTimes(1);
    });
  });

  describe('where it works', () => {
    it('fires while a text field has focus', () => {
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      mount();
      down(input);
      expect(onStart).toHaveBeenCalledTimes(1);
    });

    it('fires from a button elsewhere in the app', () => {
      const button = document.createElement('button');
      document.body.appendChild(button);
      button.focus();

      mount();
      down(button);
      expect(onStart).toHaveBeenCalledTimes(1);
    });
  });

  describe('leaving everything else alone', () => {
    it('ignores other keys and does not claim them', () => {
      mount();
      const plain = keyEvent('keydown', 'd');
      act(() => {
        document.body.dispatchEvent(plain);
      });

      expect(onStart).not.toHaveBeenCalled();
      expect(plain.defaultPrevented).toBe(false);
    });

    it('claims the shortcut so the browser does not act on it too', () => {
      mount();
      const event = keyEvent('keydown', 'd', { altKey: true });
      act(() => {
        document.body.dispatchEvent(event);
      });

      expect(event.defaultPrevented).toBe(true);
    });

    it('does nothing when no shortcut is bound', () => {
      mount(null);
      down();
      expect(onStart).not.toHaveBeenCalled();
    });
  });

  describe('lifecycle', () => {
    it('follows a rebind without a remount', () => {
      const { rerender } = mount('Alt+D');
      rerender({ key: 'Ctrl+M' });

      down();
      expect(onStart).not.toHaveBeenCalled();

      act(() => {
        document.body.dispatchEvent(keyEvent('keydown', 'm', { ctrlKey: true }));
      });
      expect(onStart).toHaveBeenCalledTimes(1);
    });

    it('stops listening once unmounted', () => {
      const { unmount } = mount();
      unmount();
      down();
      expect(onStart).not.toHaveBeenCalled();
    });
  });

  /**
   * Issue #315: an input method rewrites `key` while `code` keeps naming the
   * physical key. Alt+D pressed in Korean arrives as key='ㅇ' code='KeyD'.
   */
  describe('with an input method active', () => {
    /** Press/release Alt+D the way a Korean IME reports it. */
    const imeDown = () =>
      act(() => {
        document.body.dispatchEvent(
          keyEvent('keydown', 'ㅇ', { altKey: true, code: 'KeyD' }),
        );
      });
    const imeUp = (heldFor: number) => {
      vi.advanceTimersByTime(heldFor);
      act(() => {
        document.body.dispatchEvent(keyEvent('keyup', 'ㅇ', { altKey: true, code: 'KeyD' }));
      });
    };

    it('starts recording on the bound key', () => {
      mount('Alt+D');
      imeDown();
      expect(onStart).toHaveBeenCalledTimes(1);
    });

    it('stops when the held key is released', () => {
      // The release is matched separately from the press, so it needs the same
      // fix — otherwise a hold starts recording that nothing ever stops.
      mount('Alt+D');
      imeDown();
      imeUp(HOLD_THRESHOLD_MS + 50);
      expect(onStop).toHaveBeenCalledTimes(1);
    });
  });
});
