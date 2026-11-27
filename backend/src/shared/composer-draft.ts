/**
 * What a session's composer holds while nothing has been sent yet (#735): the draft, and the edits made to sends
 * recalled from the history. The backend keeps one per session, so that it survives a restart and every window shows
 * the same box.
 *
 * Pictures travel apart from the rest: a draft names them by the id of their attachment, and the bytes are sent only
 * to who does not have them yet.
 */

/** A file, folder or picture in the attachment row. A picture's bytes are the blob of its `id`. */
export interface DraftAttachment {
  id: string;
  type: 'image' | 'file' | 'folder';
  name: string;
  path?: string;
  mimeType?: string;
  size?: number;
}

/** A reply or excerpt card: a quote and what was written about it (nothing, for an excerpt). */
export interface DraftReply {
  id: string;
  quote: string;
  comment: string;
}

/** An element picked in the Browser pane, as its chip. The element's own picture travels as an attachment. */
export interface DraftElement {
  token: string;
  element: Record<string, unknown>;
  imageName?: string;
}

/** The session a message is addressed to with `@@`, and the chip in the text that says so. */
export interface DraftRecipient {
  name: string;
  sessionId: string;
  sessionDir: string;
  label: string;
  token: string;
}

/** Everything the composer holds. */
export interface ComposerContent {
  text: string;
  recipient: DraftRecipient | null;
  pathTokens: string[];
  attachments: DraftAttachment[];
  replies: DraftReply[];
  elements: DraftElement[];
}

export interface ComposerDraft {
  /** The message being written. */
  content: ComposerContent;
  /** Sends recalled from the history and changed, by the key of the send. They are dropped once any message is sent. */
  edits: Record<string, ComposerContent>;
}

export function emptyContent(): ComposerContent {
  return { text: '', recipient: null, pathTokens: [], attachments: [], replies: [], elements: [] };
}

export function emptyDraft(): ComposerDraft {
  return { content: emptyContent(), edits: {} };
}

export function isEmptyContent(content: ComposerContent): boolean {
  return (
    content.text === '' &&
    content.recipient === null &&
    content.attachments.length === 0 &&
    content.replies.length === 0 &&
    content.elements.length === 0
  );
}

export function isEmptyDraft(draft: ComposerDraft): boolean {
  return isEmptyContent(draft.content) && Object.keys(draft.edits).length === 0;
}

/** Whether two composers show the same thing. Path chips follow the text, so they are not compared. */
export function sameContent(a: ComposerContent, b: ComposerContent): boolean {
  return (
    a.text === b.text &&
    (a.recipient?.token ?? '') === (b.recipient?.token ?? '') &&
    (a.recipient?.sessionId ?? '') === (b.recipient?.sessionId ?? '') &&
    a.attachments.map((x) => x.id).join('\n') === b.attachments.map((x) => x.id).join('\n') &&
    JSON.stringify(a.replies.map((x) => [x.quote, x.comment])) === JSON.stringify(b.replies.map((x) => [x.quote, x.comment])) &&
    a.elements.map((x) => x.token).join('\n') === b.elements.map((x) => x.token).join('\n')
  );
}

/** The ids of every picture a draft names, in the message being written and in the edits. */
export function blobIdsOf(draft: ComposerDraft): string[] {
  const ids = [draft.content, ...Object.values(draft.edits)].flatMap((content) =>
    content.attachments.filter((attachment) => attachment.type === 'image').map((attachment) => attachment.id),
  );
  return [...new Set(ids)];
}
