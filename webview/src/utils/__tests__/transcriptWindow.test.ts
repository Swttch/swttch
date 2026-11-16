import { describe, expect, it } from 'vitest';
import {
  appendNewer,
  dropPage,
  firstUuidOf,
  gapIndex,
  jumpTo,
  lastUuidOf,
  loadInitial,
  nextStep,
  normalizeState,
  pageIndexAt,
  pageSpans,
  prependOlder,
  prependToLatest,
  recyclerReach,
  type WindowConfig,
  type WindowEntry,
  type WindowState,
  type WindowStep,
} from '../transcriptWindow';

// 4 entries a page, the newest 2 pages fixed, a recycler of 3 pages: one older than the reader's and one newer.
const config: WindowConfig = { pageSize: 4, latestPages: 2, historyPages: 3 };
// The shape the owner described: 5 fixed pages and a recycler of 5, two older and two newer than the reader's.
const five: WindowConfig = { pageSize: 4, latestPages: 5, historyPages: 5 };

const e = (uuid: string): WindowEntry => ({ uuid });
const range = (prefix: string, from: number, to: number): WindowEntry[] =>
  Array.from({ length: to - from + 1 }, (_, i) => e(`${prefix}${from + i}`));
const ids = (entries: readonly WindowEntry[]) => entries.map(m => m.uuid ?? '(none)');

describe('cursors', () => {
  it('reads the first and last uuid, skipping entries that have none', () => {
    const entries: WindowEntry[] = [{}, e('a'), {}, e('b'), {}];
    expect(firstUuidOf(entries)).toBe('a');
    expect(lastUuidOf(entries)).toBe('b');
    expect(firstUuidOf([{}])).toBeNull();
    expect(lastUuidOf([])).toBeNull();
  });

  it('finds the entry after the gap, or -1 with none', () => {
    const messages = [...range('h', 1, 3), ...range('t', 1, 3)];
    expect(gapIndex(messages, { afterUuid: 'h3', beforeUuid: 't1' })).toBe(3);
    expect(gapIndex(messages, null)).toBe(-1);
  });

  it('drops a gap whose entry is not held, and keeps the starts that are', () => {
    const messages = range('h', 1, 8);
    const state: WindowState = { gap: { afterUuid: 'h3', beforeUuid: 'gone' }, hasOlder: true, starts: ['h1', 'h5', 'zz'] };
    const normalized = normalizeState(messages, state);
    expect(normalized.gap).toBeNull();
    expect(normalized.starts).toEqual(['h1', 'h5']);
  });

  it('always lists the first held entry as a start', () => {
    const normalized = normalizeState(range('h', 1, 8), { gap: null, hasOlder: false, starts: [] });
    expect(normalized.starts).toEqual(['h1']);
  });

  it('reaches as far each way as the recycler is wide', () => {
    expect(recyclerReach({ historyPages: 5 })).toEqual({ above: 2, below: 2 });
    expect(recyclerReach({ historyPages: 3 })).toEqual({ above: 1, below: 1 });
    expect(recyclerReach({ historyPages: 2 })).toEqual({ above: 1, below: 0 });
  });
});

describe('pageSpans', () => {
  it('cuts pages where the starts say, with entries before the first start in the first page', () => {
    const messages = [{}, ...range('m', 1, 8)];
    const spans = pageSpans(messages, { gap: null, hasOlder: false, starts: ['m1', 'm5'] }, config);
    expect(spans.map(s => [s.from, s.to, s.start])).toEqual([[0, 5, 'm1'], [5, 9, 'm5']]);
  });

  it('cuts the newest page into pages of pageSize as long as a page remains after the cut', () => {
    // One explicit page of 11 entries: 4 + 4 + 3 would leave a short last page, so it is 4 + 7.
    const messages = range('m', 1, 11);
    const spans = pageSpans(messages, { gap: null, hasOlder: false, starts: ['m1'] }, config);
    expect(spans.map(s => s.to - s.from)).toEqual([4, 7]);
    // With 12 entries the last page is exactly a page.
    const twelve = pageSpans(range('m', 1, 12), { gap: null, hasOlder: false, starts: ['m1'] }, config);
    expect(twelve.map(s => s.to - s.from)).toEqual([4, 4, 4]);
  });

  it('finds the page a message is on', () => {
    const spans = pageSpans(range('m', 1, 12), { gap: null, hasOlder: false, starts: ['m1'] }, config);
    expect([0, 3, 4, 7, 8, 11].map(i => pageIndexAt(spans, i))).toEqual([0, 0, 1, 1, 2, 2]);
  });
});

