import { useCallback, useEffect, useRef, useState } from 'react';

/** Two Ctrl presses within this window count as a double-tap. */
const DOUBLE_TAP_MS = 400;

export type StashState = 'playing' | 'hidden' | 'paused';

/**
 * The "someone is walking past" control: double-tapping Ctrl yanks the game off
 * screen and freezes it.
 *
 * Hidden is a dead end by design — while stashed, nothing but another Ctrl
 * double-tap does anything, so a stray keypress cannot resume the game or leak
 * it back onto the screen. Bringing it back leaves the run paused, and only
 * then can Space resume it.
 *
 *   playing --Ctrl x2--> hidden --Ctrl x2--> paused --Ctrl x2--> hidden
 *                                            paused --Space---> playing
 */
export const useStash = () => {
  const [state, setState] = useState<StashState>('playing');
  const lastCtrl = useRef(0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Control') return;
      // Only a bare Ctrl counts, so IDE chords like Ctrl+S never trigger this.
      if (event.altKey || event.shiftKey || event.metaKey) return;

      const now = event.timeStamp;
      if (now - lastCtrl.current < DOUBLE_TAP_MS) {
        lastCtrl.current = 0;
        setState((current) => (current === 'hidden' ? 'paused' : 'hidden'));
        return;
      }
      lastCtrl.current = now;
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  /** Resumes from a visible pause; a no-op while hidden. */
  const resume = useCallback(
    () => setState((current) => (current === 'paused' ? 'playing' : current)),
    [],
  );

  /** Brings a stashed game back, still paused. */
  const reveal = useCallback(
    () => setState((current) => (current === 'hidden' ? 'paused' : current)),
    [],
  );

  return { state, resume, reveal };
};
