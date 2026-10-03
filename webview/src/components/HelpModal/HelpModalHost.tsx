import { useCallback, useEffect, useState } from 'react';
import { HelpModal } from './HelpModal';
import { OPEN_HELP_EVENT, TOGGLE_HELP_EVENT } from './events';
import { useShortcutContext } from './useShortcutContext';

/**
 * Owns whether the help modal is open, mounted once at the app root.
 *
 * Cmd/Ctrl+/ toggles it, so the key that opened it also closes it; the command
 * palette item only opens it, because choosing "Keyboard shortcuts" from a menu
 * should never make an already-open list disappear.
 */
export function HelpModalHost() {
  const [open, setOpen] = useState(false);
  const context = useShortcutContext();
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const toggle = () => setOpen((wasOpen) => !wasOpen);
    const show = () => setOpen(true);
    window.addEventListener(TOGGLE_HELP_EVENT, toggle);
    window.addEventListener(OPEN_HELP_EVENT, show);
    return () => {
      window.removeEventListener(TOGGLE_HELP_EVENT, toggle);
      window.removeEventListener(OPEN_HELP_EVENT, show);
    };
  }, []);

  if (!open) return null;
  return <HelpModal context={context} onClose={close} />;
}
