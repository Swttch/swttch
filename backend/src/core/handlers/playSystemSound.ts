import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { normalizeVolumeStep, playSystemSound } from '../../system-sounds';
import { MessageType } from '../../shared';

/**
 * Handle PLAY_SYSTEM_SOUND: play one named sound, for the settings preview.
 *
 * Both the sound and the volume are named by the caller here, unlike
 * PLAY_NOTIFICATION_SOUND which looks them up in the settings file. The preview
 * answers "what does the row I am pointing at sound like", which is a question
 * about the control the user is holding, not about what is saved — and reading
 * the saved value would mean waiting for the write to land before the preview
 * could play, so a slow save would preview the previous choice.
 */
export async function playSystemSoundHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const soundId = message.payload?.['soundId'];
  if (typeof soundId !== 'string' || soundId.length === 0) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: 'Missing or invalid soundId',
    });
    return;
  }

  // Absent means the default step, which is what normalizeVolumeStep does with
  // a non-number.
  const volumeStep = normalizeVolumeStep(message.payload?.['volumeStep']);

  try {
    await playSystemSound(soundId, { volumeStep });
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[node-backend]', 'playSystemSound failed:', err);
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error,
    });
  }
}
