/**
 * How much of an agent's record is sent at a time, and which part.
 *
 * An agent's own record (`agent-<id>.jsonl`) holds far more than the conversation: the hooks' context, the request
 * the model was sent, notices. Those can be several times larger than the conversation itself, so a cap counted in
 * characters or in lines cut the conversation short (the calls and replies a reader came for) while keeping the
 * bulk. The record is therefore sent in pages of conversation: a page is the last
 * {@link CONVERSATION_PAGE_ENTRIES} user and assistant entries, together with every entry between them. Nothing is
 * dropped from the entries sent; what is left out is only what comes before the window, and a reader asks for that
 * a page at a time (the chat pages the same way).
 */
export const CONVERSATION_PAGE_ENTRIES = 40;

/** The entries that make up the conversation: what was said to the agent and what it said. */
export function isConversationEntryType(type: unknown): boolean {
  return type === 'user' || type === 'assistant';
}

/**
 * Where the window of `pages` pages begins, as an index into the record's entries: the position of the earliest of
 * the last `pages * CONVERSATION_PAGE_ENTRIES` conversation entries, or 0 when the record holds no more than that
 * (the window is then the whole record, and starts with its first entry, the prompt).
 */
export function conversationWindowStart(types: ReadonlyArray<unknown>, pages: number): number {
  const wanted = Math.max(1, Math.floor(pages)) * CONVERSATION_PAGE_ENTRIES;
  let seen = 0;
  for (let index = types.length - 1; index >= 0; index -= 1) {
    if (!isConversationEntryType(types[index])) continue;
    seen += 1;
    if (seen === wanted) return index;
  }
  return 0;
}

/** A page count that came from a client: a whole number from 1 up, and not absurdly many. */
export function sanitizePages(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 1;
  return Math.min(Math.max(n, 1), 1000);
}
