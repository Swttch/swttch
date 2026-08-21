import { useEffect, useRef } from 'react';
import { matchesShortcut, parseShortcut, keyOfEvent } from '@/utils/shortcut';
import { PressToTalk, PressAction } from './pressToTalk';

interface Handlers {
  /** Whether recording is on right now, read at the moment of the press. */
  isRecording: () => boolean;
  onStart: () => void;
  onStop: () => void;
}

/**
 * Press-to-talk on a rebindable shortcut, from anywhere in the app.
 *
 * Two things the composer's own key handler could not do:
 *
 * It only fired while the composer had focus, which is backwards — the shortcut
 * exists to start talking without reaching for the mouse, and that is usually
 * the moment focus is somewhere else.
 *
 * And it only watched keydown, so a held key started recording and then had no
 * idea when it ended: releasing did nothing, and it took a second press to
 * stop. Watching the release too makes the key behave like the microphone
 * button — tap to keep recording, hold to record only while held.
 *
 * @param shortcut Stored form, e.g. 'Alt+D'.
 */
export function useGlobalShortcut(shortcut: string | null | undefined, handlers: Handlers) {
  // Kept in a ref so inline callbacks do not detach and re-attach the listeners
  // on every render.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const parsed = parseShortcut(shortcut);
    if (!parsed) return;

    const press = new PressToTalk();

    const run = (action: PressAction) => {
      if (action === PressAction.Start) handlersRef.current.onStart();
      else if (action === PressAction.Stop) handlersRef.current.onStop();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!matchesShortcut(e, shortcut)) return;
      // Claimed only once we know it is ours, so every other key keeps its
      // default action. Repeats are claimed too: the browser's own binding must
      // stay suppressed for as long as the key is held.
      e.preventDefault();
      e.stopPropagation();
      run(press.press(handlersRef.current.isRecording()));
    };

    // The release is matched on the key alone. Letting go of the modifier first
    // ("Alt+D" released as D-then-Alt, or Alt-then-D) would otherwise leave the
    // recording running with nothing left to stop it.
    //
    // Read through the same helper as the press, so an input method that
    // rewrites the character cannot make a hold unstoppable (issue #315): the
    // release reports key='ㅇ' where the press was bound as 'd'.
    const onKeyUp = (e: KeyboardEvent) => {
      const released = keyOfEvent(e) === parsed.key || isModifierOf(e.key, parsed);
      if (!released) return;
      run(press.release());
    };

    // A hold interrupted by the window losing focus never delivers its keyup,
    // which would strand the microphone open.
    const onBlur = () => {
      run(press.release());
      press.cancel();
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [shortcut]);
}

/** Is this released key one of the modifiers the shortcut needs held down? */
function isModifierOf(key: string, parts: { ctrl: boolean; alt: boolean; meta: boolean }): boolean {
  return (
    (key === 'Control' && parts.ctrl) ||
    (key === 'Alt' && parts.alt) ||
    (key === 'Meta' && parts.meta)
  );
}
