/**
 * The text a reply or an excerpt card becomes when the message is sent, and the way back.
 *
 * Claude Desktop writes the cards into the prompt as plain text, ahead of what was typed in the message box:
 *
 *   <!-- reply 2 -->        the first reply carries how many replies there are, the rest carry none
 *   > the quoted text
 *
 *   the comment
 *
 *   <!-- reply -->
 *   > another quoted text
 *
 *   another comment
 *
 *
 *   <!-- attach -->        an excerpt: a quote with no comment
 *   > the quoted text
 *
 *   what was typed in the message box
 *
 * The CLI records that text as it is, so a session started in Desktop and opened here (or the other way
 * round) holds the same words. Nothing here is a protocol of ours: the model reads a quote and a comment.
 */

export interface ReplyCard {
  quote: string;
  comment: string;
}

export interface ParsedReplyBlocks {
  replies: ReplyCard[];
  /** Quotes of the excerpt cards. They are sent to the model and not drawn in the message. */
  excerpts: string[];
  /** What was typed in the message box, after the cards. */
  body: string;
}

const REPLY_HEADER = /^<!-- reply(?: \d+)? -->\n/;
const ATTACH_HEADER = /^<!-- attach -->\n/;
const QUOTE_LINES = /^(?:>[^\n]*(?:\n|$))+/;
const END_OF_COMMENT = /\n\n(?=<!-- reply(?: \d+)? -->)|\n{3,}|$/;

function quoteText(lines: string): string {
  return lines
    .replace(/\n$/, '')
    .split('\n')
    .map((line) => line.replace(/^> ?/, ''))
    .join('\n');
}

/** `quote` as the lines of a Markdown quote. */
export function quoteLines(quote: string): string {
  return quote
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n');
}

/**
 * The cards written at the start of a message, or `null` when the message does not start with one.
 * A message that merely mentions the markers further down is not a card message.
 */
export function parseReplyBlocks(text: string): ParsedReplyBlocks | null {
  let rest = text.replace(/^\s+/, '');
  if (!REPLY_HEADER.test(rest) && !ATTACH_HEADER.test(rest)) return null;

  const replies: ReplyCard[] = [];
  const excerpts: string[] = [];

  for (;;) {
    const header = REPLY_HEADER.exec(rest);
    if (!header) break;
    const afterHeader = rest.slice(header[0].length);
    const quote = QUOTE_LINES.exec(afterHeader);
    if (!quote) break;
    let afterQuote = afterHeader.slice(quote[0].length);
    if (afterQuote.startsWith('\n')) afterQuote = afterQuote.slice(1);
    const end = END_OF_COMMENT.exec(afterQuote)!;
    replies.push({ quote: quoteText(quote[0]), comment: afterQuote.slice(0, end.index) });
    rest = afterQuote.slice(end.index + end[0].length);
  }

  for (;;) {
    rest = rest.replace(/^\n+/, '');
    const header = ATTACH_HEADER.exec(rest);
    if (!header) break;
    const afterHeader = rest.slice(header[0].length);
    const quote = QUOTE_LINES.exec(afterHeader);
    if (!quote) break;
    excerpts.push(quoteText(quote[0]));
    rest = afterHeader.slice(quote[0].length);
  }

  if (replies.length === 0 && excerpts.length === 0) return null;
  return { replies, excerpts, body: rest.trim() };
}

/**
 * The text of the cards in the message box, as Desktop writes it, ready to have what was typed put after it;
 * empty when there are no cards. The replies end in two blank lines and an excerpt in one, which is what
 * Desktop's transcripts show.
 */
export function formatReplyBlocks(replies: readonly ReplyCard[], excerpts: readonly string[]): string {
  const replyText = replies
    .map((reply, index) => `<!-- reply${index === 0 ? ` ${replies.length}` : ''} -->\n${quoteLines(reply.quote)}\n\n${reply.comment}`)
    .join('\n\n');
  const excerptText = excerpts.map((excerpt) => `<!-- attach -->\n${quoteLines(excerpt)}`).join('\n\n');
  if (replyText && excerptText) return `${replyText}\n\n\n${excerptText}\n\n`;
  if (replyText) return `${replyText}\n\n\n`;
  if (excerptText) return `${excerptText}\n\n`;
  return '';
}
