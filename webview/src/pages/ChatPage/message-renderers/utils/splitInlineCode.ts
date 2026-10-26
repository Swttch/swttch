/** A run of a user message: ordinary text, or the text between a pair of backticks. */
export interface InlineCodeSegment {
  text: string;
  code: boolean;
}

/**
 * Split a message at its `inline code` spans. A span opens and closes on the same
 * line, so a lone backtick (or one that is never closed) stays ordinary text.
 * Fenced blocks are not handled: only the single-backtick span a person types
 * into a sentence, which Claude Desktop draws as code in the user's bubble.
 */
export function splitInlineCode(text: string): InlineCodeSegment[] {
  const segments: InlineCodeSegment[] = [];
  const pattern = /`([^`\n]+)`/g;
  let last = 0;
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    if (match.index > last) segments.push({ text: text.slice(last, match.index), code: false });
    segments.push({ text: match[1], code: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), code: false });
  return segments;
}
