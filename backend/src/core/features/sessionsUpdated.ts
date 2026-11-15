import type { ConnectionManager } from '../../ws/connection-manager';
import { MessageType } from '../../shared';

/**
 * Where news about sessions stands among the other news: `ts`.
 *
 * Every screen shows its own copy of the session list, kept right by the news
 * this backend sends. The news reaches a screen in the order it was sent, but a
 * list the screen asked for may have been read before some news and arrive after
 * it, so the screen needs a number to tell which of the two is newer. That number
 * is this one, and it comes from this backend alone: tabs do not agree on what
 * time it is.
 *
 * It is the time in milliseconds, made to rise by at least one with every
 * number given, so that no two news share one and none goes back when the clock
 * does.
 */
let lastTs = 0;

export function nextSessionEventTs(): number {
  lastTs = Math.max(Date.now(), lastTs + 1);
  return lastTs;
}

/** Forget the last number given. For tests. */
export function resetSessionEventClock(): void {
  lastTs = 0;
}

/**
 * What can be told about a session, besides the `ts` that [announceSessionsUpdated] adds.
 *
 * - `create`: a session came to exist (`session` is its whole row).
 * - `update`: some of a session's items changed (`session` is `sessionId` and the items).
 * - `delete`: a session is gone.
 * - `refresh`: something changed that the others cannot say; read the list again.
 *
 * The actions the screens already knew (`started`, `upsert`, `rename`, `mark`) are still
 * accepted, until each is moved to one of these.
 */
export interface SessionsUpdatedBody {
  action: string;
  session?: Record<string, unknown>;
}

/**
 * Tell every connection (but [exceptConnectionId]) that sessions changed, with the
 * `ts` of the news. Returns that `ts`.
 *
 * The one place session news leaves this backend, so none leaves without a number.
 */
export function announceSessionsUpdated(
  connections: ConnectionManager,
  body: SessionsUpdatedBody,
  exceptConnectionId?: string,
): number {
  const ts = nextSessionEventTs();
  connections.broadcastToAll(MessageType.SESSIONS_UPDATED, { ...body, ts }, exceptConnectionId);
  return ts;
}
