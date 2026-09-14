import { Claude } from '../claude';
import { getSessionEntry } from './getSessionEntry';
import type { ActiveSessionAgent, ActiveSessionEntry, ActiveSessionsPayload } from '../../shared';

/** How long the CLI gets to answer. */
const AGENTS_TIMEOUT_MS = 10_000;

/**
 * Parse the CLI's stdout as the array it promises.
 *
 * Tolerates text printed around the JSON (a shell wrapper's notice, a warning)
 * by taking the outermost bracketed span, because failing the whole panel over
 * a stray line would be a worse answer than the list the CLI did produce.
 */
function parseAgents(stdout: string): ActiveSessionAgent[] {
  const trimmed = stdout.trim();
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start === -1 || end <= start) return [];
  const parsed: unknown = JSON.parse(trimmed.slice(start, end + 1));
  return Array.isArray(parsed) ? (parsed as ActiveSessionAgent[]) : [];
}

/**
 * The Claude sessions running on this machine right now, each paired with the
 * row the session list would show for it.
 *
 * `claude agents --json` is the official command, so the GUI reads the same
 * list a user reads in their terminal. Nothing here depends on how the CLI
 * delivers a message between sessions.
 *
 * The list is genuinely live: measured twice 34 minutes apart in one sitting,
 * it went from three sessions to four. Callers must re-read it rather than
 * trust a cached answer.
 *
 * The titles come from {@link getSessionEntry}, which is what the session list
 * itself calls — a name that differed from the one the session dropdown shows
 * would make the user pick a row they cannot find anywhere else. A session
 * whose transcript cannot be read simply has no entry, and the webview falls
 * back to what the CLI gave it.
 */
export async function listActiveSessions(cwd?: string): Promise<ActiveSessionsPayload> {
  const { stdout } = await Claude.exec(['agents', '--json'], { timeout: AGENTS_TIMEOUT_MS, cwd });
  const agents = parseAgents(stdout);

  const entries: Record<string, ActiveSessionEntry> = {};
  await Promise.all(
    agents.map(async (agent) => {
      if (typeof agent?.sessionId !== 'string' || typeof agent?.cwd !== 'string') return;
      const entry = await getSessionEntry(agent.cwd, agent.sessionId);
      // Spread rather than assign: the payload type carries an index signature
      // so a field we do not name still reaches the webview, and an interface
      // has no implicit one to satisfy it. The spread hands over an object
      // literal, which does, and copies every field either way.
      if (entry) entries[agent.sessionId] = { ...entry };
    }),
  );

  return { agents, entries };
}
