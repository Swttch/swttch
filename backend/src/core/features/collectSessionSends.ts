import { loadPromptChain } from './loadSessionMessages';
import { collectPrompts } from './loadPromptHistory';
import { entryImageCount, entryText, typedPartOf, type SessionSend } from '../../shared';

/**
 * How much of a send the preview carries.
 *
 * The card it feeds draws four lines, so this has to cover four lines of a
 * reasonably wide card and no more. Bigger would put text nobody reads through
 * the socket once per send; smaller would cut a line the card has room for.
 */
export const SEND_PREVIEW_LIMIT = 400;

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
 * Built on `collectPrompts` rather than a test of its own, so the rail, the composer's history and the chat agree on
 * what counts as something the user sent, and on the name each send goes by (#735).
 */
export async function collectSessionSends(
  workingDir: string,
  targetSessionId: string,
): Promise<SessionSend[]> {
  // Built on the prompt chain: user entries, queue records and their attachments, which is all `collectPrompts` reads.
  const chain = await loadPromptChain(workingDir, targetSessionId);

  return collectPrompts(chain).map(({ key, entry }) => {
    const images = entryImageCount(entry);
    return {
      uuid: key,
      timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : null,
      // What was written around the typed message is not part of what was typed.
      preview: previewOf(typedPartOf(entryText(entry))),
      ...(images > 0 ? { images } : {}),
    };
  });
}
