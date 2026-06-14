/**
 * Whether a just-fired background event (streaming end, awaiting permission,
 * etc.) should raise an attention notification — i.e. the user is NOT currently
 * looking at this session.
 *
 * Gated on `document.hidden`: a visible tab makes both the notification and the
 * unread badge redundant noise. This holds in both environments:
 * - Browser / standalone: the page is hidden when its browser tab is backgrounded.
 * - JCEF (JetBrains IDE): the page is hidden when its editor tab is not the
 *   selected one (Chromium reports the embedded view's visibility), so switching
 *   to another tab — or away from the IDE — suppresses or raises it correctly.
 *   The IDE host then shows a balloon (IDE focused) or, when the IDE itself is in
 *   the background, the platform promotes it to an OS notification automatically.
 */
export function shouldNotifyForBackgroundEvent(): boolean {
  if (typeof document === 'undefined') return false;
  return document.hidden;
}
