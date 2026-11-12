import type { LoadedMessageDto } from '@/types';
import { toolResultText } from '../ToolRenderers/common/toolStatus';

/**
 * Sessions a conversation started through the session-management MCP (`@swttch/session-manager-mcp`).
 *
 * That server has the desktop app's session tools under its own name (`mcp__swttch_session__…` where the
 * desktop app has `mcp__ccd_session__…`), with the same arguments. What differs is the answer of a start: the
 * desktop app names the session in its own id (`local_…`) and keeps the rest in its own files, while this
 * server names the CLI session itself and the folder it runs in. So everything needed to open a session it
 * started is in the conversation that started it, and nothing has to be looked up.
 */

/** The desktop app's tool and the session-management MCP's, which are the same tool. */
const START_SESSION_TOOLS = new Set(['mcp__ccd_session__start_session', 'mcp__swttch_session__start_session']);

export function isStartSessionTool(name: string): boolean {
  return START_SESSION_TOOLS.has(name);
}

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StartedSession {
  /** The CLI session: the id this app's own sessions are named by. */
  sessionId: string;
  /** The folder it runs in, when the answer or the call said. */
  cwd?: string;
  /** The title it was started with. */
  title?: string;
}

/**
 * The session a start answered with, or undefined when the answer is not the session-management MCP's: the
 * desktop app's answer (its own id), a refusal, or a call still running.
 */
export function startedSessionOf(answer: string, input?: Record<string, unknown>): StartedSession | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(answer);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== 'object') return undefined;
  const { session_id: sessionId, cwd } = parsed as { session_id?: unknown; cwd?: unknown };
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) return undefined;
  const text = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value : undefined);
  // An answer from before the server reported the folder: the call's own `cwd`, when it gave one.
  return { sessionId, cwd: text(cwd) ?? text(input?.cwd), title: text(input?.title) };
}

/** The text of a `tool_result` block as the CLI records it: a bare string, or a list of text blocks. */
function resultBlockText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : ''))
    .join('');
}

/**
 * Every session the conversation started through the session-management MCP, by its id.
 *
 * Reads the conversation in either shape it is held in: with each call's answer already attached to the call
 * (what the chat draws from), or as the CLI records it, where the answer is a `tool_result` block of a later
 * `user` entry that names the call by its id.
 */
export function startedSessionsIn(messages: LoadedMessageDto[] | undefined): Map<string, StartedSession> {
  const starts = new Map<string, { input?: Record<string, unknown>; answer?: string }>();
  for (const message of messages ?? []) {
    const content = message.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block.type === 'tool_use') {
        const call = block as unknown as { id?: string; name?: string; input?: Record<string, unknown>; tool_result?: LoadedMessageDto };
        if (!call.id || !call.name || !isStartSessionTool(call.name)) continue;
        starts.set(call.id, { input: call.input, answer: call.tool_result ? toolResultText(call.tool_result) : undefined });
      } else if (block.type === 'tool_result') {
        const result = block as unknown as { tool_use_id?: string; content?: unknown };
        const start = result.tool_use_id ? starts.get(result.tool_use_id) : undefined;
        if (start && start.answer === undefined) start.answer = resultBlockText(result.content);
      }
    }
  }
  const started = new Map<string, StartedSession>();
  for (const { input, answer } of starts.values()) {
    const session = answer ? startedSessionOf(answer, input) : undefined;
    if (session) started.set(session.sessionId, session);
  }
  return started;
}

/** A link to a session as the session-management MCP asks Claude to write it: `[title](#session_<id>)`. */
const SESSION_HREF = /^#?session_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** The session a markdown link points at, or undefined when it points anywhere else. */
export function sessionLinkIdOf(href: string | undefined): string | undefined {
  return href ? SESSION_HREF.exec(href)?.[1] : undefined;
}

/** Whether a sender id of a message from another session is a CLI session id (the session-management MCP's) rather than the desktop app's. */
export function isCliSessionId(id: string): boolean {
  return SESSION_ID.test(id);
}
