import { isJetBrains } from '@/config/environment';

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
 *
 * Two other ways of answering "am I in the IDE?" are wrong here, and both have
 * been tried. Neither of them fails loudly, so they are written down:
 *
 * - The page URL. Only the IDE host ever puts a `panelId` query parameter on the
 *   page, so reading it back looks safe — but it does not survive the first
 *   navigation. `navigateToSession` rebuilds the URL with `workingDir` alone, so
 *   from the moment a session is created every later turn was judged to be a
 *   browser, `document.hidden` stayed false in JCEF, and no banner was ever
 *   raised again. Patching that one URL builder would not settle it: more places
 *   build URLs, and each new one starts out having forgotten. Keeping the answer
 *   off the URL is what settles it.
 * - `'Notification' in window`. Recent JCEF/CEF builds expose a `Notification`
 *   object that is present but non-functional (CEF #2951), so that check calls
 *   the IDE a browser as well.
 *
 * `isJetBrains()` reads the marker Kotlin injects before any of our JS runs, and
 * navigating cannot take that away.
 */
export function shouldNotifyForBackgroundEvent(): boolean {
  if (typeof document === 'undefined') return false;
  if (isJetBrains()) return true;
  return document.hidden;
}
