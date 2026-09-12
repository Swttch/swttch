import { isMac } from '@/config/environment';
import { displayShortcut } from '@/utils/shortcut';

/**
 * How the send key is written in the composer placeholder.
 *
 * The composer sends on a plain Enter by default, and on Ctrl/Cmd+Enter once the
 * useCtrlEnterToSend setting is on (see {@link shouldSubmitOnEnter}). Both Ctrl
 * and Cmd submit on either platform, so the label names the one that platform's
 * users reach for rather than hardcoding a single symbol: a Windows user who
 * reads "⌘Enter" has no such key.
 */
export function sendKeyLabel(useCtrlEnterToSend: boolean): string {
  if (!useCtrlEnterToSend) return 'Enter';
  return displayShortcut(isMac() ? 'Meta+Enter' : 'Ctrl+Enter');
}
