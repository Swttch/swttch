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
