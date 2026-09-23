import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { normalizeVolumeStep, playSystemSound } from '../../system-sounds';
import { readMergedSettings } from '../features/settings';
import { MessageType } from '../../shared';

/**
 * Handle PLAY_NOTIFICATION_SOUND: play the sound the user picked for
 * notifications, whatever that currently is.
 *
 * The request deliberately carries no sound name. Naming the sound was the
 * webview's job until a screen that had read the preference once kept ringing
 * the old sound after the user changed it in the settings overlay — the chat
 * screen stays mounted underneath that overlay, so nothing told it to re-read.
 * Resolving the name here, at the moment of playback, removes the copy that
 * could go stale: there is now exactly one place the answer lives, the
 * `notificationSound` key of the plugin settings file.
 *
 * `workingDir` selects the project whose settings apply, so a project-scoped
 * sound wins over the global one exactly as every other setting does. Omitting
 * it reads the global file alone.
 *
 * A null/empty setting means the user chose no sound, which is a success with
 * nothing to do — not an error. A sound id that no longer exists on this
 * machine (a preference written on another OS, say) does fail, because that is
 * a real mismatch worth seeing in the log.
 */
export async function playNotificationSoundHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const workingDirValue = message.payload?.['workingDir'];
  const workingDir = typeof workingDirValue === 'string' && workingDirValue.length > 0
    ? workingDirValue
    : undefined;

  try {
    const { settings } = await readMergedSettings(workingDir);
    const configured = settings['notificationSound'];
    const soundId = typeof configured === 'string' ? configured.trim() : '';

    if (soundId.length === 0) {
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        status: 'ok',
        played: false,
      });
      return;
    }

    const volumeStep = normalizeVolumeStep(settings['notificationSoundVolume']);
    await playSystemSound(soundId, { volumeStep });
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      played: true,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[node-backend]', 'playNotificationSound failed:', err);
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error,
    });
  }
}
