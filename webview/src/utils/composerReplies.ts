import { formatReplyBlocks, type ReplyCard } from '@/pages/ChatPage/message-renderers/utils/replyBlocks';

/**
 * Replies and excerpts waiting in the message box, taken from text selected in the chat.
 *
 * Claude Desktop lets the reader select text anywhere in the chat and press "Reply": the quote and a comment
 * become a card above the message box, and nothing is sent until the reader sends the message. A card with no
 * comment is an excerpt. Like the elements picked in the Browser pane (composerElements), the cards are a list
 * held outside the React tree; when the message is sent they are written out ahead of the typed text and the
 * list is emptied.
 */
export interface PendingReply {
  id: string;
  quote: string;
  /** What the reader wrote about the quote; empty makes the card an excerpt. */
  comment: string;
}

let pending: PendingReply[] = [];
let counter = 0;
const listeners = new Set<() => void>();

function setPending(next: PendingReply[]): void {
  pending = next;
  listeners.forEach((listener) => listener());
}

let sendRequested = false;

/**
 * Puts a card in the row above the message box. A comment of blanks makes it an excerpt.
 * `send` asks the message box to send what it holds as soon as the card is in it (Desktop's ⌘↵).
 */
export function addReplyToComposer(quote: string, comment: string, send = false): void {
  sendRequested = send;
  setPending([...pending, { id: `reply-${++counter}`, quote, comment: comment.trim() }]);
}

/** Whether the card just added asked to be sent right away; asking again returns false until the next card. */
export function takeSendRequest(): boolean {
  const requested = sendRequested;
  sendRequested = false;
  return requested;
}

/** Rewrites the comment of a card waiting in the row; a comment of blanks makes it an excerpt. */
export function updatePendingReply(id: string, comment: string): void {
  setPending(pending.map((entry) => (entry.id === id ? { ...entry, comment: comment.trim() } : entry)));
}

export function removePendingReply(id: string): void {
  setPending(pending.filter((entry) => entry.id !== id));
}

/** The cards in the row, as `useSyncExternalStore` reads them. */
export function getPendingReplies(): readonly PendingReply[] {
  return pending;
}

export function subscribePendingReplies(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The cards as the replies and the excerpts they are written as. */
export function splitPendingReplies(entries: readonly PendingReply[]): { replies: ReplyCard[]; excerpts: string[] } {
  return {
    replies: entries.filter((entry) => entry.comment).map(({ quote, comment }) => ({ quote, comment })),
    excerpts: entries.filter((entry) => !entry.comment).map((entry) => entry.quote),
  };
}

/** The message with the cards written out ahead of it; the row is emptied. */
export function expandReplyCards(text: string): string {
  if (pending.length === 0) return text;
  const { replies, excerpts } = splitPendingReplies(pending);
  setPending([]);
  return `${formatReplyBlocks(replies, excerpts)}${text}`;
}
