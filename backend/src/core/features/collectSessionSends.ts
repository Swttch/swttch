import { loadActiveChain, type SessionMessage } from './loadSessionMessages';
import { collectPrompts } from './loadPromptHistory';
import type { SessionSend } from '../../shared';

/**
 * How much of a send the preview carries.
 *
 * The card it feeds draws four lines, so this has to cover four lines of a
 * reasonably wide card and no more. Bigger would put text nobody reads through
 * the socket once per send; smaller would cut a line the card has room for.
 */
export const SEND_PREVIEW_LIMIT = 400;

/** The text a `user` entry carries, ignoring non-text blocks. */
function textOf(entry: SessionMessage): string {
  const message = entry.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
    .filter(b => b.type === 'text')
    .map(b => (typeof b.text === 'string' ? b.text : ''))
    .join('\n');
}

/**
 * Trim a send down to a preview.
 *
 * Trailing whitespace goes, interior line breaks stay: the card draws the first
 * line differently from the rest, and flattening them would leave every
 * multi-line send reading as one run-on sentence.
 */
function previewOf(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > SEND_PREVIEW_LIMIT
    ? `${trimmed.slice(0, SEND_PREVIEW_LIMIT)}…`
    : trimmed;
}

/**
 * Every send the user typed in a session, as an index the rail can draw at once.
 *
 * Built on `collectPrompts` rather than a test of its own, so the rail and the
 * composer's history agree on what counts as something a human sent. That
 * predicate is a series of nets measured against real transcripts — in one
 * 9,326-line session, 1,281 of 1,345 `user` entries were tool_result plumbing —
 * and a second opinion here would show up as ticks the transcript has no bubble
 * for.
 *
 * Entries without a uuid are dropped, and this is the one place the two lists
 * part company. A message typed while a turn was running exists only as queue
 * bookkeeping, with no uuid to jump to; the transcript rebuilds those locally
 * (restoreQueuedMessages) under a key only it can produce. So the rail picks
 * them up from the loaded transcript instead of from here, and this index stays
 * what it claims to be: sends a jump can actually land on.
 */
export async function collectSessionSends(
  workingDir: string,
  targetSessionId: string,
): Promise<SessionSend[]> {
  const chain = await loadActiveChain(workingDir, targetSessionId);

  return collectPrompts(chain)
    .filter(entry => typeof entry.uuid === 'string')
    .map(entry => ({
      uuid: entry.uuid as string,
      timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : null,
      preview: previewOf(textOf(entry)),
    }));
}
