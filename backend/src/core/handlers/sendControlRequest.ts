import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { ensureClaudeProcess, sendControlRequestToProcess } from '../claude-process';
import { generateSessionId } from '../features/generateSessionId';
import { MessageType } from '../../shared';

/** WebView -> Backend SEND_CONTROL_REQUEST payload */
interface SendControlRequestPayload {
  /** Echoed back on the CLI's control_response so the webview can match it. */
  requestId: string;
  /** The `request` object handed to the CLI verbatim, including its subtype. */
  request: Record<string, unknown>;
  /** Session to run against; a fresh chat has one picked but not yet spawned. */
  sessionId?: string;
  /** Required to spawn the CLI when no process is running yet. */
  workingDir?: string;
  /** Permission mode to spawn under, matching what SEND_MESSAGE would use. */
  inputMode?: string;
  /** Model to spawn with, matching what SEND_MESSAGE would use. */
  model?: string;
}

/**
 * Run a slash command the CLI refuses over stream-json by issuing the
 * equivalent `control_request` on the session's stdin (#270).
 *
 * The CLI's answer arrives as an ordinary CLI event and is broadcast unchanged,
 * so there is no response bookkeeping here — the webview matches on request_id.
 * The ACK reports only whether the request reached a writable stdin; a `false`
 * here is the webview's cue to fall back to sending the command as text.
 */
export async function sendControlRequestHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  const payload = message.payload as SendControlRequestPayload | undefined;

  if (!payload?.requestId || !payload?.request) {
    console.error('[node-backend]', 'SEND_CONTROL_REQUEST received without requestId/request');
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      sent: false,
    });
    return;
  }

  // Run against the subscribed session when there is one. In a chat that hasn't
  // sent anything yet there is no CLI process, so spawn one the same way
  // SEND_MESSAGE does — otherwise running a command as the very first action
  // would find no stdin and fall back to text, which is exactly what the CLI
  // refuses (#270).
  const client = connections.getClient(connectionId);
  let sessionId = client?.subscribedSessionId;

  if (!sessionId) {
    const workingDir = payload.workingDir;
    if (!workingDir) {
      console.error('[node-backend]', 'SEND_CONTROL_REQUEST has no session and no workingDir');
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        sent: false,
      });
      return;
    }
    sessionId = payload.sessionId || generateSessionId();
    try {
      connections.subscribe(connectionId, sessionId);
      await ensureClaudeProcess(
        connections,
        connectionId,
        workingDir,
        sessionId,
        payload.inputMode as string,
        bridge,
        payload.model,
      );
    } catch (err) {
      // ensureClaudeProcess already reports the failure to the session.
      console.error('[node-backend]', 'SEND_CONTROL_REQUEST could not start a session:', err);
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        sent: false,
      });
      return;
    }
  }

  const sent = sendControlRequestToProcess(
    connections,
    sessionId,
    payload.requestId,
    payload.request,
  );

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    sent,
  });
}
