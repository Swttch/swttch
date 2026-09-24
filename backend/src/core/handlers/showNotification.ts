import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import {
  awaitFirstPermissionAnswer,
  isClickToFocus,
  offerPersistentBannersAfterGrant,
  showOsNotification,
} from '../../system-notifications';
import { readMergedSettings, saveSettingToFile } from '../features/settings';

/**
 * How long the notifier waits for a click before giving up.
 *
 * It stays alive the whole time, so this is a balance: too short and a user who
 * steps away comes back to a banner that no longer does anything, too long and
 * every ignored notification leaves a process behind for the rest of the day.
 * Ten minutes covers "I looked up and saw it" without accumulating.
 */
const CLICK_WAIT_SECONDS = 600;

/**
 * Write down what the user answered the very first time macOS asked them.
 *
 * Raising a banner from a bundle nobody has approved yet IS the permission
 * prompt, so the first notification is what asks. Recording the answer turns an
 * OS-level decision into our own switch, which is what lets the settings screen
 * show the user their own choice instead of a default we invented, and what
 * stops us asking again on every turn.
 *
 * The answer is polled rather than read off the notifier's exit code. The
 * notifier now stays alive for ten minutes waiting for a click, so its exit code
 * would arrive ten minutes after the user pressed Allow — the switch stayed
 * `null` and the follow-up offer never appeared. Polling lands it when it
 * happens.
 *
 * Off macOS there is no prompt at all, so the first notification simply confirms
 * banners work and the switch lands on.
 *
 * A silent prompt — nobody answered within the window — writes nothing. The key
 * stays null and the next notification asks again, which is right: they have not
 * decided.
 */
async function recordFirstAnswer(): Promise<void> {
  const granted = process.platform === 'darwin' ? await awaitFirstPermissionAnswer() : true;
  if (granted === null) return; // still unanswered; ask again next time
  // Global scope: the OS grants notification permission to the app, not to one
  // project, so recording it per project would ask the same question again in
  // the next repository.
  const result = await saveSettingToFile('notificationBanner', granted);
  if (result.status !== 'ok') {
    console.error('[node-backend]', 'could not record the notification answer:', result.error);
  }
  if (granted) {
    // They have just said yes, and macOS has just defaulted them to the banner
    // style that fades — the wrong one for a notification whose whole purpose is
    // to reach someone who walked away. This is the one moment that choice is in
    // front of them, so offer the switch now rather than hoping they find the
    // hint on the settings screen later.
    await offerPersistentBannersAfterGrant();
  }
}

/**
 * Handle SHOW_NOTIFICATION: decide whether a banner may be raised for an
 * "attention needed" / "response complete" event, and raise it where this
 * process can.
 *
 * Every screen sends this, not just the IDE. Whether the user wants banners at
 * all is answered here, from the `notificationBanner` key of the settings file,
 * read at the moment the banner would appear. Keeping that answer out of the
 * screens is what stops a chat screen — which stays mounted underneath the
 * settings overlay and is never told to re-read anything — from going on
 * raising banners the user has just switched off.
 *
 * What the caller still decides is whether the user is *elsewhere*. That is not
 * in any settings file: only the page and the IDE know where the user is
 * looking, so the request arriving at all means "they are not watching this
 * session".
 *
 * Who draws the banner depends on where the page runs, and that is not a
 * setting either:
 *  - IDE (JCEF): raised here, through the host bridge, plus a real OS
 *    notification when the IDE itself is in the background.
 *  - Browser: the page's own `Notification` API draws it, because only the
 *    browser can. The reply's `allowed` flag is the page's permission to do so.
 */
export async function showNotificationHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  const title = message.payload?.['title'];
  if (typeof title !== 'string' || title.length === 0) {
    connections.sendTo(connectionId, 'ACK', {
      requestId: message.requestId,
      status: 'error',
      error: 'Missing or invalid title',
    });
    return;
  }

  const bodyValue = message.payload?.['body'];
  const body = typeof bodyValue === 'string' ? bodyValue : '';
  const workingDirValue = message.payload?.['workingDir'];
  const workingDir = typeof workingDirValue === 'string' && workingDirValue.length > 0
    ? workingDirValue
    : undefined;
  const panelIdValue = message.payload?.['panelId'];
  const panelId = typeof panelIdValue === 'string' && panelIdValue.length > 0
    ? panelIdValue
    : undefined;

  try {
    const { settings } = await readMergedSettings(workingDir);
    // An explicit false is the user having switched banners off. null is a
    // different answer: they have never been asked. The first notification is
    // what asks — raising it triggers the OS permission prompt — and the answer
    // is written back below, so this only reads as "go ahead and ask".
    if (settings['notificationBanner'] === false) {
      connections.sendTo(connectionId, 'ACK', {
        requestId: message.requestId,
        status: 'ok',
        allowed: false,
      });
      return;
    }
    const neverAsked = settings['notificationBanner'] === null
      || settings['notificationBanner'] === undefined;

    const { shown, ideFocused } = await bridge.showNotification({
      title,
      body,
      workingDir,
      panelId,
    });
    // The IDE balloon is hidden behind other apps when the IDE is in the
    // background, so raise a real OS notification in that case (only when the
    // balloon was actually shown — i.e. the user isn't already viewing it).
    if (shown && !ideFocused) {
      // panelId groups the banner: a panel that notifies twice replaces its own
      // previous banner instead of stacking a second one next to it.
      // activateBundleId makes a click on the banner bring the IDE forward; it
      // is undefined off macOS, where the notifier ignores it anyway.
      // clickActionTitle is what keeps the notifier listening for a click; see
      // NOTIFIER_STAYS_FOR_CLICK. The webview supplies it already translated,
      // since the backend has no locale of its own.
      const clickActionTitle = typeof message.payload?.['clickActionTitle'] === 'string'
        ? (message.payload['clickActionTitle'] as string)
        : undefined;
      if (neverAsked) {
        // Runs alongside the banner, not after it: raising the banner is what
        // triggers the prompt, and the notifier will not exit until the click
        // window closes ten minutes later.
        void recordFirstAnswer();
      }
      await showOsNotification(
        {
          title,
          body,
          groupId: panelId,
          clickActionTitle,
          clickTimeoutSeconds: CLICK_WAIT_SECONDS,
        },
        (outcome) => {
          // One line per finished banner. The click path crosses three
          // processes and two languages, and when it breaks there is nothing
          // else to look at — the previous break was a message the IDE dropped
          // without error because dropping it was normal.
          console.log(
            '[node-backend]',
            `notification outcome: code=${outcome.code} stdout=${JSON.stringify(outcome.stdout)} ` +
              `click=${isClickToFocus(outcome)} panelId=${panelId ?? 'none'}`,
          );
          if (isClickToFocus(outcome)) {
            // The IDE raises itself; it is the only one that knows which window
            // and which tab. Failures are silent by design — the user has
            // already clicked and there is nowhere to report to.
            void bridge.focusSession({ panelId }).catch((err: unknown) => {
              console.error('[node-backend]', 'focusSession failed:', err);
            });
          }
        },
      );
    } else if (neverAsked) {
      // The banner never reached the OS — the user is looking right at the
      // session — so there was no prompt and nothing to record. Asking on some
      // later notification is the right time; leaving it null is what makes
      // that happen.
    }
    connections.sendTo(connectionId, 'ACK', {
      requestId: message.requestId,
      status: 'ok',
      allowed: true,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[node-backend]', 'showNotification failed:', err);
    connections.sendTo(connectionId, 'ACK', {
      requestId: message.requestId,
      status: 'error',
      error,
    });
  }
}
