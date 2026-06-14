import { api } from '@/api/ClaudeCodeApi';
import { NOTIFICATION_TEMPLATES } from './templates';
import { isIdeHost } from './host';
import {
  NotificationKind,
  SOUND_OFF,
  type NotificationContext,
  type SoundSelection,
} from './types';

/**
 * Emits a desktop notification for the given event kind.
 *
 * Two delivery paths, chosen by environment:
 *  - JetBrains IDE (JCEF): the page's own `Notification` API is unreliable, so we
 *    ask the IDE host to raise a native notification via `SHOW_NOTIFICATION`. The
 *    platform shows a balloon, or an OS notification when the IDE is backgrounded.
 *  - Browser / standalone: the page's own `Notification` API. No-ops when
 *    permission has not been granted, so callers can invoke unconditionally.
 *
 * On the browser path the notification is created with `silent: true` — sound is
 * delegated to the Node.js backend via `PLAY_SYSTEM_SOUND` so we can play a
 * specific OS sound consistently across browsers (the browser `silent: false`
 * path is too unreliable on Chrome/macOS). Sound is played on both paths; when
 * `soundSelection !== SOUND_OFF` the selected `soundId` is sent to the backend in
 * fire-and-forget fashion.
 */

const activeNotifications = new Set<Notification>();

export function notify(
  kind: NotificationKind,
  ctx: NotificationContext,
  soundSelection: SoundSelection,
): void {
  if (typeof window === 'undefined') return;

  const template = NOTIFICATION_TEMPLATES[kind];
  const title = template.title(ctx);

  if (isIdeHost()) {
    // JetBrains IDE: delegate to the host (browser Notification API is
    // present-but-broken in JCEF — CEF #2951 — so never use it here).
    api.notifications.show({ title, body: template.body() }).catch((err: unknown) => {
      console.warn('[notify] SHOW_NOTIFICATION failed:', err);
    });
  } else if ('Notification' in window && Notification.permission === 'granted') {
    // Browser / standalone mode: raise the notification ourselves.
    let n: Notification;
    try {
      n = new Notification(title, {
        body: template.body(),
        icon: template.icon,
        // Always silence the browser's own sound channel — sound is played by
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
  } else {
    // Browser without notification permission/API — nothing to show, no sound.
    return;
  }

  if (soundSelection !== SOUND_OFF) {
    api.sounds.play(soundSelection).catch((err: unknown) => {
      // Sound playback is best-effort; do not propagate failure to the caller.
      console.warn('[notify] PLAY_SYSTEM_SOUND failed:', err);
    });
  }
}

if (typeof window !== 'undefined' && 'addEventListener' in window) {
  window.addEventListener('beforeunload', () => {
    activeNotifications.forEach((n) => n.close());
    activeNotifications.clear();
  });
}
