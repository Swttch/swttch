import { isMac } from '@/config/environment';
import { KeyCaps } from './KeyCaps';
import { keyCapsFor } from './keyCombo';

/** The shortcut that opens the help modal, as the command palette row shows it. */
export function HelpShortcutHint() {
  return <KeyCaps combos={[keyCapsFor('Mod+/', isMac())]} />;
}