describe('loading and joining pages', () => {
  it('holds the first page as the newest pages, with no gap and one start', () => {
    const result = loadInitial(range('m', 1, 4), true);
    expect(result.state).toEqual({ gap: null, hasOlder: true, starts: ['m1'] });
  });

  it('puts an older page in front as a page of its own, and takes hasOlder from it', () => {
    const first = loadInitial(range('m', 5, 8), true);
    const result = prependOlder(first.messages, first.state, range('m', 1, 4), false);
    expect(ids(result.messages)).toEqual(ids(range('m', 1, 8)));
    expect(result.state).toEqual({ gap: null, hasOlder: false, starts: ['m1', 'm5'] });
  });

  it('does not hold an entry twice when the page overlaps what is held', () => {
    const first = loadInitial(range('m', 5, 8), true);
    const result = prependOlder(first.messages, first.state, range('m', 3, 6), true);
    expect(ids(result.messages)).toEqual(ids(range('m', 3, 8)));
    expect(result.state.starts).toEqual(['m3', 'm5']);
  });

  describe('with a gap', () => {
    const gap = { afterUuid: 'e8', beforeUuid: 'e23' };
    const held = [...range('e', 1, 8), ...range('e', 23, 30)];
    const state: WindowState = { gap, hasOlder: true, starts: ['e1', 'e5', 'e23', 'e27'] };

    it('appends a newer page after the recycler and moves the gap', () => {
      const result = appendNewer(held, state, range('e', 9, 12));
      expect(ids(result.messages)).toEqual([...ids(range('e', 1, 12)), ...ids(range('e', 23, 30))]);
      expect(result.state.gap).toEqual({ afterUuid: 'e12', beforeUuid: 'e23' });
      expect(result.state.starts).toEqual(['e1', 'e5', 'e9', 'e23', 'e27']);
    });

    it('joins the recycler to the pages after the gap when the page reaches them, holding nothing twice', () => {
      const result = appendNewer(held, state, range('e', 20, 27));
      expect(ids(result.messages)).toEqual([...ids(range('e', 1, 8)), ...ids(range('e', 20, 22)), ...ids(range('e', 23, 30))]);
      expect(result.state.gap).toBeNull();
    });

    it('closes the gap on an empty page, because nothing lies between', () => {
      expect(appendNewer(held, state, []).state.gap).toBeNull();
    });

    it('closes the gap when the backend says the page ends exactly where the next pages begin', () => {
      // The page holds none of the next pages' entries, so only the backend can say they follow it.
      const withoutWord = appendNewer(held, state, range('e', 9, 22));
      expect(withoutWord.state.gap).not.toBeNull();
      const withWord = appendNewer(held, state, range('e', 9, 22), true);
      expect(withWord.state.gap).toBeNull();
      expect(ids(withWord.messages)).toEqual(ids(range('e', 1, 30).filter(m => m.uuid !== undefined)));
    });

    it('does the same for a page that begins exactly after the recycler', () => {
      const result = prependToLatest(held, state, range('e', 9, 22), true);
      expect(result.state.gap).toBeNull();
      expect(ids(result.messages)).toEqual(ids(range('e', 1, 30)));
    });

    it('fills the gap from the other side with a page before the pages after it', () => {
      const result = prependToLatest(held, state, range('e', 19, 22));
      expect(ids(result.messages)).toEqual([...ids(range('e', 1, 8)), ...ids(range('e', 19, 30))]);
      expect(result.state.gap).toEqual({ afterUuid: 'e8', beforeUuid: 'e19' });
      expect(result.state.hasOlder).toBe(true);
    });

    it('closes the gap when that page reaches the recycler, not repeating what follows its last entry', () => {
      const withNote = [...range('e', 1, 8), {}, ...range('e', 23, 30)];
      const result = prependToLatest(withNote, state, [...range('e', 7, 8), {}, ...range('e', 9, 22)]);
      expect(result.messages).toHaveLength(8 + 1 + 14 + 8);
      expect(result.state.gap).toBeNull();
    });
  });
});

