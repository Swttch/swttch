import { useEffect } from 'react';
import { getBridge } from '@/api/bridge/Bridge';
import { isMac } from '@/config/environment';
import { MessageType, parseEmacsTextKey } from '@/shared';
import { typingTargetOf } from '@/utils/typingTarget';
import { focusedTypingTarget } from '@/utils/focusedTypingTarget';
import { applyEmacsTextKey } from '@/utils/emacsTextEdit';
import { emacsTextKeyFromKeydown } from '@/utils/emacsTextKey';

/**
 * The macOS Emacs-style text keys (Ctrl+A/B/D/E/F/H/K/L/N/O/P/T/V/Y) for every
 * text field in the app (issue #506).
 *
 * There are two entry points, one per environment where the keys would
 * otherwise do nothing:
 *
 * The IDE, over the bridge (EMACS_TEXT_KEY_PRESSED). Under JCEF's off-screen rendering, the default since IDE 2025.1, these keys do
 * nothing on their own: macOS delivers them as NSResponder selectors
 * (`moveBackward:`, `deleteForward:`, `yank:` and friends) that OSR never
 * receives. Unlike Cmd+Arrow they cannot be restored from a DOM keydown either,
 * because OSR reports every Ctrl+letter to the page as Ctrl+A (`key: 'a'`,
 * `code: 'KeyA'`). The IDE still sees the real key event, so it consumes the
 * keystroke before the page ever receives it and names the letter over the
 * bridge; this hook performs the binding (see applyEmacsTextKey). Because the
 * IDE consumes the keystroke, the page never also sees a keydown for it there.
 *
 * A browser keydown, under a non-Latin input source. Chrome on macOS performs
 * these keys natively while the layout is Latin, but under a non-Latin one
 * (Korean 2-set, for instance) the keydown carries the layout's character in
 * `key` (the Hangul jamo U+3160 for Ctrl+B), the physical key in `code` (`'KeyB'`), and Chrome
 * then does nothing. A capture-phase window listener reads the letter from
 * `code`, prevents the default and performs the binding. A keydown whose `key`
 * is an ASCII letter is left alone, because the browser already performs that
 * one and acting as well would apply every edit twice (see
 * emacsTextKeyFromKeydown).
 *
 * The bridge payload also says whether Shift was held, read by the IDE from the
 * same key event (`shift`, true only as the boolean true); the browser path
 * reads `shiftKey` from its keydown. Shift extends the
 * selection for the moves and makes the edit keys do nothing, as macOS binds
 * nothing to them with Shift.
 *
 * The key lands in the focused editable, looked up through shadow roots so an
 * editable inside one (the review diff's proposed side) is found. With no
 * editable focused the key is ignored and, on the browser path, its default
 * is left untouched.
 */
export function useEmacsTextKeys(): void {
  useEffect(() => {
    // These are macOS bindings: the IDE only sends them on macOS, and on other
    // platforms Ctrl+letter means something else entirely.
    if (!isMac()) return;

    const unsubscribe = getBridge().subscribe(MessageType.EMACS_TEXT_KEY_PRESSED, (message) => {
      const raw = message.payload?.key;
      const key = typeof raw === 'string' ? parseEmacsTextKey(raw) : null;
      if (!key) return;

      const target = focusedTypingTarget();
      if (!target) return;

      applyEmacsTextKey(target, key, message.payload?.shift === true);
    });

    const onKeyDown = (event: KeyboardEvent) => {
      const press = emacsTextKeyFromKeydown(event);
      if (!press) return;

      const target = typingTargetOf(event);
      if (!target) return;

      event.preventDefault();
      applyEmacsTextKey(target, press.key, press.shift);
    };
    window.addEventListener('keydown', onKeyDown, true);

    return () => {
      unsubscribe();
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);
}

