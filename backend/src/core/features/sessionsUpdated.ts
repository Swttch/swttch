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

/**
 * How many pieces of news were announced, a number that rises with each. A list read that began at one value
 * of it has missed nothing the screens were told since while the value is still the same, which is what lets a
 * request share a read that is already running instead of waiting for the next one.
 */
let newsCount = 0;

export function sessionNewsCount(): number {
  return newsCount;
}

/** Forget the last number given and the news counted. For tests. */
export function resetSessionEventClock(): void {
  lastTs = 0;
  newsCount = 0;
}

/**
 * What can be told about a session, besides the `ts` that [announceSessionsUpdated] adds.
 *
 * - `create`: a session came to exist (`session` is its whole row).
 * - `update`: some of a session's items changed (`session` is `sessionId` and the changed items).
 * - `delete`: a session is gone (`session` is its `sessionId`).
 * - `refresh`: something changed that the others cannot say; read the list again.
 */
export interface SessionsUpdatedBody {
  action: string;
  session?: Record<string, unknown>;
}

/**
 * Who gets the news, besides being told to skip one connection.
 *
 * News about one session is for the screens whose list can hold it, which [sessionDirs] (the folders the
 * session lives in) decides; a screen that lists another folder has no use for it. Without [sessionDirs]
 * every screen gets it.
 */
export interface SessionsUpdatedAudience {
  exceptConnectionId?: string;
  sessionDirs?: string[];
  /**
   * The `ts` to send, for news that is a picture of the sessions as of a time before it is sent (a row read from
   * a transcript): it carries the time the read began, so what was said while it was read still goes onto it.
   */
  ts?: number;
}

/**
 * Tell the screens that sessions changed, with the `ts` of the news. Returns that `ts`.
 *
 * The one place session news leaves this backend, so none leaves without a number.
 */
export function announceSessionsUpdated(
  connections: ConnectionManager,
  body: SessionsUpdatedBody,
  audience: SessionsUpdatedAudience = {},
): number {
  newsCount++;
  const ts = audience.ts ?? nextSessionEventTs();
  const payload = { ...body, ts };
  const dirs = (audience.sessionDirs ?? []).filter((dir) => dir !== '');
  if (dirs.length > 0) {
    connections.broadcastToListsHolding(MessageType.SESSIONS_UPDATED, payload, dirs, audience.exceptConnectionId);
  } else {
    connections.broadcastToAll(MessageType.SESSIONS_UPDATED, payload, audience.exceptConnectionId);
  }
  return ts;
}
