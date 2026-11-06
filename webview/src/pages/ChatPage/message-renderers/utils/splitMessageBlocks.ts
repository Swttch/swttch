/** A stretch of a user message: ordinary text, a fenced code block, or a run of `>` quote lines. */
export type MessageBlock =
  | { kind: 'text'; text: string }
  | { kind: 'code'; language: string; code: string }
  | { kind: 'quote'; text: string };

const FENCE_OPEN = /^ {0,3}```([^`]*)$/;
const FENCE_CLOSE = /^ {0,3}```\s*$/;
const QUOTE_LINE = /^ {0,3}> ?(.*)$/;

/**
 * Split a message at its fenced code blocks and `>` quotes, the two block forms
 * Claude Desktop draws in the user's bubble besides `inline code`. Everything
 * else stays text, in order.
 *
 * A fence that is never closed is left as text, so a half-typed message does not
 * swallow what follows it. The marker lines (the fences, the leading `>`) are
 * consumed by their block; the text around a block keeps no newline beside it.
 */
export function splitMessageBlocks(text: string): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  const lines = text.split('\n');
  let pending: string[] = [];

  const flushText = () => {
    if (pending.length > 0) blocks.push({ kind: 'text', text: pending.join('\n') });
    pending = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const open = FENCE_OPEN.exec(line);
    if (open) {
      let close = -1;
      for (let j = i + 1; j < lines.length; j++) {
        if (FENCE_CLOSE.test(lines[j])) {
          close = j;
          break;
        }
      }
      if (close !== -1) {
        flushText();
        blocks.push({
          kind: 'code',
          language: open[1].trim().split(/\s+/)[0] ?? '',
          code: lines.slice(i + 1, close).join('\n'),
        });
        i = close + 1;
        continue;
      }
    }

    if (QUOTE_LINE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length) {
        const m = QUOTE_LINE.exec(lines[i]);
        if (!m) break;
        quoted.push(m[1]);
        i++;
      }
      flushText();
      blocks.push({ kind: 'quote', text: quoted.join('\n') });
      continue;
    }

    pending.push(line);
    i++;
  }
  flushText();

  // An empty message has one empty line, which is nothing, not a block of nothing.
  return blocks.length === 1 && blocks[0].kind === 'text' && blocks[0].text === '' ? [] : blocks;
}
