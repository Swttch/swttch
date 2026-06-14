import { isIdeHost } from './host';

/**
 * Whether a just-fired background event (streaming end, awaiting permission,
 * etc.) should raise an attention notification — i.e. the user is NOT currently
 * looking at this session.
 *
 * - Browser / standalone: gate on `document.hidden` — a visible tab makes both
 *   the notification and the unread badge redundant noise.
 * - JCEF (JetBrains IDE): `document.hidden` is NOT reliable across JCEF versions
 *   for editor-tab switches or app-focus changes (it tracks in 2024.2 but not in
 *   2026.1). So always pass here and let the IDE host gate by real editor-tab
 *   selection + window focus when it shows the notification.
 */
export function shouldNotifyForBackgroundEvent(): boolean {
  if (typeof document === 'undefined') return false;
  if (isIdeHost()) return true;
  return document.hidden;
}
