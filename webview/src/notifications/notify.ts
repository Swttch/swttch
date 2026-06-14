import { api } from '@/api/ClaudeCodeApi';
import { NOTIFICATION_TEMPLATES } from './templates';
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
 *  - Browser / standalone: the page's own `Notification` API. No-ops when
 *    permission has not been granted yet, so callers can invoke unconditionally.
 *  - JCEF (JetBrains IDE): the page has no `Notification` API, so we ask the IDE
 *    host to raise a native notification via `SHOW_NOTIFICATION`. The host
 *    decides whether to suppress it (e.g. when its window is already focused).
 *
 * The notification is always created with `silent: true` on the browser path —
 * sound playback is delegated to the Node.js backend via `PLAY_SYSTEM_SOUND` so
 * we can play a specific OS sound consistently across browsers (the browser
 * `silent: false` path is too unreliable on Chrome/macOS). Sound is played in
 * both paths; when `soundSelection !== SOUND_OFF` the selected `soundId` is sent
 * to the backend in fire-and-forget fashion.
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

  if ('Notification' in window) {
    // Browser / standalone mode: raise the notification ourselves.
    if (Notification.permission !== 'granted') return;

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
    // JCEF (JetBrains IDE): no Notification API — delegate to the IDE host.
    api.notifications.show({ title, body: template.body() }).catch((err: unknown) => {
      console.warn('[notify] SHOW_NOTIFICATION failed:', err);
    });
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
