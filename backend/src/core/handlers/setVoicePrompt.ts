import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { markVoicePromptAsked, setVoicePromptDecision } from '../features/profile';
import { MessageType } from '../../shared';

/**
 * Records the one-time voice question being shown, or answered.
 *
 * `{ asked: true }` writes only the time it was put on screen — deliberately not
 * an answer, so a user who closes the app without choosing is asked again and is
 * still distinguishable from one who was never asked.
 *
 * `{ accepted }` writes the answer. Turning voice input off is left to the
 * webview, which sends the same settings write the settings screen's own toggle
 * sends; recording the answer and acting on it stay separate so this handler
 * cannot drift from that toggle.
 */
export async function setVoicePromptHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const payload = message.payload ?? {};
  const voicePrompt =
    payload.asked === true
      ? await markVoicePromptAsked()
      : await setVoicePromptDecision(payload.accepted === true);

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    voicePrompt,
  });
}
