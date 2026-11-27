import type { TextRange } from '@/utils/domSelection';

/**
 * A contiguous run of the composer value, classified for the mirror overlay.
 * `isToken` runs are wrapped in highlight chips; plain runs render as text.
 */
export interface Segment {
  text: string;
  isToken: boolean;
}

/**
 * Split `value` into token / plain {@link Segment}s for the RichInput mirror.
 *
 * Scans left → right. At each position the longest token in `tokens` that the
 * value starts with (from that index) is emitted as a token segment and the
 * scan jumps past it; this prevents a shorter token (e.g. `src/file.ts`) from
 * carving up a longer match (`src/file.ts#L10-L25`). Characters with no token
 * match accumulate into a plain run, which is flushed as one segment when the
 * next token begins or the value ends — so adjacent plain runs always merge.
 *
 * Empty-string tokens are ignored (they would never advance the cursor). An
 * empty `tokens` list (or no matches) yields the whole value as one plain
 * segment; an empty value yields an empty array.
 */
export function splitIntoSegments(
  value: string,
  tokens: readonly string[],
): Segment[] {
  const candidates = tokens.filter((t) => t.length > 0);
  const segments: Segment[] = [];

  let plainStart = 0;
  let i = 0;

  const flushPlain = (end: number) => {
    if (end > plainStart) {
      segments.push({ text: value.slice(plainStart, end), isToken: false });
    }
  };

  while (i < value.length) {
    let longest = '';
    for (const token of candidates) {
      if (token.length > longest.length && value.startsWith(token, i)) {
        longest = token;
      }
    }

    if (longest.length > 0) {
      flushPlain(i);
      segments.push({ text: longest, isToken: true });
      i += longest.length;
      plainStart = i;
    } else {
      i += 1;
    }
  }

  flushPlain(value.length);
  return segments;
}

/** The part of the run starting at offset `from` that lies before, inside and after `range`. */
export function splitAtRange(text: string, from: number, range: TextRange | null): [string, string, string] {
  if (!range) return [text, '', ''];
  const within = (offset: number) => Math.min(Math.max(offset - from, 0), text.length);
  const start = within(range.start);
  const end = within(range.end);
  return [text.slice(0, start), text.slice(start, end), text.slice(end)];
}
