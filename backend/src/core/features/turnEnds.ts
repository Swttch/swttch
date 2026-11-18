/**
 * How many turns of a session have ended since this backend began holding it, and who is waiting for the next one.
 *
 * The session-management MCP starts a session through this backend (see `start_session` in
 * `ws/session-control-route.ts`) and then wants to know when the first turn of that session ends, so it can tell the
 * session that started it. It asks with a request that is answered when a turn ends, or when a wait time runs out.
 *
 * A count is kept, not only the waiters: a turn can end between two requests of the same program, and the next request
 * names the count it has already seen, so that an end in between is answered at once instead of being missed.
 */

const counts = new Map<string, number>();
const waiters = new Map<string, Set<() => void>>();

/** How many turns of the session have ended since this backend began. */
export function turnEndCount(sessionId: string): number {
  return counts.get(sessionId) ?? 0;
}

/** A turn of the session ended (its CLI sent the `result`, or its process died). Wakes everyone waiting for it. */
export function recordTurnEnd(sessionId: string): void {
  counts.set(sessionId, turnEndCount(sessionId) + 1);
  const waiting = waiters.get(sessionId);
  if (!waiting) return;
  waiters.delete(sessionId);
  for (const wake of waiting) wake();
}

/**
 * Answers when more turns than `after` have ended, or after `waitMs`, whichever comes first.
 * `ended` says which of the two it was; `turnEnds` is the count to name in the next request.
 */
export function waitForTurnEnd(
  sessionId: string,
  after: number,
  waitMs: number,
): Promise<{ ended: boolean; turnEnds: number }> {
  if (turnEndCount(sessionId) > after) return Promise.resolve({ ended: true, turnEnds: turnEndCount(sessionId) });
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wake = () => {
      if (timer) clearTimeout(timer);
      resolve({ ended: true, turnEnds: turnEndCount(sessionId) });
    };
    let set = waiters.get(sessionId);
    if (!set) waiters.set(sessionId, (set = new Set()));
    set.add(wake);
    timer = setTimeout(() => {
      waiters.get(sessionId)?.delete(wake);
      resolve({ ended: false, turnEnds: turnEndCount(sessionId) });
    }, Math.max(0, waitMs));
    timer.unref?.();
  });
}

/** Forget everything. For tests. */
export function resetTurnEnds(): void {
  counts.clear();
  waiters.clear();
}
