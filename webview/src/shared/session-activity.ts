/**
 * What a session is doing, as far as a session list needs to care (issue #449).
 *
 * One field rather than a set of booleans, because the states are exclusive and
 * the row has to pick exactly one marker. Separate flags would let impossible
 * pairs exist — running and awaiting at once — and the rule for which wins
 * would then have to live in every surface that draws a row.
 *
 * Only the backend can answer this. A session list shows conversations that may
 * be running in a tab this webview knows nothing about, so the state travels
 * from the one process that sees all of them.
 */
export enum SessionActivity {
  /** Nothing in flight, and nothing finished that the user has not seen. */
  Idle = 'idle',
  /** A turn is in flight. */
  Running = 'running',
  /** The CLI asked the user something and is blocked until it is answered. */
  Awaiting = 'awaiting',
  /**
   * The last turn finished and nobody has looked at the session since.
   *
   * Cleared by [MessageType.MARK_SESSION_READ], which each host sends under the
   * condition it already uses for its own unread badge: a browser tab becoming
   * visible, a JetBrains editor tab becoming the selected one.
   */
  Done = 'done',
}

/** Session ids by what each one is doing. Sessions not listed are [SessionActivity.Idle]. */
export type SessionActivityMap = Record<string, SessionActivity>;

/**
 * What a session is doing, from the two things a chat screen already knows.
 *
 * The one definition of the value, so that everything showing a session says the
 * same thing: the streaming animation at the foot of the transcript, the browser
 * favicon, the IDE tab icon, and the row in the session list.
 *
 * Both arms are the conditions those surfaces are already drawn under, not a
 * second reading of them. [SessionActivity.Running] is exactly the condition the
 * streaming animation is drawn under (`isStreaming && !isAwaitingUser`), and
 * [SessionActivity.Awaiting] is exactly "a panel is asking the user to answer
 * something" — a tool permission, a plan approval, or a question.
 *
 * [SessionActivity.Done] is deliberately not produced here. Whether a finished
 * turn is still unread is not something a chat screen knows about itself: the
 * backend derives it from the move into [SessionActivity.Idle], and clears it
 * when a host reports that the user has looked.
 */
export function resolveSessionActivity(
  isStreaming: boolean,
  isAwaitingUser: boolean,
): SessionActivity {
  if (isAwaitingUser) return SessionActivity.Awaiting;
  if (isStreaming) return SessionActivity.Running;
  return SessionActivity.Idle;
}
