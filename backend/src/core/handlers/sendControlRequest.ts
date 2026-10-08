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

  // Run against the subscribed session when there is one. When no CLI is
  // running for it, start one the same way SEND_MESSAGE does — otherwise the
  // request finds no stdin and falls back to text, which is exactly what the
  // CLI refuses (#270). That covers both a chat that hasn't sent anything yet
  // and a session reopened from history, whose CLI only starts on the next
  // message: a `/btw` asked first thing in a reopened session used to land in
  // the main chat as text instead of in the side-question window.
  //
  // Only when there is no CLI at all, though. One that exists but can't take
  // input right now is the main agent's: ensureClaudeProcess would restart it
  // if its settings differ from this request's, killing the agent mid-turn. The
  // request is reported as not sent instead.
  const client = connections.getClient(connectionId);
  let sessionId = client?.subscribedSessionId;

  if (!sessionId || !connections.getSession(sessionId)?.process) {
    const workingDir = payload.workingDir;
    if (!workingDir) {
      console.error('[node-backend]', 'SEND_CONTROL_REQUEST has no running CLI and no workingDir');
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        sent: false,
      });
      return;
    }
    if (!sessionId) {
      sessionId = payload.sessionId || generateSessionId();
      connections.subscribe(connectionId, sessionId);
    }
    try {
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