describe('jumpTo', () => {
  const gap = { afterUuid: 'p8', beforeUuid: 'e23' };
  const held = [...range('p', 1, 8), ...range('e', 23, 30)];
  const state: WindowState = { gap, hasOlder: true, starts: ['p1', 'p5', 'e23', 'e27'] };

  it('puts a page that touches nothing held where the recycler was, with a gap before the newest pages', () => {
    const result = jumpTo(held, state, range('e', 10, 13), true, config);
    expect(ids(result.messages)).toEqual([...ids(range('e', 10, 13)), ...ids(range('e', 23, 30))]);
    expect(result.state.gap).toEqual({ afterUuid: 'e13', beforeUuid: 'e23' });
    expect(result.state.starts[0]).toBe('e10');
  });

  it('joins a page that runs into the newest pages, and lets the recycler go', () => {
    const result = jumpTo(held, state, range('e', 20, 25), true, config);
    expect(ids(result.messages)).toEqual([...ids(range('e', 20, 22)), ...ids(range('e', 23, 30))]);
    expect(result.state.gap).toBeNull();
  });

  it('treats a page that reaches the oldest entry held as an older page', () => {
    const result = jumpTo(held, state, [e('x1'), e('x2'), ...range('p', 1, 2)], false, config);
    expect(ids(result.messages).slice(0, 4)).toEqual(['x1', 'x2', 'p1', 'p2']);
    expect(result.state.gap).toEqual(gap);
  });

  it('inside one contiguous run, keeps only the newest pages next to the page', () => {
    const all = range('m', 1, 40);
    const first = loadInitial(all, true);
    const result = jumpTo(first.messages, { ...first.state, starts: ['m1'] }, [e('x1'), e('x2'), e('x3')], true, config);
    // The newest 2 pages (8 entries) of the 40 are kept.
    expect(ids(result.messages)).toEqual(['x1', 'x2', 'x3', ...ids(range('m', 33, 40))]);
    expect(result.state.gap).toEqual({ afterUuid: 'x3', beforeUuid: 'm33' });
  });
});

describe('dropPage', () => {
  it('drops the oldest page: the backend has it, and nothing is held in front of what remains', () => {
    const first = loadInitial(range('m', 9, 12), true);
    const a = prependOlder(first.messages, first.state, range('m', 5, 8), true);
    const b = prependOlder(a.messages, a.state, range('m', 1, 4), true);
    const result = dropPage(b.messages, b.state, config, 'm1');
    expect(ids(result.messages)).toEqual(ids(range('m', 5, 12)));
    expect(result.state.hasOlder).toBe(true);
    expect(result.state.starts).toEqual(['m5', 'm9']);
  });

  it('drops the recycler page next to the fixed pages and leaves a gap there', () => {
    const first = loadInitial(range('m', 13, 20), true);
    const a = prependOlder(first.messages, first.state, range('m', 9, 12), true);
    const b = prependOlder(a.messages, a.state, range('m', 5, 8), true);
    const result = dropPage(b.messages, b.state, config, 'm9');
    expect(ids(result.messages)).toEqual([...ids(range('m', 5, 8)), ...ids(range('m', 13, 20))]);
    expect(result.state.gap).toEqual({ afterUuid: 'm8', beforeUuid: 'm13' });
  });

  it('widens the gap when the page next to it is dropped, from either side', () => {
    const held = [...range('e', 1, 4), ...range('e', 5, 8), ...range('e', 21, 24), ...range('e', 25, 28)];
    const state: WindowState = { gap: { afterUuid: 'e8', beforeUuid: 'e21' }, hasOlder: false, starts: ['e1', 'e5', 'e21', 'e25'] };
    const lower = dropPage(held, state, config, 'e5');
    expect(lower.state.gap).toEqual({ afterUuid: 'e4', beforeUuid: 'e21' });
    const upper = dropPage(held, state, config, 'e21');
    expect(upper.state.gap).toEqual({ afterUuid: 'e8', beforeUuid: 'e25' });
  });

  it('closes the gap when the recycler is dropped entirely', () => {
    const held = [...range('e', 1, 4), ...range('e', 21, 28)];
    const state: WindowState = { gap: { afterUuid: 'e4', beforeUuid: 'e21' }, hasOlder: false, starts: ['e1', 'e21', 'e25'] };
    const result = dropPage(held, state, config, 'e1');
    expect(result.state.gap).toBeNull();
    expect(result.state.hasOlder).toBe(true);
  });
});

/**
 * Runs the window the way the page does: the reader is on one page, and the window is
 * stepped (dropping before loading, one at a time) until it asks for nothing. Pages come
 * from a chain `c1..cN` of `pageSize`-sized pages counted from the newest, the way the backend cuts them.
 */
