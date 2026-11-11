import type { ConnectionManager } from './connection-manager';
import {
  CLI_FLAG_TO_INPUT_MODE,
  sendInterruptToProcess,
  sendMessageToProcess,
  sendSetModelToProcess,
  sendSetPermissionModeToProcess,
} from '../core/claude-process';
import { MessageType } from '../shared';
import { normalizeSessionName, renameSessionThroughCli } from '../core/features/cli-rename';

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
 *   rename        { title }         give the session a name, the way this app renames one (see `handleSessionControl`)
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
    // The CLI does not echo what it is handed, so the screens showing this session would see
    // Claude answer a message that never appeared. Tell them, the way a message sent from
    // another tab is told.
    if (sent) {
      connections.broadcastToSession(sessionId, MessageType.USER_MESSAGE_BROADCAST, { content: request.text, sessionId });
    }
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

/**
 * The whole route. Every action but one is answered at once by {@link handleSessionControlRequest}, because it
 * only writes to the CLI. `rename` waits for the CLI to confirm the name, so it is the one answered later.
 *
 * `rename { title }` gives the session a name exactly as renaming it in this app does
 * (`renameSessionThroughCli`): the CLI that runs the session records the name in the transcript, where every
 * client reads it. It is asked of this backend because a CLI that is running keeps the name it holds and writes
 * it again at the end of the transcript, so a name written by a second CLI beside it could be written back over.
 */
export async function handleSessionControl(connections: ConnectionManager, rawBody: string): Promise<SessionControlRouteResult> {
  let request: Record<string, unknown> | undefined;
  try {
    const parsed = JSON.parse(rawBody);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) request = parsed as Record<string, unknown>;
  } catch {
    request = undefined;
  }
  if (request?.action !== 'rename') return handleSessionControlRequest(connections, rawBody);

  const { sessionId, title } = request;
  if (typeof sessionId !== 'string' || sessionId === '') return fail(400, 'sessionId is required');
  const name = typeof title === 'string' ? normalizeSessionName(title) : '';
  if (name === '') return fail(400, 'title is required');
  const session = connections.getSession(sessionId);
  if (!session?.process) return fail(404, 'This backend holds no process for that session');
  try {
    const delivery = await renameSessionThroughCli(connections, sessionId, name, session.workingDir);
    return { status: 200, body: { ok: true, delivery } };
  } catch (err) {
    return fail(409, err instanceof Error ? err.message : String(err));
  }
}
