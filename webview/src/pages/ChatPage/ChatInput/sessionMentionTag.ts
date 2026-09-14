/**
 * The `<session-mention>` tag: how an addressed session survives into the
 * transcript.
 *
 * The composer holds the chip as plain display text (`@@fix the proxy`), which
 * is fine while the recipient is held in state beside it. The moment the message
 * is sent that state is gone: the bubble is drawn from the entry the CLI wrote,
 * and after a reload there is nothing left but characters.
 *
 * A title has spaces in it, so `@@` plus a title cannot say where it ends — the
 * bubble's path tokenizer stopped at the first space and offered to open a file
 * named `@fix`. A closing tag says where it ends, and the attributes carry what
 * the display text cannot:
 *
 * - `session-id` does not change when the CLI process restarts, so a mention
 *   written today still identifies its conversation tomorrow. The name does not
 *   survive that (measured: one session was `…-36` at pid 53662 and `…-57` at
 *   pid 36300), which is exactly why the id is the one that is stored.
 * - `agent-name` is the address as it stood when the message was sent, kept so
 *   the record says who it actually went to.
 * - `session-dir` is the project the session belongs to. The `@@` list spans the
 *   whole machine, so a mention can point at another project entirely, and
 *   opening it needs to land in that project's window rather than this one.
 *
 * Same shape as `<ide_opened_file>` and `<ide_selection>`, which the CLI writes
 * and `parseUserContent` already reads, so this is the transcript's own idiom
 * rather than a second one invented beside it.
 */

export const SESSION_MENTION_TAG = 'session-mention';

/** One `<session-mention>` found in a message, as the renderer needs it. */
export interface SessionMention {
  sessionId: string;
  agentName: string;
  /** The session's working directory, so opening it picks the right project. */
  sessionDir: string;
  /** What the chip says, e.g. `@@fix the proxy`. */
  label: string;
}

/** Attribute values are quoted, so the quote and the ampersand have to go. */
function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function unescapeAttribute(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
}

/** Wrap one chip's display text in the tag that will outlive the composer. */
export function buildSessionMentionTag(mention: SessionMention): string {
  return (
    `<${SESSION_MENTION_TAG} session-id="${escapeAttribute(mention.sessionId)}"` +
    ` agent-name="${escapeAttribute(mention.agentName)}"` +
    ` session-dir="${escapeAttribute(mention.sessionDir)}">${mention.label}` +
    `</${SESSION_MENTION_TAG}>`
  );
}

/**
 * Matches one whole `<session-mention>` element, attributes and all.
 *
 * Non-greedy on the body so two mentions in one message stay two.
 */
export const SESSION_MENTION_PATTERN = new RegExp(
  `<${SESSION_MENTION_TAG}\\s+session-id="([^"]*)"\\s+agent-name="([^"]*)"` +
    `(?:\\s+session-dir="([^"]*)")?\\s*>([\\s\\S]*?)</${SESSION_MENTION_TAG}>`,
  'g',
);

/** Read a match produced by {@link SESSION_MENTION_PATTERN}. */
export function readSessionMention(match: RegExpExecArray): SessionMention {
  return {
    sessionId: unescapeAttribute(match[1] ?? ''),
    agentName: unescapeAttribute(match[2] ?? ''),
    // Optional in the pattern, because a message sent before this attribute
    // existed still has to render. Such a mention opens against the current
    // project, which is where it came from in every case we can still see.
    sessionDir: unescapeAttribute(match[3] ?? ''),
    label: match[4] ?? '',
  };
}

/**
 * Replace every tag with just its display text.
 *
 * For anything that wants the message as words rather than as markup — copying
 * it, searching it, measuring its length. The chip reads as `@@fix the proxy`
 * there, which is what the user typed and what they would expect on the
 * clipboard.
 */
export function stripSessionMentionTags(text: string): string {
  return text.replace(new RegExp(SESSION_MENTION_PATTERN.source, 'g'), '$4');
}

/**
 * Remove every mention entirely, label and all.
 *
 * For naming a conversation. A title says what the conversation is ABOUT, and
 * who a message was addressed to is not that — the address is routing, and it
 * pushes the actual subject out of a label that only holds fifty characters.
 *
 * Distinct from {@link stripSessionMentionTags}, which keeps the label because
 * its callers want the message as the user wrote it.
 */
export function dropSessionMentions(text: string): string {
  return text.replace(new RegExp(SESSION_MENTION_PATTERN.source, 'g'), '').trim();
}

/**
 * The first `<session-mention>` in a message, or null when there is none.
 *
 * For putting a recalled prompt back in the composer. The composer holds one
 * recipient, so a message that somehow carried two is read as addressed to the
 * first — the same one its text reads as addressed to.
 */
export function readFirstSessionMention(text: string): SessionMention | null {
  const pattern = new RegExp(SESSION_MENTION_PATTERN.source, 'g');
  const match = pattern.exec(text);
  return match ? readSessionMention(match) : null;
}

/**
 * Put the tag around the chip inside a composer value.
 *
 * The composer never holds the tag itself: it would show as raw markup in the
 * box the user is typing in. The wrapping happens once, on the way out.
 */
export function wrapChipForTranscript(
  composerText: string,
  chipToken: string,
  mention: Omit<SessionMention, 'label'>,
): string {
  if (!chipToken || !composerText.includes(chipToken)) return composerText;
  const tag = buildSessionMentionTag({ ...mention, label: chipToken });
  return composerText.replace(chipToken, tag);
}
