import type { ConnectionManager } from './connection-manager';
import type { Bridge } from '../bridge/bridge-interface';
import { turnEndCount, waitForTurnEnd } from '../core/features/turnEnds';
import {
  CLI_FLAG_TO_INPUT_MODE,
  ensureClaudeProcess,
  releaseClaudeSession,
  sendControlResponseToProcess,
  sendInterruptToProcess,
  sendMessageToProcess,
  sendSetModelToProcess,
  sendSetPermissionModeToProcess,
} from '../core/claude-process';
import { MessageType, SessionActivity } from '../shared';
import { buildControlResponse } from '../core/control-response';
import { normalizeSessionName, renameSessionThroughCli } from '../core/features/cli-rename';
import { followSessionTranscript } from '../core/features/sessionTranscriptFollower';

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
 *   send_message  { text, attachments?, messageUuid? }  hand the CLI a user message (a tab of another IDE window's backend sends here, see forward-to-holder.ts)
 *   answer_tool   { toolUseId, approved, updatedInput?, updatedPermissions?, reason? }  answer the question or permission prompt the CLI raised for that tool call (a tab of another IDE window's backend sends here: its card knows only the tool call)
 *   activity                        what the session is doing: its `activity` (running, awaiting, idle ...), `turnStartedAt` (null when no turn is in flight) and `inputMode` (the permission mode of its CLI), for another backend's tab that follows the session
 *   set_model     { model }         switch the model of the running CLI
 *   set_permission_mode { mode }    one of the CLI's own mode names (default, acceptEdits, plan, auto, bypassPermissions)
 *   rename        { title }         give the session a name, the way this app renames one (see `handleSessionControl`)
 *   release       { interrupt? }    stop this backend's CLI for the session and keep none, so another backend can take the session over (see `releaseSession`)
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
    case 'answer_tool':
    case 'activity':
    case 'set_model':
    case 'set_permission_mode':
      break;
    default:
      return fail(400, `Unknown action: ${action}`);
  }
  if (!connections.getSession(sessionId)?.process) return fail(404, 'This backend holds no process for that session');
  // `turnStartedAt` is this backend's own knowledge of a turn in flight (from the CLI's events, whatever screens are
  // open), which a session nobody has open here still has; `activity` is what the screens said.
  if (action === 'activity') {
    return {
      status: 200,
      body: {
        ok: true,
        activity: connections.getSession(sessionId)?.activity ?? SessionActivity.Idle,
        turnStartedAt: connections.getTurnStartedAt(sessionId),
        // The permission mode its CLI runs under, which a backend that takes the session over keeps (not its own default).
        inputMode: connections.getInputMode(sessionId),
      },
    };
  }

  if (action === 'interrupt') {
    sent = sendInterruptToProcess(connections, sessionId);
  } else if (action === 'send_message') {
    if (typeof request.text !== 'string' || request.text === '') return fail(400, 'text is required');
    if (request.attachments !== undefined && !Array.isArray(request.attachments)) return fail(400, 'attachments must be an array');
    const messageUuid = typeof request.messageUuid === 'string' && request.messageUuid !== '' ? request.messageUuid : undefined;
    sent = sendMessageToProcess(connections, sessionId, request.text, request.attachments as never, messageUuid);
    // The CLI does not echo what it is handed, so the screens showing this session would see
    // Claude answer a message that never appeared. Tell them, the way a message sent from
    // another tab is told.
    if (sent) {
      connections.broadcastToSession(sessionId, MessageType.USER_MESSAGE_BROADCAST, { content: request.text, sessionId });
    }
  } else if (action === 'answer_tool') {
    if (typeof request.toolUseId !== 'string' || request.toolUseId === '') return fail(400, 'toolUseId is required');
    if (typeof request.approved !== 'boolean') return fail(400, 'approved is required');
    if (request.updatedInput !== undefined && (request.updatedInput === null || typeof request.updatedInput !== 'object' || Array.isArray(request.updatedInput))) {
      return fail(400, 'updatedInput must be an object');
    }
    if (request.updatedPermissions !== undefined && !Array.isArray(request.updatedPermissions)) return fail(400, 'updatedPermissions must be an array');
    const open = connections.findOpenRequestByToolUseId(sessionId, request.toolUseId);
    if (!open) return fail(404, 'No open request for that tool call');
    sent = sendControlResponseToProcess(
      connections,
      sessionId,
      buildControlResponse(open.requestId, {
        approved: request.approved,
        updatedInput: request.updatedInput as Record<string, unknown> | undefined,
        updatedPermissions: request.updatedPermissions as never,
        reason: typeof request.reason === 'string' ? request.reason : undefined,
      }),
    );
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
const SUPPORTED_ACTIONS = ['interrupt', 'send_message', 'answer_tool', 'activity', 'set_model', 'set_permission_mode', 'rename', 'start_session', 'await_turn_end', 'release'];

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

/** How long `release` waits for an interrupted turn to end before it stops the CLI anyway. */
const RELEASE_INTERRUPT_WAIT_MS = 8_000;

/**
 * `release { sessionId, interrupt? }`: stop this backend's CLI for the session and start no other, so that another
 * backend (the one whose tab asked to take the session over) can run it. With `interrupt`, a turn in flight is
 * interrupted first and given a moment to end cleanly, so the transcript holds what was done up to that point.
 * Answered once the CLI is gone.
 */
async function releaseSession(connections: ConnectionManager, request: Record<string, unknown>): Promise<SessionControlRouteResult> {
  const { sessionId, interrupt } = request;
  if (typeof sessionId !== 'string' || sessionId === '') return fail(400, 'sessionId is required');
  if (!connections.getSession(sessionId)?.process) return fail(404, 'This backend holds no process for that session');
  try {
    if (interrupt === true && connections.getTurnStartedAt(sessionId) !== null) {
      const before = turnEndCount(sessionId);
      if (sendInterruptToProcess(connections, sessionId)) await waitForTurnEnd(sessionId, before, RELEASE_INTERRUPT_WAIT_MS);
    }
    if (!(await releaseClaudeSession(connections, sessionId))) return fail(404, 'This backend holds no process for that session');
    // The screens here showed a session this backend ran, and so never followed its transcript. From now on another
    // backend runs it: they follow it, which is also how they learn that it is held elsewhere (see `setHeldElsewhere`).
    const session = connections.getSession(sessionId);
    for (const connectionId of session?.subscribers ?? []) {
      void followSessionTranscript(connectionId, sessionId, session?.workingDir ?? '', connections);
    }
    return { status: 200, body: { ok: true } };
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
  if (request?.action === 'release') return releaseSession(connections, request);
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
