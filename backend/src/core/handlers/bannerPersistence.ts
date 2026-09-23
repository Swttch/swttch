import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { openNotificationSettings, readBannerPersistence } from '../../system-notifications';
import { MessageType } from '../../shared';

/**
 * Handle GET_BANNER_PERSISTENCE: report whether the OS keeps our banners on
 * screen or lets them fade.
 *
 * The settings screen uses this to decide whether to offer the user a way to
 * change it. Only macOS can answer — it is the one host of the three where the
 * choice belongs to the user rather than to the notification we send — so
 * everywhere else this is `unknown` and the offer stays hidden.
 */
export async function bannerPersistenceHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const persistence = await readBannerPersistence();
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    persistence,
  });
}

/**
 * Handle OPEN_NOTIFICATION_SETTINGS: put the user in front of the switch.
 *
 * Deep-links straight to our own row in System Settings > Notifications rather
 * than to the list, because the row is named after the notifier bundle and a
 * user who has to find it among a hundred apps will not.
 */
export async function openNotificationSettingsHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  if (process.platform !== 'darwin') {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: 'Notification settings deep-link is macOS only',
    });
    return;
  }
  try {
    await openNotificationSettings();
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[node-backend]', 'openNotificationSettings failed:', err);
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error,
    });
  }
}
