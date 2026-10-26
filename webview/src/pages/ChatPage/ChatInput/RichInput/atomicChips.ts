import { ELEMENT_CHIP_ICON_ROOM } from '@/utils/composerElements';

/** Where a chip sits in the text, as offsets into it. */
export interface ChipRange {
  start: number;
  end: number;
}

/**
 * The element chips in the text. An element chip is one unit to the reader (as in Claude Desktop): the caret
 * steps over it whole, never stops in it, and one Backspace or Delete takes all of it away.
 */
export function elementChipRanges(text: string, tokens: readonly string[]): ChipRange[] {
  const ranges: ChipRange[] = [];
  for (const token of tokens) {
    if (!token.startsWith(ELEMENT_CHIP_ICON_ROOM)) continue;
    for (let at = text.indexOf(token); at !== -1; at = text.indexOf(token, at + token.length)) {
      ranges.push({ start: at, end: at + token.length });
    }
  }
  return ranges.sort((a, b) => a.start - b.start);
}

export type AtomicKey = 'Backspace' | 'Delete' | 'ArrowLeft' | 'ArrowRight';

export type AtomicResult =
  | { kind: 'caret'; offset: number }
  | { kind: 'remove'; range: ChipRange };

/** What a key does to a caret at `caret` when a chip is involved, or null when the key keeps its ordinary meaning. */
export function atomicKeyResult(key: AtomicKey, caret: number, ranges: readonly ChipRange[]): AtomicResult | null {
  switch (key) {
    case 'Backspace': {
      const r = ranges.find((c) => caret > c.start && caret <= c.end);
      return r ? { kind: 'remove', range: r } : null;
    }
    case 'Delete': {
      const r = ranges.find((c) => caret >= c.start && caret < c.end);
      return r ? { kind: 'remove', range: r } : null;
    }
    case 'ArrowLeft': {
      const r = ranges.find((c) => caret > c.start && caret <= c.end);
      return r ? { kind: 'caret', offset: r.start } : null;
    }
    case 'ArrowRight': {
      const r = ranges.find((c) => caret >= c.start && caret < c.end);
      return r ? { kind: 'caret', offset: r.end } : null;
    }
  }
}

/** Where a caret that landed inside a chip (a click, Home, End) goes instead: the nearer edge. */
export function snapOutOfChip(caret: number, ranges: readonly ChipRange[]): number | null {
  const r = ranges.find((c) => caret > c.start && caret < c.end);
  if (!r) return null;
  return caret - r.start <= r.end - caret ? r.start : r.end;
}