function settle(
  total: number,
  cfg: WindowConfig,
  initial: { messages: WindowEntry[]; state: WindowState },
  readerPage: number, // 0 = newest page, 1 = one before it, ... (the owner's "위N")
): { messages: WindowEntry[]; state: WindowState; steps: WindowStep[] } {
  const chain = range('c', 1, total);
  const at = (uuid: string) => chain.findIndex(m => m.uuid === uuid);
  let { messages, state } = initial;
  const steps: WindowStep[] = [];
  for (let guard = 0; guard < 200; guard++) {
    // The reader's message: the middle of the page `readerPage` pages before the newest.
    const newestFirst = total - cfg.pageSize * (readerPage + 1) + 1;
    const middle = `c${Math.max(1, newestFirst) + Math.floor(cfg.pageSize / 2)}`;
    const index = messages.findIndex(m => m.uuid === middle);
    const step = nextStep(messages, state, cfg, index === -1 ? 0 : index);
    if (step.kind === 'none') break;
    steps.push(step);
    if (step.kind === 'drop') {
      ({ messages, state } = dropPage(messages, state, cfg, step.start));
    } else if (step.kind === 'loadOlder') {
      const end = at(step.beforeUuid);
      const start = Math.max(0, end - cfg.pageSize);
      ({ messages, state } = prependOlder(messages, state, chain.slice(start, end), start > 0));
    } else if (step.kind === 'loadNewer') {
      // The way the backend cuts it with `untilUuid`: the page stops in front of the entry that follows the gap.
      const start = at(step.afterUuid) + 1;
      const stop = state.gap ? at(state.gap.beforeUuid) : total;
      const end = Math.min(start + cfg.pageSize, stop);
      ({ messages, state } = appendNewer(messages, state, chain.slice(start, end), end === stop));
    } else {
      // And with `untilUuid` for an older page: it stops after the recycler's last entry.
      const end = at(step.beforeUuid);
      const floor = state.gap ? at(state.gap.afterUuid) + 1 : 0;
      const start = Math.max(floor, end - cfg.pageSize);
      ({ messages, state } = prependToLatest(messages, state, chain.slice(start, end), start === floor));
    }
  }
  return { messages, state, steps };
}

/** Which pages are held, named the way the owner names them: 0 is the newest, 1 is "위1", and so on. */
function heldPages(messages: readonly WindowEntry[], total: number, pageSize: number): number[] {
  const pages = new Set<number>();
  for (const m of messages) {
    const n = Number((m.uuid ?? '').slice(1));
    if (n) pages.add(Math.floor((total - n) / pageSize));
  }
  return [...pages].sort((a, b) => a - b);
}

