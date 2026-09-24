import { api } from '@/api/ClaudeCodeApi';
import { NOTIFICATION_TEMPLATES } from './templates';
import { isJetBrains } from '@/config/environment';
import { NotificationKind, type NotificationContext } from './types';
import { i18n } from '@/i18n';

/**
 * The two halves of a desktop notification, kept apart because they answer
 * different questions and therefore fire on different conditions.
 *
 * - {@link playNotificationSound} says "this turn just ended". It is worth
 *   hearing even while the user is looking straight at the session, so it is
 *   never gated on whether they are elsewhere.
 * - {@link showNotificationBanner} calls back someone who has walked away, so
 *   callers gate it on the session not being watched (see
 *   `shouldNotifyForBackgroundEvent`) and on the user's banner preference.
 *
 * They used to be one call, with the sound hanging off the end of the banner.
 * Anything that stopped the banner — a visible tab, a browser that never got
 * notification permission — silently took the sound with it, which is the one
 * thing a user who is watching the screen still wants.
 */

const activeNotifications = new Set<Notification>();

/**
 * Rings the notification sound the user chose, if they chose one.
 *
 * This call names nothing and decides nothing. It asks the Node.js backend to
 * play "the notification sound", and the backend reads the `notificationSound`
 * plugin setting at that moment to find out which one that is — including the
 * case where the user chose none, which the backend answers by playing nothing.
 *
 * Deciding here is what the defect was. The screen that raises the notification
 * is the chat screen, the settings overlay is drawn on top of it without
 * unmounting it, and a chat screen holding its own copy of the preference went
 * on ringing the sound it had read at mount. Now no screen holds a copy.
 *
 * The browser's own notification sound channel is not used at all: it cannot
 * name a specific OS sound and its `silent: false` path is unreliable on
 * Chrome/macOS. Fire-and-forget — a failed sound must not break the caller.
 */
export function playNotificationSound(): void {
  if (typeof window === 'undefined') return;

  api.sounds.playNotificationSound().catch((err: unknown) => {
    // Sound playback is best-effort; do not propagate failure to the caller.
    console.warn('[notify] PLAY_NOTIFICATION_SOUND failed:', err);
  });
}

/**
 * Raises the on-screen banner for the given event kind, if the user wants one.
 *
 * Callers decide only whether the user is *elsewhere* (see
 * `shouldNotifyForBackgroundEvent`). Whether banners are wanted at all is the
 * backend's answer, read from the settings file as the request arrives, so this
 * always asks — in the IDE and in the browser alike. Holding that answer in a
 * screen is what let a chat screen under the settings overlay keep raising
 * banners the user had just switched off.
 *
 * Who draws it depends on where the page runs:
 *  - JetBrains IDE (JCEF): the backend already raised it through the host by
 *    the time the reply arrives. The page's own `Notification` API is present
 *    but non-functional there (CEF #2951), so it is never used.
 *  - Browser / standalone: only the page can draw one, so it does, once the
 *    reply says a banner is wanted.
 *
 * The browser banner is created with `silent: true` — the sound is played
 * separately by {@link playNotificationSound}, so letting the browser add its
 * own would double it up.
 */
export async function showNotificationBanner(
  kind: NotificationKind,
  ctx: NotificationContext,
): Promise<void> {
  if (typeof window === 'undefined') return;

  const template = NOTIFICATION_TEMPLATES[kind];
  const title = template.title(ctx);

  let allowed: boolean;
  try {
    allowed = await api.notifications.show({
      title,
      body: template.body(),
      // The desktop banner needs a button label, and it has to be a word the
      // user reads — so it is translated here. The backend has no locale of its
      // own, and the label is not decoration: its presence is what keeps the
      // macOS notifier listening long enough to report a click. See the
      // backend's NOTIFIER_STAYS_FOR_CLICK.
      clickActionTitle: i18n.t('notifications:openSession'),
    });
  } catch (err: unknown) {
    console.warn('[notify] SHOW_NOTIFICATION failed:', err);
    return;
  }
  if (!allowed) return;

  // In the IDE the host has already shown it; there is nothing left to draw
  // here, and the JCEF Notification object would fail silently anyway.
  //
  // The question is put to the runtime, never to the page URL and never to
  // `'Notification' in window` — both of those answer it wrongly inside JCEF,
  // and neither says so. See `shouldNotifyForBackgroundEvent` for what each one
  // gets wrong.
  if (isJetBrains()) return;

  if (!('Notification' in window) || Notification.permission !== 'granted') {
    // Browser without notification permission/API — nothing to show.
    return;
  }

  let n: Notification;
  try {
    n = new Notification(title, {
      body: template.body(),
      icon: template.icon,
      // Always silence the browser's own sound channel — the sound is played by
      // the backend so we don't double up.
      silent: true,
    });
  } catch {
    // Some platforms (e.g. some mobile Safari versions) throw when constructing
    // a Notification directly. Treat construction failure as a no-op.
    return;
  }

  activeNotifications.add(n);
  n.onclick = () => {
    window.focus();
    n.close();
  };
  n.onclose = () => {
    activeNotifications.delete(n);
  };
}

if (typeof window !== 'undefined' && 'addEventListener' in window) {
  window.addEventListener('beforeunload', () => {
    activeNotifications.forEach((n) => n.close());
    activeNotifications.clear();
  });
}
