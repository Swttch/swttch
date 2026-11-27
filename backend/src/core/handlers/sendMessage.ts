import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { generateSessionId } from '../features/generateSessionId';
import { ensureClaudeProcess, sendMessageToProcess, restartClaudeSessionProcess } from '../claude-process';
import { forwardMessageToHolder } from '../forward-to-holder';
import { trackEvent } from '../features/telemetry';
import { isMessageUuid } from '../features/pending-message';
import { requestSessionTitleAfterSend } from '../features/session-title-runtime';
import { MessageType, ACCOUNT_POOL_CONTINUE_REMINDER } from '../../shared';
import { withAccount } from '../features/account-manager';
import { resetUsageCache } from './getUsage';
import { resetAllUsageCache } from './getAllUsage';
import { invalidateFableProbeCache } from '../features/fable-probe';
import { clearAccountPoolRecovery, claimAccountPoolContinuation } from '../features/account-pool-recovery-store';

export async function sendMessageHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  const content = message.payload?.content as string;
  const workingDir = message.payload?.workingDir as string | undefined;
  const msgSessionId = message.payload?.sessionId as string | undefined;

  if (!workingDir) {
    connections.sendTo(connectionId, MessageType.ERROR, {
      requestId: message.requestId,
      error: 'workingDir is required',
    });
    return;
  }
  // Absent means nothing has established a mode for this session yet — the CLI
  // then reads its own `permissions.defaultMode` rather than being handed one.
  const inputMode = message.payload?.inputMode as string | undefined;
  const model = message.payload?.model as string | undefined;
  const accountId = message.payload?.accountId as string | undefined;
  // The id the webview gave this message, so "send now" and "cancel" can name it to the CLI.
  const messageUuid = isMessageUuid(message.payload?.messageUuid) ? message.payload.messageUuid : undefined;
  // 새 세션 여부는 webview가 판정해 payload로 알려준다. webview가 새 세션에도 sessionId를
  // 미리 생성해 보내므로(ChatStreamContext), 백엔드에서 sessionId 유무로는 판정할 수 없다.
  const isNewSession = message.payload?.isNewSession === true;
  const resolvedSessionId = msgSessionId || generateSessionId();
  const attachments = message.payload?.attachments as Array<
    | { type: 'image'; fileName: string; mimeType: string; base64: string }
    | { type: 'file'; fileName: string; absolutePath: string }
    | { type: 'folder'; folderName: string; absolutePath: string }
  > | undefined;

  try {
    if (content || (attachments && attachments.length > 0)) {
      if (content.includes(ACCOUNT_POOL_CONTINUE_REMINDER)) {
        if (!(await claimAccountPoolContinuation(resolvedSessionId))) {
          connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
          return;
        }
      } else {
        await clearAccountPoolRecovery(resolvedSessionId);
      }
      // Subscribe and ensure process is running (waits for spawn)
      // The directory goes with it: the session is what later answers
      // "which project is this?", and per-project settings depend on it.
      connections.subscribe(connectionId, resolvedSessionId, workingDir);
      const send = async () => {
        // A session another backend runs (a tab of another IDE window started it) cannot be written to from here:
        // hand the message to the backend that holds its CLI instead of refusing it (#711).
        if (!connections.getProcess(resolvedSessionId)) {
          const forwarded = await forwardMessageToHolder(resolvedSessionId, { text: content, attachments, messageUuid });
          if (forwarded === 'forwarded') {
            // This tab only watches the turn that follows (it reads the transcript as it grows): no CLI of this backend
            // will ever say the turn is over, so the stream state the tab opened by sending must not be left running.
            connections.sendTo(connectionId, MessageType.STREAM_END, {});
            return;
          }
        }
        await ensureClaudeProcess(connections, connectionId, workingDir, resolvedSessionId, inputMode, bridge, model);
        sendMessageToProcess(connections, resolvedSessionId, content, attachments, messageUuid);
      };
      if (accountId) {
        // Re-establish the reservation's account at actual delivery, even if the
        // foreground tab took time to navigate after the quota check.
        await withAccount(accountId, async () => {
          resetUsageCache();
          resetAllUsageCache();
          invalidateFableProbeCache();
          connections.broadcastToAll(MessageType.ACCOUNTS_CHANGED, {});
          const proc = connections.getProcess(resolvedSessionId);
          if (proc) await restartClaudeSessionProcess(connections, resolvedSessionId, proc);
          await send();
        });
      } else {
        await send();
      }

      // Name a new session the way the terminal does. Not awaited: the title is
      // for the list and arrives while the first reply streams.
      requestSessionTitleAfterSend(connections, resolvedSessionId, content, isNewSession, workingDir);

      // Broadcast user message to other subscribers (excluding sender)
      connections.broadcastToSession(resolvedSessionId, MessageType.USER_MESSAGE_BROADCAST, {
        content: content.trim(),
        sessionId: resolvedSessionId,
        messageUuid,
      }, connectionId);

      // 새 세션이 시작된 경우에만 활성/사용 신호를 보낸다(동의 시에만, 내부에서 게이팅).
      // 공통 필드(os/버전 등)는 trackEvent가 자동으로 싣는다.
      if (isNewSession) {
        trackEvent('session_started');
      }
    }
  } catch (err) {
    // ensureClaudeProcess already broadcasts SERVICE_ERROR to the session, so the
    // user-facing error response is preserved. Telemetry reporting is intentionally
    // NOT done here — it is unified at the ws-server handler boundary. Send the ACK
    // first (the request is acknowledged regardless of outcome), then rethrow so the
    // single backend error boundary reports it via reportBackendError.
    console.error('[node-backend]', 'sendMessage failed:', err);
    connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
    throw err;
  }
  // ACK on the success path. (The catch path ACKs before rethrowing.)
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
}