describe('the window follows the reader the way the table in the issue says (5 fixed pages + a recycler of 5)', () => {
  const total = 400; // 100 pages of 4
  const bottom = (() => {
    // 최하단: the newest 5 pages, and nothing else.
    const chain = range('c', 1, total);
    return loadInitial(chain.slice(total - 20), true);
  })();

  function walk(readerPages: number[]) {
    let held = bottom;
    const out: Record<number, number[]> = {};
    for (const page of readerPages) {
      held = settle(total, five, held, page);
      out[page] = heldPages(held.messages, total, five.pageSize);
    }
    return { held, out };
  }

  it('holds only the 5 fixed pages while the reader is among them, apart from what the nearest ones reach', () => {
    const { out } = walk([0, 1, 2]);
    expect(out[0]).toEqual([0, 1, 2, 3, 4]); // 1. at the bottom
    expect(out[1]).toEqual([0, 1, 2, 3, 4]); // 2. a bit higher
    expect(out[2]).toEqual([0, 1, 2, 3, 4]); // 3. higher still: the 2 above (위3, 위4) are fixed pages
  });

  it('loads 위5 when the reader is on 위3, because the recycler reaches 2 pages above it', () => {
    const { out } = walk([0, 1, 2, 3]);
    expect(out[3]).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('keeps 2 pages above and 2 below the reader as it goes up, and lets go of what falls out of reach', () => {
    const { out } = walk([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(out[4]).toEqual([0, 1, 2, 3, 4, 5, 6]); // 위4: 위5, 위6 above
    expect(out[5]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]); // 위5: 위6, 위7 above
    expect(out[6]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]); // 위6: 위7, 위8 above, 위5 below
    expect(out[7]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]); // 위7: 위8, 위9 above, 위6, 위5 below
    expect(out[8]).toEqual([0, 1, 2, 3, 4, 6, 7, 8, 9, 10]); // 위8: 위5 is out of reach and dropped
    expect(out[9]).toEqual([0, 1, 2, 3, 4, 7, 8, 9, 10, 11]); // 위9: 위6 and 위5 are gone
  });

  it('brings the pages back the same way on the way down', () => {
    const { out } = walk([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 8, 7]);
    expect(out[8]).toEqual([0, 1, 2, 3, 4, 6, 7, 8, 9, 10]); // 위8 on the way down: 위11 gone, 위10 kept
    expect(out[7]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]); // 위7: 위10 gone, 위5 is back and touches the fixed pages
  });

  it('holds exactly 10 pages in the middle of the run and never more than 10 anywhere', () => {
    let held = bottom;
    for (let page = 0; page <= 60; page++) {
      held = settle(total, five, held, page);
      expect(heldPages(held.messages, total, five.pageSize).length).toBeLessThanOrEqual(10);
    }
  });

  it('keeps the held entries in order, with one gap at most, however the reader goes', () => {
    let held = bottom;
    const path = [...Array(40).keys(), ...Array.from({ length: 40 }, (_, i) => 39 - i), 12, 3, 30, 31, 5];
    for (const page of path) {
      held = settle(total, five, held, page);
      const n = held.messages.map(m => Number((m.uuid ?? 'c0').slice(1)));
      const jumps = n.filter((v, i) => i > 0 && v !== n[i - 1] + 1).length;
      expect(jumps).toBe(held.state.gap ? 1 : 0);
      expect(new Set(n).size).toBe(n.length);
    }
  });

  it('never drops the newest pages', () => {
    let held = bottom;
    for (let page = 0; page <= 70; page += 7) held = settle(total, five, held, page);
    const last = lastUuidOf(held.messages);
    expect(last).toBe(`c${total}`);
    expect(heldPages(held.messages, total, five.pageSize).slice(0, 5)).toEqual([0, 1, 2, 3, 4]);
  });

  it('settles in a few steps and does not load a page it has just dropped', () => {
    let held = bottom;
    for (let page = 0; page <= 30; page++) {
      const before = held;
      held = settle(total, five, held, page);
      const steps = settle(total, five, before, page).steps;
      expect(steps.length).toBeLessThanOrEqual(8);
      // Settling again from where it settled asks for nothing.
      expect(settle(total, five, held, page).steps).toEqual([]);
    }
  });
});

describe('the screen can cover several pages', () => {
  // Pages much shorter than the screen: the middle of the screen is well inside what the reader sees.
  const total = 400;
  const chain = range('c', 1, total);
  const pagesHeld = (messages: readonly WindowEntry[]) => heldPages(messages, total, five.pageSize);

  it('keeps `above` pages above the first page on the screen, not above the middle of it', () => {
    // The newest 5 pages held; the screen shows pages 4 and 3 and 2 (a page is short) and the reader is at the top of what is held.
    const held = loadInitial(chain.slice(total - 20), true);
    const spans = pageSpans(held.messages, held.state, five);
    // The screen starts on the oldest held page and ends on the third: the oldest page has nothing above it.
    const step = nextStep(held.messages, held.state, five, spans[0].from, spans[2].from);
    expect(step.kind).toBe('loadOlder');
  });

  it('settles to above + the screen + below, however many pages the screen covers', () => {
    let messages = chain.slice(total - 20);
    let state: WindowState = loadInitial(messages, true).state;
    // The screen covers 3 pages and sits `down` pages from the newest.
    const settleRange = (screenTopPage: number, pages: number) => {
      for (let guard = 0; guard < 100; guard++) {
        const spans = pageSpans(messages, state, five);
        const topUuid = `c${total - five.pageSize * (screenTopPage + 1) + 1}`;
        const bottomUuid = `c${total - five.pageSize * (screenTopPage - pages + 2) + 1}`;
        const top = messages.findIndex(m => m.uuid === topUuid);
        const bottom = messages.findIndex(m => m.uuid === bottomUuid);
        const step = nextStep(messages, state, five, top === -1 ? 0 : top, bottom === -1 ? messages.length - 1 : bottom);
        if (step.kind === 'none') return;
        const at = (uuid: string) => chain.findIndex(m => m.uuid === uuid);
        if (step.kind === 'drop') ({ messages, state } = dropPage(messages, state, five, step.start));
        else if (step.kind === 'loadOlder') {
          const end = at(step.beforeUuid);
          const start = Math.max(0, end - five.pageSize);
          ({ messages, state } = prependOlder(messages, state, chain.slice(start, end), start > 0));
        } else if (step.kind === 'loadNewer') {
          const start = at(step.afterUuid) + 1;
          const stop = state.gap ? at(state.gap.beforeUuid) : total;
          const end = Math.min(start + five.pageSize, stop);
          ({ messages, state } = appendNewer(messages, state, chain.slice(start, end), end === stop));
        } else {
          const end = at(step.beforeUuid);
          const floor = state.gap ? at(state.gap.afterUuid) + 1 : 0;
          const start = Math.max(floor, end - five.pageSize);
          ({ messages, state } = prependToLatest(messages, state, chain.slice(floor > start ? floor : start, end), start <= floor));
        }
        void spans;
      }
    };
    // A screen covering pages 12, 11 and 10 (counted from the newest, 0 = newest): 2 above page 12, 2 below page 10.
    settleRange(12, 3);
    expect(pagesHeld(messages)).toEqual([0, 1, 2, 3, 4, 8, 9, 10, 11, 12, 13, 14]);
    // Moving the screen up by a page: one more page above it, one fewer below it.
    settleRange(13, 3);
    expect(pagesHeld(messages)).toEqual([0, 1, 2, 3, 4, 9, 10, 11, 12, 13, 14, 15]);
  });
});

