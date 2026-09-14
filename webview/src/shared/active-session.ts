/**
 * The other Claude sessions running on this machine, as the `@@` composer panel
 * reads them.
 *
 * The list comes from the official `claude agents --json`, so the GUI sees the
 * same sessions a user sees in their terminal. Nothing here depends on how the
 * CLI carries a message from one session to another.
 */

/**
 * One entry of `claude agents --json`, as the CLI spells it.
 *
 * The named fields are the ones measured so far. The index signature keeps a
 * field we have not seen from being narrowed away on the trip to the webview
 * (raw data preservation): the CLI may add more, and a value we do not
 * recognise must still arrive.
 */
export interface ActiveSessionAgent {
  pid: number;
  cwd: string;
  /** `interactive` on every session measured so far. Not an enum on purpose. */
  kind: string;
  startedAt: number;
  sessionId: string;
  /** The address. A message is sent to this, not to the pid or a socket path. */
  name: string;
  [key: string]: unknown;
}

/**
 * The session-list row for one agent — the same row the session dropdown draws.
 *
 * Built by `getSessionEntry`, which is what the session list itself calls, so a
 * session is named here exactly as it is named there. A name that differed
 * would have the user pick a row they cannot find anywhere else.
 *
 * `title` is the raw first prompt (or the user's own rename). It still needs
 * `toTitle` before it is shown, the same as every other session row.
 */
export interface ActiveSessionEntry {
  sessionId: string;
  sessionDir: string;
  title: string;
  lastTimestamp: string | null;
  createdAt: string;
  messageCount: number | null;
  isSidechain: boolean;
  [key: string]: unknown;
}

/** Payload of the GET_ACTIVE_SESSIONS ACK response. */
export interface ActiveSessionsPayload {
  /** The `claude agents --json` array, unedited, including the caller itself. */
  agents: ActiveSessionAgent[];
  /**
   * The row for each agent whose transcript could be read, keyed by sessionId.
   *
   * Kept BESIDE the agents rather than merged into them so the CLI's own array
   * travels exactly as the CLI wrote it. An agent with no row here is still a
   * real session: it is shown with what the CLI gave us.
   */
  entries: Record<string, ActiveSessionEntry>;
}
