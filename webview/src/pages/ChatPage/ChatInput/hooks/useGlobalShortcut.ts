import { useEffect, useRef } from 'react';
import { shouldToggleOnShortcut } from '@/utils/shortcut';

/**
 * Fire a rebindable shortcut from anywhere in the app.
 *
 * Voice input started on the composer's own key handler, which meant it only
 * worked while the composer had focus — press it after clicking anywhere else
 * and nothing happened. A shortcut whose whole point is to start talking
 * without reaching for the mouse should not require reaching for the input
 * first.
 *
 * Bound on the window in the capture phase so it wins over whatever has focus,
 * and only for the exact combination: every other key is left alone, including
 * inside text fields.
 *
 * @param shortcut Stored form, e.g. 'Alt+D'.
 * @param onTrigger Runs once per press; key repeats are ignored.
 */
export function useGlobalShortcut(shortcut: string | null | undefined, onTrigger: () => void) {
  // Kept in a ref so a caller passing an inline function does not detach and
  // re-attach the listener on every render.
  const onTriggerRef = useRef(onTrigger);
  onTriggerRef.current = onTrigger;

  useEffect(() => {
    if (!shortcut) return;

    const handler = (e: KeyboardEvent) => {
      if (!shouldToggleOnShortcut(e, shortcut)) {
        return;
      }
      // Claimed only once we know it is ours, so the default action of every
      // other key survives.
      e.preventDefault();
      e.stopPropagation();
      onTriggerRef.current();
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [shortcut]);
}
