import type { ConnectionManager } from '../../ws/connection-manager';
import { MessageType } from '../../shared';
import { awaitSessionTranscript } from './awaitSessionTranscript';
import { announceSessionMark } from './announceSessionMark';
import { announceSessionCreated } from './announceSessionCreated';
import { announceSessionRequested, announceSessionStarting, dropSessionPlaceholder, placeholderSessionId } from './announceSessionStarting';
import { normalizeSessionName } from './cli-rename';
import { announceSessionsUpdated } from './sessionsUpdated';

/**
 * The tools of the session-management MCP whose success changes what a session
 * list shows: a new row, a row that moves under or out from under another, a row
 * that is archived, removed or renamed.
 */
const LIST_CHANGING_TOOL =
  /^mcp__swttch_session(?:_mgmt)?__(start_session|detach_session|archive_session|unarchive_session|delete_session|set_session_title)$/;

/** What a call named, kept until its answer is seen: the tool, and the session it was aimed at when it names one. */
interface PendingCall {
  tool: string;
  sessionId?: string;
  /** The name a `set_session_title` call asked for. */
  title?: string;
  /** The row the screens were given for a session being started, until the answer names the real one. */
  placeholder?: { placeholderId: string; cwd: string; timer: ReturnType<typeof setTimeout> };
}

/** A start whose answer does not come (an interrupted turn) takes its placeholder row away after this long. */
const PLACEHOLDER_GIVE_UP_MS = 120_000;

/** Calls seen and not answered yet, by the id of the call. */
const pendingCalls = new Map<string, PendingCall>();

/**
 * Sessions announced as started whose transcript does not exist yet (the CLI writes it many seconds later). Such a
 * session is not a deleted one, so what is asked about missing transcripts leaves it out (see `isSessionStarting`).
 */
const startingSessions = new Set<string>();

/** Whether the session was just started and its transcript is not written yet. */
export function isSessionStarting(sessionId: string): boolean {
  return startingSessions.has(sessionId);
}

/** A call that is never answered (an interrupted turn) must not stay here for good. */
const MAX_PENDING_CALLS = 200;

interface ContentBlock {
  type?: unknown;
  id?: unknown;
  name?: unknown;
  input?: unknown;
  tool_use_id?: unknown;
  is_error?: unknown;
  content?: unknown;
}

function contentBlocksOf(event: Record<string, unknown>): ContentBlock[] {
  const message = event.message as { content?: unknown } | undefined;
  return message && Array.isArray(message.content) ? (message.content as ContentBlock[]) : [];
}

/** The text of a tool result, which the CLI hands over as a string or as text blocks. */
function resultTextOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block: { type?: unknown; text?: unknown }) =>
      block?.type === 'text' && typeof block.text === 'string' ? block.text : '',
    )
    .join('');
}

/** What `start_session` answered with: the session it started and the folder it runs in. */
function startedSessionOf(content: unknown): { sessionId: string; cwd: string } | null {
  try {
    const answer = JSON.parse(resultTextOf(content)) as { session_id?: unknown; cwd?: unknown };
    if (typeof answer.session_id === 'string' && typeof answer.cwd === 'string') {
      return { sessionId: answer.session_id, cwd: answer.cwd };
    }
  } catch {
    // Not the JSON answer of a start: nothing to wait for.
  }
  return null;
}

/**
 * Tell the session lists when a session of ours changed them through the
 * session-management MCP.
 *
 * The MCP is another program. When Claude starts a session with it, moves one
 * to the top level or archives one, nothing passes through this backend except
 * the tool call and its answer in the CLI's stream, so this reads those two. It
 * is given every stream event of every session this backend runs.
 *
 * A started session cannot be listed from its transcript at once: the list is read from the
 * transcripts and the new session's transcript appears many seconds after the tool answers. The
 * screens are therefore told at once with a row made of what is known (a provisional one), and again
 * with the row of the transcript when the file exists, the same wait a session started in a tab
 * uses. Every other change is on disk by the time the tool answers and is announced right away.
 *
 * Archiving or bringing a session back is announced as an `update` carrying the new mark of
 * that one session, so a screen that shows the session turns to its archived state at once,
 * without reading the list. Reading every list again is slow when several screens are open.
 *
 * A session the MCP changes from somewhere this backend does not run (a `claude`
 * in a terminal) is not seen here; the lists pick that up on their next refresh.
 *
 * [callerSessionId] is the session whose stream carried the event, and [callerWorkingDir] the folder it
 * works in. A call that names `self` means that session. The folder is what tells which screens the news is
 * for (the ones whose list can hold the session).
 */
