import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import {
  getVoicePrompt,
  acceptVoicePromptForInstalledKit,
  VoicePromptStatus,
} from '../features/profile';
import { getExtendKitVersion } from '../extend-kit';
import { MessageType } from '../../shared';

/**
 * Whether the user has answered the one-time "use voice input?" question.
 *
 * A kit that is already installed answers it: asking someone who has the kit
 * whether they want to install it has no meaning, so the state resolves to
 * accepted without ever being shown. That check happens here rather than in the
 * webview because "is the kit installed" is the backend's question to answer —
 * the webview would otherwise have to sequence two round trips to learn it.
 */
export async function getVoicePromptHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  let prompt = await getVoicePrompt();

  if (prompt.status === VoicePromptStatus.PENDING) {
    // A missing kit is the ordinary case and throws nothing; a failure to look
    // is not an answer, so it leaves the question pending rather than deciding it.
    const installed = await getExtendKitVersion().catch(() => null);
    if (installed) prompt = await acceptVoicePromptForInstalledKit();
  }

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    voicePrompt: prompt,
  });
}
