/**
 * Ask the CLI to name a new session, the way the terminal does on its first prompt.
 *
 * In the terminal the CLI names a session by itself. A CLI run with `-p`, which is
 * how this app runs it, does not: it leaves the naming to the host, which asks with
 * a `control_request{subtype:"generate_session_title", description, persist:true}`.
 * With `persist` the CLI writes the title itself, as an `ai-title` entry in the
 * transcript, which every client reads (see extractSessionInfo). That is the
 * request the Claude Code extensions for VS Code and Cursor and the desktop app send.
 *
 * `generate_session_title` is not documented, so using it is a DELIBERATE EXCEPTION
 * to the core principle against depending on undocumented protocols; the reasons
 * and the limits are in docs/principle-exceptions/562-generate-session-title.md.
 * It stays a convenience rather than a dependency: with no official command to fall
 * back on, every failure leaves the session under the name its transcript already
 * gives it (its first prompt), which is how it was listed before this existed.
 *
 * WHEN, matching the VS Code extension: right after the first prompt of a new
 * session is handed to the CLI, without waiting for the answer, so the title turns up
 * while the first reply streams. If no title came, the prompts that follow try
 * again, up to three requests in all. A session that was already running when this
 * backend started (a resumed one) is not asked, however untitled.
 */
import type { ConnectionManager } from '../../ws/connection-manager';
import { ACCOUNT_POOL_CONTINUE_REMINDER, MessageType } from '../../shared';
import { sendControlRequestToProcess } from '../claude-process';
import {
  cancelControlResponse,
  nextControlRequestId,
  waitForControlResponse,
} from '../control-response-waiter';
import { generateSessionTitlesEnabled } from './sessionTitleSettings';
import { announceGeneratedTitle, watchSessionTitle } from './session-title-watcher';

/** Naming is a model call, so the answer takes seconds; this only bounds a CLI that never answers. */
const GENERATE_TIMEOUT_MS = 30_000;

/** Requests per session, the first included. */
const MAX_REQUESTS = 3;

/** What a CLI that predates the request answers with. */
const UNSUPPORTED_REQUEST = /unsupported control request subtype/i;

interface TitleState {
  /** Requests sent for the session so far. */
  requests: number;
  /** A title came back, or the CLI cannot be asked: nothing more to try. */
  settled: boolean;
}

/** Per session, for as long as this backend runs. */
const states = new Map<string, TitleState>();

/** Test seam: forget what every session has been asked. */
export function resetSessionTitleStates(): void {
  states.clear();
}

interface GenerateTitleResponse {
  title?: unknown;
}

/**
 * Called after [prompt] has been handed to [sessionId]'s CLI. Never throws and
 * never waits: the title is for the list, not for the send.
 */
export function requestSessionTitleAfterSend(
  connections: ConnectionManager,
  sessionId: string,
  prompt: string,
  isNewSession: boolean,
  workingDir: string,
): void {
  void requestSessionTitle(connections, sessionId, prompt, isNewSession, workingDir).catch((err) => {
    console.error('[node-backend]', 'session title request failed:', err);
  });
}

/**
 * The composer puts the file open in the IDE (or the selected lines) in front of the
 * message as one of these tags. The user did not write it, so it is not what names
 * the session: a title built from it follows the open file instead of the question.
 * The wording of the tags is in webview/src/hooks/ideContextTag.ts.
 */
const IDE_CONTEXT_TAGS = /<(ide_opened_file|ide_selection)>[\s\S]*?<\/\1>/g;

/** What the user wrote, without the IDE context the composer added in front of it. */
export function withoutIdeContext(prompt: string): string {
  return prompt.replace(IDE_CONTEXT_TAGS, '').trim();
}

async function requestSessionTitle(
  connections: ConnectionManager,
  sessionId: string,
  sentPrompt: string,
  isNewSession: boolean,
  workingDir: string,
): Promise<void> {
  const prompt = withoutIdeContext(sentPrompt);
  // Nothing the user wrote: there is nothing to name the session after.
  if (!prompt) return;
  // The CLI names a session after what was said in it, never after a command or
  // a reminder this app sent on the user's behalf.
  if (prompt.startsWith('/')) return;
  if (prompt.includes(ACCOUNT_POOL_CONTINUE_REMINDER)) return;
  if (!(await generateSessionTitlesEnabled(workingDir))) return;

  let state = states.get(sessionId);
  if (isNewSession) {
    state = { requests: 0, settled: false };
    states.set(sessionId, state);
  } else if (!state || state.settled || state.requests === 0 || state.requests >= MAX_REQUESTS) {
    return;
  }
  state.requests += 1;
  const asking = state;

  // The answer to the request below is not what shows the title: the CLI answers
  // only after its own model call ends, which can be past our wait or never. The
  // title is in the transcript whenever the CLI records it, and this is what
  // picks it up from there (#638).
  watchSessionTitle(connections, sessionId, workingDir, () => {
    asking.settled = true;
  });

  const requestId = nextControlRequestId('generate_session_title');
  const waiting = waitForControlResponse<GenerateTitleResponse>(requestId, GENERATE_TIMEOUT_MS);
  const written = sendControlRequestToProcess(connections, sessionId, requestId, {
    subtype: 'generate_session_title',
    description: prompt,
    persist: true,
  });
  if (!written) {
    cancelControlResponse(requestId);
    // Settle the abandoned waiter here, so it neither lingers nor surfaces as an
    // unhandled rejection. Nothing was sent, so there is nothing to report.
    await waiting.catch(() => undefined);
    return;
  }

  try {
    const response = await waiting;
    const title = typeof response?.title === 'string' ? response.title.trim() : '';
    if (!title) return;
    asking.settled = true;
    // The name shown is the one resolveSessionTitle gives from the transcript, which
    // the CLI has just written the title to. A CLI that answers with a title without
    // recording it leaves nothing there to resolve, so the answer itself is shown.
    if (await announceGeneratedTitle(connections, sessionId, workingDir)) return;
    connections.broadcastToAll(MessageType.SESSIONS_UPDATED, {
      action: 'rename',
      session: { sessionId, title, generated: true },
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (UNSUPPORTED_REQUEST.test(reason)) {
      // This CLI cannot be asked, now or on a later prompt.
      asking.settled = true;
    }
    console.error('[node-backend]', `generate_session_title unavailable for ${sessionId}: ${reason}`);
  }
}
