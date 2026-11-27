/** JSONL entry type for the CLI's message queue bookkeeping. */
export const QUEUE_OPERATION = 'queue-operation';

/** The shape of a `queue-operation` entry, as the CLI writes it. */
export interface QueueOperationEntry {
  type?: string;
  operation?: string;
  content?: string | null;
  timestamp?: string;
  /** Ties a `remove` to the `attachment` entry that carries the same message (its `source_uuid`). */
  commandUuid?: string;
}

export function isQueueOperation(entry: unknown): entry is QueueOperationEntry {
  return !!entry
    && typeof entry === 'object'
    && (entry as QueueOperationEntry).type === QUEUE_OPERATION;
}

/**
 * How many times each message was queued mid-turn, and so exists ONLY as queue
 * bookkeeping.
 *
 * A message typed while a turn is already running never becomes a `user` entry
 * in the session JSONL. The CLI records an `enqueue` when it accepts the message
 * and, later, one of two things:
 *
 *   enqueue → dequeue  accepted while idle; a normal `user` entry IS written, so
 *                      whoever reads the transcript already has the message.
 *   enqueue → remove   queued mid-turn; no `user` entry is ever written, so this
 *                      is the one that has to be recovered from the bookkeeping.
 *
 * Entries carry no id, so the queue is replayed in order: an `enqueue` joins the
 * back, a `dequeue` takes the front (the message was accepted while idle), and a
 * `remove` takes out the oldest waiting message of the same content. An enqueue
 * with no matching remove is still sitting in the queue and is not counted until
 * it is consumed.
 *
 * A message carrying an image is enqueued with NO content (the image is not text)
 * but removed with its text, so a `remove` that finds no waiting message of its
 * own content falls back to the oldest waiting one that has none. Without that the
 * message that had a picture on it was the only one that never got its bubble back
 * (#727 session: the bubble the desktop app shows was missing from ours).
 *
 * Lives in shared/ because two readers need the same answer from the same
 * transcript — the chat transcript rebuilding the message bubble, and the prompt
 * history deciding whether the user typed it. Two copies of a pairing rule this
 * quiet would drift, and the drift would show up as a message that appears in
 * one place and not the other.
 */
export function queuedMidTurnCounts(entries: readonly unknown[]): Map<string, number> {
  const waiting: string[] = [];
  const paired = new Map<string, number>();
  for (const entry of entries) {
    if (!isQueueOperation(entry)) continue;
    if (entry.operation === 'enqueue') {
      // A message with no words of its own (an image alone, or an image with the text kept elsewhere) has no content.
      waiting.push(typeof entry.content === 'string' ? entry.content : '');
    } else if (entry.operation === 'dequeue') {
      waiting.shift();
    } else if (entry.operation === 'remove' && typeof entry.content === 'string') {
      let index = waiting.indexOf(entry.content);
      if (index < 0) index = waiting.indexOf('');
      if (index < 0) continue;
      waiting.splice(index, 1);
      paired.set(entry.content, (paired.get(entry.content) ?? 0) + 1);
    }
  }
  return paired;
}

/** An entry as the chat draws it, with the records of the file it was read from. */
export interface RestoredEntry {
  entry: Record<string, unknown>;
  /** The record itself, or for a rebuilt message the queue records and the attachment it was rebuilt from. */
  sources: Record<string, unknown>[];
}

const ENVELOPE = /<(task-notification|system-reminder)>[\s\S]*?<\/\1>/g;

/** True when nothing but model-facing envelopes is left of the text once they are taken out. */
function isOnlyEnvelopes(text: string): boolean {
  return text.includes('<') && text.replace(ENVELOPE, '').trim() === '';
}

/**
 * The `attachment` entries that carry a message typed during a turn, by the id the `remove` quotes as `commandUuid`.
 * A message with pictures has its blocks as the prompt. A message of words alone has a string, which counts only where
 * the entry says it is a prompt: a notice the CLI queued for Claude is written the same way (#708).
 */