export function announceSessionToolChanges(
  event: Record<string, unknown>,
  connections: ConnectionManager,
  callerSessionId?: string,
  callerWorkingDir?: string,
): void {
  if (event.type === 'assistant') {
    for (const block of contentBlocksOf(event)) {
      if (block.type !== 'tool_use' || typeof block.id !== 'string' || typeof block.name !== 'string') continue;
      const tool = LIST_CHANGING_TOOL.exec(block.name)?.[1];
      if (!tool) continue;
      if (pendingCalls.size >= MAX_PENDING_CALLS) pendingCalls.clear();
      const input = block.input as { title?: unknown; cwd?: unknown } | undefined;
      const title = input?.title;
      const pending: PendingCall = {
        tool,
        sessionId: sessionIdOfInput(block.input, callerSessionId),
        ...(typeof title === 'string' ? { title } : {}),
      };
      pendingCalls.set(block.id, pending);
      // The session is in the lists from the moment the call goes out, not from the moment it is answered.
      const cwd = typeof input?.cwd === 'string' && input.cwd !== '' ? input.cwd : callerWorkingDir;
      if (tool === 'start_session' && cwd && typeof title === 'string' && title.trim() !== '') {
        const placeholderId = placeholderSessionId(block.id);
        announceSessionRequested(connections, { placeholderId, cwd, title, startedBy: callerSessionId });
        const timer = setTimeout(() => {
          const call = pendingCalls.get(block.id as string);
          if (call?.placeholder) {
            dropSessionPlaceholder(connections, call.placeholder);
            call.placeholder = undefined;
          }
        }, PLACEHOLDER_GIVE_UP_MS);
        timer.unref?.();
        pending.placeholder = { placeholderId, cwd, timer };
      }
    }
    return;
  }

  if (event.type !== 'user') return;
  for (const block of contentBlocksOf(event)) {
    if (block.type !== 'tool_result' || typeof block.tool_use_id !== 'string') continue;
    const call = pendingCalls.get(block.tool_use_id);
    if (call === undefined) continue;
    const { tool } = call;
    pendingCalls.delete(block.tool_use_id);
    // The row made of the call is taken away when the answer comes, whether it names the real session or not.
    const placeholder = call.placeholder;
    if (placeholder) clearTimeout(placeholder.timer);
    // A refused or failed call changed nothing.
    if (block.is_error === true) {
      if (placeholder) dropSessionPlaceholder(connections, placeholder);
      continue;
    }

    if (tool === 'start_session') {
      const started = startedSessionOf(block.content);
      if (!started) {
        if (placeholder) dropSessionPlaceholder(connections, placeholder);
        continue;
      }
      // The screens are told the session is there at once, with a row made of what is known, because the CLI
      // writes its transcript a long while later. The row the transcript gives replaces it when the file
      // exists; and when no file ever comes (the session could not start) the screens are told it is not there.
      startingSessions.add(started.sessionId);
      void announceSessionStarting(connections, started, call.title).then(() => {
        // The real row is in the lists; the one made of the call goes.
        if (placeholder) dropSessionPlaceholder(connections, placeholder);
      });
      void awaitSessionTranscript(
        started.sessionId,
        started.cwd,
        () => {
          startingSessions.delete(started.sessionId);
          void announceSessionCreated(connections, started.sessionId, started.cwd);
        },
        () => {
          startingSessions.delete(started.sessionId);
          announceSessionsUpdated(
            connections,
            { action: 'delete', session: { sessionId: started.sessionId } },
            { sessionDirs: [started.cwd] },
          );
        },
      );
      continue;
    }

    if ((tool === 'archive_session' || tool === 'unarchive_session') && call.sessionId) {
      void announceSessionMark(call.sessionId, connections, dirOfCaller(call.sessionId, callerSessionId, callerWorkingDir));
      continue;
    }

    if (tool === 'set_session_title') {
      // The name as the CLI will keep it, which is what the list shows once it is read again.
      const title = call.title === undefined ? '' : normalizeSessionName(call.title);
      if (call.sessionId && title !== '') {
        const dir = dirOfCaller(call.sessionId, callerSessionId, callerWorkingDir);
        announceSessionsUpdated(
          connections,
          { action: 'update', session: { sessionId: call.sessionId, title } },
          { sessionDirs: dir ? [dir] : [] },
        );
        continue;
      }
    }

    announceSessionsUpdated(connections, { action: 'refresh' });
  }
}

/** The folder a session works in when it is the one whose stream carried the call, which is the one folder known. */
function dirOfCaller(
  sessionId: string,
  callerSessionId: string | undefined,
  callerWorkingDir: string | undefined,
): string | undefined {
  return sessionId === callerSessionId ? callerWorkingDir : undefined;
}

/** The session a call was aimed at: the id it named, or the calling session for `self`. */
function sessionIdOfInput(input: unknown, callerSessionId: string | undefined): string | undefined {
  const named = (input as { session_id?: unknown } | undefined)?.session_id;
  if (typeof named !== 'string' || named === '') return undefined;
  return named === 'self' ? callerSessionId : named;
}

/** Forget every call seen. For tests. */
export function resetSessionToolAnnouncer(): void {
  startingSessions.clear();
  for (const call of pendingCalls.values()) if (call.placeholder) clearTimeout(call.placeholder.timer);
  pendingCalls.clear();
}
