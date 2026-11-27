/**
 * What a page of a transcript is counted in (#708).
 *
 * A session file holds far more than the conversation: attachments, queue records, records of the API requests, titles
 * and modes, and the results of tool calls, which the chat draws inside their calls. A page counted in records held a
 * handful of messages, under one screen of the chat, so scrolling and jumping ran out of loaded conversation at once.
 * A page is therefore so many entries of the conversation, with every record between them: where a page is cut changes,
 * what it carries does not. The backend cuts its pages and the webview's window counts them by this one rule.
 */

/**
 * The most records one counted entry may bring into a page. A stretch that hardly holds any of the conversation (a long
 * run of progress records) is cut there, so that no page grows without limit.
 */
export const PAGE_RECORDS_PER_ENTRY = 20;

/** Whether a record is an entry of the conversation: one the user or Claude wrote, drawn on its own. */
export function countsTowardPage(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false;
  const record = entry as { type?: unknown; isMeta?: unknown; isSidechain?: unknown; message?: { content?: unknown } };
  // An entry that does not say what it is counts, as every entry once did.
  if (record.type === undefined) return true;
  if (record.type !== 'user' && record.type !== 'assistant') return false;
  if (record.isMeta || record.isSidechain) return false;
  const content = record.message?.content;
  if (record.type === 'assistant' || !Array.isArray(content) || content.length === 0) return true;
  return content.some((block) => (block as { type?: unknown } | null)?.type !== 'tool_result');
}