function queuedAttachments(entries: readonly Record<string, unknown>[]): Map<string, Record<string, unknown>> {
  const found = new Map<string, Record<string, unknown>>();
  for (const entry of entries) {
    if (entry.type !== 'attachment') continue;
    const attachment = entry.attachment as
      | { type?: unknown; commandMode?: unknown; prompt?: unknown; source_uuid?: unknown }
      | undefined;
    if (attachment?.type !== 'queued_command' || typeof attachment.source_uuid !== 'string') continue;
    const { prompt } = attachment;
    const blocks = Array.isArray(prompt) && prompt.length > 0;
    const words = typeof prompt === 'string' && prompt !== '' && attachment.commandMode === 'prompt';
    if (blocks || words) found.set(attachment.source_uuid, entry);
  }
  return found;
}

/**
 * Rebuild the user messages that the CLI only recorded as queue bookkeeping.
 *
 * When a message is typed while a turn is already running, the CLI does not write it to the session file as a `user`
 * entry. It records an `enqueue` when the message is accepted and a `remove` when it is finally consumed, so reading
 * the session back would lose the message entirely.
 *
 * The rebuilt message stands where the `remove` is: that is when the CLI actually consumed it, so it lands between the
 * turn it interrupted and the reply that answers it.
 *
 * The chat and the backend's list of sends both read the transcript through this, so a rebuilt message is in both under
 * one name. The name is made of what the record itself says (the id of the command, or its time), never of how much of
 * the transcript happens to be loaded, so a jump from the list lands on the same message the chat draws.
 *
 * A `remove` is rebuilt when it pairs with a waiting `enqueue`, or when the attachment that carries the same message is
 * there: a page of the transcript can begin after the `enqueue`.
 *
 * Display-time reconstruction only: the entries given are never changed.
 */
export function restoreQueuedEntries(entries: readonly Record<string, unknown>[]): RestoredEntry[] {
  if (!entries.some(isQueueOperation)) return entries.map((entry) => ({ entry, sources: [entry] }));

  const attachments = queuedAttachments(entries);
  const waiting: Record<string, unknown>[] = [];
  const named = new Map<string, number>();
  // The commands already rebuilt: pages joined in the webview can hold a record without a uuid twice.
  const rebuilt = new Set<string>();
  const restored: RestoredEntry[] = [];

  for (const entry of entries) {
    if (!isQueueOperation(entry)) {
      restored.push({ entry, sources: [entry] });
      continue;
    }
    const operation = entry as unknown as QueueOperationEntry;
    if (operation.operation === 'enqueue') {
      waiting.push(entry);
      continue;
    }
    if (operation.operation === 'dequeue') {
      waiting.shift();
      continue;
    }
    if (operation.operation !== 'remove' || typeof operation.content !== 'string') continue;

    const wordsOf = (queued: Record<string, unknown>) => (typeof queued.content === 'string' ? queued.content : '');
    let at = waiting.findIndex((queued) => wordsOf(queued) === operation.content);
    if (at < 0) at = waiting.findIndex((queued) => wordsOf(queued) === '');
    const enqueue = at < 0 ? undefined : waiting.splice(at, 1)[0];
    const attachment = operation.commandUuid ? attachments.get(operation.commandUuid) : undefined;
    if (!enqueue && !attachment) continue;
    // A queued background notice (`<task-notification>`, a `<system-reminder>`) is text for the model, not something
    // the user sent: drawn as a user message it is an empty bubble once its tags are stripped.
    if (isOnlyEnvelopes(operation.content)) continue;
    if (operation.commandUuid) {
      if (rebuilt.has(operation.commandUuid)) continue;
      rebuilt.add(operation.commandUuid);
    }

    let name = operation.commandUuid ?? '';
    if (!name) {
      const base = `${operation.timestamp ?? ''}`;
      const count = (named.get(base) ?? 0) + 1;
      named.set(base, count);
      name = `${base}-${count}`;
    }
    const prompt = (attachment?.attachment as { prompt?: unknown } | undefined)?.prompt;

    restored.push({
      entry: {
        type: 'user',
        // Stable across reloads and pages, so React keys, uuid-based dedupe and a jump all find the same message.
        uuid: `${QUEUED_KEY_PREFIX}${name}`,
        timestamp: operation.timestamp,
        // The attachment that carries the same message keeps its pictures; the bookkeeping has only the words.
        message: { role: 'user', content: Array.isArray(prompt) ? prompt : operation.content },
      },
      sources: [enqueue, attachment, entry].filter((source): source is Record<string, unknown> => !!source),
    });
  }

  return restored;
}

/** What the name of a rebuilt message begins with. No record of the session file has such a uuid. */
export const QUEUED_KEY_PREFIX = 'queued-';
