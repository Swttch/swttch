import type { ConnectionManager } from './connection-manager';
import type { Bridge } from '../bridge/bridge-interface';
import { turnEndCount, waitForTurnEnd } from '../core/features/turnEnds';
import {
  CLI_FLAG_TO_INPUT_MODE,
  ensureClaudeProcess,
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
 * What this route can do, as `capabilities` answers it. A program that wants to use a newer action asks first, so
 * that an older backend, which answers "unknown action" to `capabilities` itself, is told apart from one that can.
 */
const SUPPORTED_ACTIONS = ['interrupt', 'send_message', 'set_model', 'set_permission_mode', 'rename', 'start_session', 'await_turn_end'];

/** The longest a request may wait for a turn to end; the program asking comes back for the next stretch. */
const MAX_WAIT_MS = 55_000;

/**
 * `start_session { sessionId, workingDir, text, title?, model?, effort?, permissionMode? }`: run a new session's CLI
 * here, the way a message typed in a tab does, and hand it `text` as its first message.
 *
 * The session-management MCP asks for this when the session that started the new one is held by this backend. A CLI
 * started here is given the channel through which it asks the person (a question, a permission) and this backend
 * answers it, so the session has the tools a tab session has (the question card among them). A CLI the MCP starts on
 * its own has no such channel and therefore not those tools.
 *
 * No screen is attached to the session: nobody has it open yet. A question that comes up waits until a screen opens the session.
 * Answers `{ ok: true, turnEnds }`, where `turnEnds` is the number to name in the first `await_turn_end`.
 */
async function startSession(
  connections: ConnectionManager,
  request: Record<string, unknown>,
  bridge: Bridge | undefined,
): Promise<SessionControlRouteResult> {
  const { sessionId, workingDir, text, title, model, effort, permissionMode } = request;
  if (typeof sessionId !== 'string' || sessionId === '') return fail(400, 'sessionId is required');
  if (typeof workingDir !== 'string' || workingDir === '') return fail(400, 'workingDir is required');
  if (typeof text !== 'string' || text === '') return fail(400, 'text is required');
  let inputMode: string | undefined;
  if (permissionMode !== undefined && permissionMode !== null) {
    inputMode = typeof permissionMode === 'string' ? CLI_FLAG_TO_INPUT_MODE[permissionMode] : undefined;
    if (!inputMode) return fail(400, 'permissionMode must be one of the CLI permission mode names');
  }
  if (!bridge) return fail(500, 'This backend cannot start a session now');
  if (connections.getSession(sessionId)?.process) return fail(409, 'This backend already holds a process for that session');

  try {
    connections.getOrCreateSession(sessionId, workingDir);
    if (typeof effort === 'string' && effort !== '') connections.setEffortPick(sessionId, effort);
    await ensureClaudeProcess(
      connections,
      '',
      workingDir,
      sessionId,
      inputMode,
      bridge,
      typeof model === 'string' && model !== '' ? model : undefined,
    );
    if (!connections.getSession(sessionId)?.process) return fail(500, 'The CLI did not start');
    const turnEnds = turnEndCount(sessionId);
    if (!sendMessageToProcess(connections, sessionId, text)) return fail(409, 'The CLI is not accepting input right now');
    if (typeof title === 'string' && normalizeSessionName(title) !== '') {
      // The name is not waited for: it can take long, and an answer that comes late looks to the caller like a failed start
      // of a session that is running. A name that cannot be written now is not worth failing the start for either.
      void renameSessionThroughCli(connections, sessionId, normalizeSessionName(title), workingDir).catch(() => undefined);
    }
    return { status: 200, body: { ok: true, turnEnds } };
  } catch (err) {
    return fail(500, err instanceof Error ? err.message : String(err));
  }
}

/** `await_turn_end { sessionId, after, waitMs }`: answered when more turns than `after` have ended, or when `waitMs` is up. */
async function awaitTurnEnd(request: Record<string, unknown>): Promise<SessionControlRouteResult> {
  const { sessionId, after, waitMs } = request;
  if (typeof sessionId !== 'string' || sessionId === '') return fail(400, 'sessionId is required');
  const seen = typeof after === 'number' && Number.isFinite(after) ? after : 0;
  const wait = typeof waitMs === 'number' && Number.isFinite(waitMs) ? Math.min(waitMs, MAX_WAIT_MS) : MAX_WAIT_MS;
  const { ended, turnEnds } = await waitForTurnEnd(sessionId, seen, wait);
  return { status: 200, body: { ok: true, ended, turnEnds } };
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
export async function handleSessionControl(
  connections: ConnectionManager,
  rawBody: string,
  deps?: { bridge: Bridge },
): Promise<SessionControlRouteResult> {
  let request: Record<string, unknown> | undefined;
  try {
    const parsed = JSON.parse(rawBody);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) request = parsed as Record<string, unknown>;
  } catch {
    request = undefined;
  }
  if (request?.action === 'capabilities') return { status: 200, body: { ok: true, actions: [...SUPPORTED_ACTIONS] } };
  if (request?.action === 'start_session') return startSession(connections, request, deps?.bridge);
  if (request?.action === 'await_turn_end') return awaitTurnEnd(request);
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
