import type { ConnectionManager } from './connection-manager';
import {
  CLI_FLAG_TO_INPUT_MODE,
  sendInterruptToProcess,
  sendMessageToProcess,
  sendSetModelToProcess,
  sendSetPermissionModeToProcess,
} from '../core/claude-process';

export interface SessionControlRouteResult {
  status: number;
  body: Record<string, unknown>;
}

const fail = (status: number, error: string): SessionControlRouteResult => ({ status, body: { error } });

/**
 * POST /internal/session-control: a program on this machine asks the backend that holds a session's
 * CLI to act on it. The backend started the CLI and owns its stdin, so nobody else can write to it.
 *
 * Body: `{ sessionId, action, ... }` with action one of
 *   interrupt                       stop the turn in flight
 *   send_message  { text }          hand the CLI a user message
 *   set_model     { model }         switch the model of the running CLI
 *   set_permission_mode { mode }    one of the CLI's own mode names (default, acceptEdits, plan, auto, bypassPermissions)
 *
 * Sits behind the /internal/* token gate. Extracted from the HTTP layer so it can be tested without a server.
 */
export function handleSessionControlRequest(connections: ConnectionManager, rawBody: string): SessionControlRouteResult {
  let request: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return fail(400, 'Body must be a JSON object');
    request = parsed as Record<string, unknown>;
  } catch {
    return fail(400, 'Body is not valid JSON');
  }
  const { sessionId, action } = request;
  if (typeof sessionId !== 'string' || sessionId === '') return fail(400, 'sessionId is required');
  if (typeof action !== 'string' || action === '') return fail(400, 'action is required');

  let sent: boolean;
  switch (action) {
    case 'interrupt':
    case 'send_message':
    case 'set_model':
    case 'set_permission_mode':
      break;
    default:
      return fail(400, `Unknown action: ${action}`);
  }
  if (!connections.getSession(sessionId)?.process) return fail(404, 'This backend holds no process for that session');

  if (action === 'interrupt') {
    sent = sendInterruptToProcess(connections, sessionId);
  } else if (action === 'send_message') {
    if (typeof request.text !== 'string' || request.text === '') return fail(400, 'text is required');
    sent = sendMessageToProcess(connections, sessionId, request.text);
  } else if (action === 'set_model') {
    if (typeof request.model !== 'string' || request.model === '') return fail(400, 'model is required');
    sent = sendSetModelToProcess(connections, sessionId, request.model);
  } else {
    const inputMode = typeof request.mode === 'string' ? CLI_FLAG_TO_INPUT_MODE[request.mode] : undefined;
    if (!inputMode) return fail(400, 'mode must be one of the CLI permission mode names');
    sent = sendSetPermissionModeToProcess(connections, sessionId, inputMode);
  }
  return sent ? { status: 200, body: { ok: true } } : fail(409, 'The CLI is not accepting input right now');
}
