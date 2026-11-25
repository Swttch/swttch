import { findLiveCliForSession } from './cli-registry';
// The header the /internal/* routes read the token from (HTTP_AUTH_HEADER in ws-server, which this module cannot import).
const AUTH_HEADER = 'x-ccg-token';

/** What a message typed in one backend's tab needs to reach a session another backend runs. */
export interface ForwardedMessage {
  text: string;
  attachments?: unknown[];
  messageUuid?: string;
}

/**
 * - `forwarded`: the backend that runs the session's CLI took the request.
 * - `no_holder`: no other live backend runs this session (or none can be reached), so the caller starts the CLI itself.
 * - `held_but_unreachable`: another live backend runs it, but it did not take the request; starting a second CLI would
 *   put two writers on one session, so the caller tells the person instead.
 */
export type ForwardResult = 'forwarded' | 'no_holder' | 'held_but_unreachable';

const FORWARD_TIMEOUT_MS = 10_000;

/**
 * A session's CLI belongs to the backend that started it: only that backend can write to the CLI's stdin. A tab of another
 * IDE window sits on a different backend, so what a person does there (a message, an interrupt, an answer to a question)
 * is handed to the holding backend through the route it already offers other programs on this machine
 * (`/internal/session-control`, found through the CLI registry). `request` is that route's body without the session id.
 */
export async function forwardToHolder(sessionId: string, request: { action: string } & Record<string, unknown>): Promise<ForwardResult> {
  return (await callHolder(sessionId, request)).result;
}

/**
 * {@link forwardToHolder} with the holding backend's answer kept, and a wait of the caller's choosing (a `release` can
 * take longer than a message: it may wait for a turn to end).
 */
export async function callHolder(
  sessionId: string,
  request: { action: string } & Record<string, unknown>,
  timeoutMs: number = FORWARD_TIMEOUT_MS,
): Promise<{ result: ForwardResult; body?: Record<string, unknown> }> {
  const conflict = findLiveCliForSession(sessionId);
  if (!conflict?.ownerAlive) return { result: 'no_holder' };
  const control = conflict.entry.control;
  // An older holding backend wrote no address into the registry: there is no way to reach it.
  if (!control) return { result: 'held_but_unreachable' };
  try {
    const response = await fetch(`http://127.0.0.1:${control.port}/internal/session-control`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [AUTH_HEADER]: control.token },
      body: JSON.stringify({ sessionId, ...request }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      console.error('[node-backend]', `Holding backend refused the forwarded ${request.action} for ${sessionId}: ${response.status}`);
      return { result: 'held_but_unreachable' };
    }
    let body: Record<string, unknown> | undefined;
    try {
      const parsed = (await response.json()) as unknown;
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
    } catch {
      body = undefined;
    }
    return { result: 'forwarded', ...(body ? { body } : {}) };
  } catch (err) {
    console.error('[node-backend]', `Could not hand the ${request.action} for ${sessionId} to its holding backend:`, err);
    return { result: 'held_but_unreachable' };
  }
}

/**
 * Whether another live backend runs this session's CLI, by what the CLI registry says. Not by whether that backend
 * answers: one too old to be asked, or hung, is still the one that holds the session, and the person has to be told so.
 */
export function isHeldByAnotherBackend(sessionId: string): boolean {
  const held = findLiveCliForSession(sessionId);
  return !!held?.ownerAlive && held.entry.owner.pid !== process.pid;
}

/** A message typed in a tab whose backend does not hold the session's CLI. */
export function forwardMessageToHolder(sessionId: string, message: ForwardedMessage): Promise<ForwardResult> {
  return forwardToHolder(sessionId, {
    action: 'send_message',
    text: message.text,
    ...(message.attachments?.length ? { attachments: message.attachments } : {}),
    ...(message.messageUuid ? { messageUuid: message.messageUuid } : {}),
  });
}

/** What the holding backend says of a session: what its screens report, and whether it knows a turn to be in flight. */
export interface HolderActivity {
  activity?: string;
  /** When the turn in flight began, null when there is none; absent when the holding backend is too old to say. */
  turnStartedAt?: number | null;
  /** The permission mode its CLI runs under (null when it has none); absent when the holding backend is too old to say. */
  inputMode?: string | null;
}

/**
 * Ask the backend that holds a session's CLI what it is doing with it.
 * Undefined when there is no such backend, it cannot be reached, or it does not know the question (an older one).
 */
export async function askHolderActivity(sessionId: string): Promise<HolderActivity | undefined> {
  const control = findLiveCliForSession(sessionId);
  if (!control?.ownerAlive || !control.entry.control) return undefined;
  const { port, token } = control.entry.control;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/internal/session-control`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [AUTH_HEADER]: token },
      body: JSON.stringify({ sessionId, action: 'activity' }),
      signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
    });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { activity?: unknown; turnStartedAt?: unknown; inputMode?: unknown };
    return {
      ...(typeof body.activity === 'string' ? { activity: body.activity } : {}),
      ...(typeof body.turnStartedAt === 'number' || body.turnStartedAt === null ? { turnStartedAt: body.turnStartedAt } : {}),
      ...(typeof body.inputMode === 'string' || body.inputMode === null ? { inputMode: body.inputMode } : {}),
    };
  } catch {
    return undefined;
  }
}
