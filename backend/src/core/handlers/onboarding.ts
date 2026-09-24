import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { getOnboardingDismissedAt, dismissOnboarding } from '../features/profile';
import { MessageType } from '../../shared';

/**
 * Answers when the onboarding checklist card was closed, or null if it never
 * was.
 *
 * This is the only thing that decides whether the card is raised. Whether the
 * individual steps are done is NOT answered here: that is the state of the
 * machine right now rather than history, and only each step's own lookup
 * (`GET_DETECTED_CLI_PATH`, `GET_ACCOUNT`, `GET_EXTEND_KIT_INFO`, the
 * `dockLayout` setting) gives the right answer, asked afresh every time.
 */
export async function getOnboardingDismissedAtHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    dismissedAt: await getOnboardingDismissedAt(),
  });
}

/**
 * Records that the card was closed, and answers with the moment recorded.
 *
 * Takes no payload. Closing is one act with one meaning, and the moment is the
 * server's to read.
 */
export async function dismissOnboardingHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    dismissedAt: await dismissOnboarding(),
  });
}