describe('the stream keeps adding to the newest page', () => {
  it('turns the new entries into pages, so the newest pages stay a bounded size while the old ones go', () => {
    // 20 held entries, then the stream adds 400 more, one reader at the bottom.
    let messages: WindowEntry[] = range('c', 1, 20);
    let state: WindowState = { gap: null, hasOlder: true, starts: ['c1'] };
    for (let n = 21; n <= 420; n++) {
      messages = [...messages, e(`c${n}`)];
      state = normalizeState(messages, state);
      // The reader is at the bottom: on the newest page.
      for (let guard = 0; guard < 20; guard++) {
        const step = nextStep(messages, state, five, messages.length - 1);
        if (step.kind !== 'drop') break;
        ({ messages, state } = dropPage(messages, state, five, step.start));
      }
    }
    const spans = pageSpans(messages, state, five);
    // The fixed pages are the newest 5 and, with the reader on the newest, nothing else is held.
    expect(spans.length).toBeLessThanOrEqual(6);
    expect(messages.length).toBeLessThan(five.pageSize * 7 + five.pageSize);
    expect(lastUuidOf(messages)).toBe('c420');
    expect(state.hasOlder).toBe(true);
  });
});

describe('with window sliding off (recycle: false)', () => {
  const off: WindowConfig = { ...five, recycle: false };
  const total = 400;
  const chain = range('c', 1, total);

  it('never drops a page, however far the reader is from the oldest ones', () => {
    // Twelve pages held, the reader at the newest: with the window on, the oldest ones are dropped.
    let messages = chain.slice(total - 48);
    const state: WindowState = loadInitial(messages, true).state;
    expect(nextStep(messages, state, five, messages.length - 1).kind).toBe('drop');
    expect(nextStep(messages, state, off, messages.length - 1).kind).toBe('none');
  });

  it('leaves loading older pages to the caller', () => {
    // At the top of what is held, the window on asks for the next older page; off, the stepper says nothing.
    const held = loadInitial(chain.slice(total - 20), true);
    expect(nextStep(held.messages, held.state, five, 0).kind).toBe('loadOlder');
    expect(nextStep(held.messages, held.state, off, 0).kind).toBe('none');
  });

  it('still closes a hole a jump left, from whichever side the reader is on', () => {
    const gap = { afterUuid: 'e8', beforeUuid: 'e23' };
    const held = [...range('e', 1, 8), ...range('e', 23, 30)];
    const state: WindowState = { gap, hasOlder: true, starts: ['e1', 'e5', 'e23', 'e27'] };
    // The reader is in the pages before the hole: the next page after them is asked for.
    expect(nextStep(held, state, off, 2)).toEqual({ kind: 'loadNewer', afterUuid: 'e8' });
    // The reader is in the pages after the hole: the page before those is asked for.
    expect(nextStep(held, state, off, 10)).toEqual({ kind: 'loadBeforeLatest', beforeUuid: 'e23' });
  });

  it('treats a missing flag as the window on', () => {
    expect(five.recycle).toBeUndefined();
    const held = loadInitial(chain.slice(total - 20), true);
    expect(nextStep(held.messages, held.state, five, 0).kind).toBe('loadOlder');
  });
});
