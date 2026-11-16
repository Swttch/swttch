import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('../getProjectSessionsPath', () => ({
  getProjectSessionsPath: vi.fn(),
}));

import { loadSessionMessages } from '../loadSessionMessages';
import { getProjectSessionsPath } from '../getProjectSessionsPath';

const mockGetPath = vi.mocked(getProjectSessionsPath);

/**
 * The transcript window (#680) lets go of pages that are far from the reader and
 * asks for them again by cursor. These pin what a cursor means on the backend:
 * the page after an entry (`afterUuid`) and the page centred on one (`aroundUuid`),
 * and that walking the pages one way or the other never repeats or skips an entry.
 */
describe('loadSessionMessages: pages after and around an entry', () => {
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await mkdtemp(join(tmpdir(), 'load-session-window-'));
    mockGetPath.mockResolvedValue(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  /** A linear chain c1..cN, with a uuid-less entry after each uuid listed in `withNote`. */
  async function writeChain(count: number, withNote: number[] = []): Promise<string[]> {
    const lines: string[] = [];
    const order: string[] = [];
    let parent: string | undefined;
    for (let i = 1; i <= count; i++) {
      const uuid = `c${i}`;
      lines.push(JSON.stringify({ type: i % 2 ? 'user' : 'assistant', uuid, parentUuid: parent }));
      order.push(uuid);
      parent = uuid;
      if (withNote.includes(i)) {
        lines.push(JSON.stringify({ type: 'summary' })); // no uuid: always kept
        order.push(`note-after-c${i}`);
      }
    }
    await writeFile(join(tmpDir, 'sess.jsonl'), lines.join('\n'));
    return order;
  }

  const label = (m: Record<string, unknown>, after: string | undefined) =>
    (m.uuid as string | undefined) ?? `note-after-${after}`;
  /** Names the uuid-less entries by the entry before them, so a test can read the order. */
  function labels(messages: Array<Record<string, unknown>>): string[] {
    const out: string[] = [];
    let last: string | undefined;
    for (const m of messages) {
      out.push(label(m, last));
      if (typeof m.uuid === 'string') last = m.uuid;
    }
    return out;
  }

  describe('every page reports the cursors around it', () => {
    it('the newest page has no newer entries and names its newest uuid', async () => {
      await writeChain(10);
      const page = await loadSessionMessages('/work', 'sess', undefined, 3);
      expect(labels(page.messages)).toEqual(['c8', 'c9', 'c10']);
      expect(page.hasNewer).toBe(false);
      expect(page.newestUuid).toBe('c10');
      expect(page.reset).toBe(false);
    });

    it('an older page has newer entries after it', async () => {
      await writeChain(10);
      const page = await loadSessionMessages('/work', 'sess', 'c8', 3);
      expect(labels(page.messages)).toEqual(['c5', 'c6', 'c7']);
      expect(page.hasNewer).toBe(true);
      expect(page.newestUuid).toBe('c7');
    });

    it('names the newest uuid even when the page ends with an entry that has none', async () => {
      await writeChain(6, [6]);
      const page = await loadSessionMessages('/work', 'sess', undefined, 3);
      expect(page.messages[page.messages.length - 1].type).toBe('summary');
      expect(page.newestUuid).toBe('c6');
    });
  });

  describe('afterUuid: the page after an entry', () => {
    it('returns the entries right after the cursor, toward the newest', async () => {
      await writeChain(10);
      const page = await loadSessionMessages('/work', 'sess', undefined, 3, 'c3');
      expect(labels(page.messages)).toEqual(['c4', 'c5', 'c6']);
      expect(page.hasNewer).toBe(true);
      expect(page.hasMore).toBe(true);
      expect(page.oldestUuid).toBe('c4');
      expect(page.newestUuid).toBe('c6');
    });

    it('says there is nothing newer once the page reaches the end', async () => {
      await writeChain(10);
      const page = await loadSessionMessages('/work', 'sess', undefined, 3, 'c8');
      expect(labels(page.messages)).toEqual(['c9', 'c10']);
      expect(page.hasNewer).toBe(false);
    });

    it('returns nothing, and no newer entries, for the cursor at the very end', async () => {
      await writeChain(10);
      const page = await loadSessionMessages('/work', 'sess', undefined, 3, 'c10');
      expect(page.messages).toEqual([]);
      expect(page.hasNewer).toBe(false);
      expect(page.newestUuid).toBeUndefined();
    });

    it('does not send the uuid-less entries that belong to the cursor entry again', async () => {
      await writeChain(8, [3]);
      // c3 is followed by a note. The page that ended at c3 carried the note, so the
      // next page starts at c4.
      const page = await loadSessionMessages('/work', 'sess', undefined, 3, 'c3');
      expect(labels(page.messages)).toEqual(['c4', 'c5', 'c6']);
    });

    it('serves the newest page and asks the client to start over when the cursor is gone', async () => {
      await writeChain(10);
      const page = await loadSessionMessages('/work', 'sess', undefined, 3, 'missing');
      expect(labels(page.messages)).toEqual(['c8', 'c9', 'c10']);
      expect(page.reset).toBe(true);
      expect(page.hasNewer).toBe(false);
    });

    it('walks the whole transcript forward without repeating or skipping an entry', async () => {
      const order = await writeChain(37, [4, 5, 11, 20, 36]);
      // Start from the oldest page, found by walking back, then walk forward.
      let cursor: string | undefined;
      let oldest = await loadSessionMessages('/work', 'sess', undefined, 5);
      while (oldest.hasMore) {
        oldest = await loadSessionMessages('/work', 'sess', oldest.oldestUuid, 5);
      }
      const seen: string[] = labels(oldest.messages);
      cursor = oldest.newestUuid;
      for (let guard = 0; guard < 100; guard++) {
        const page = await loadSessionMessages('/work', 'sess', undefined, 5, cursor);
        if (page.messages.length === 0) break;
        seen.push(...labels(page.messages).map((l, i) => (l.startsWith('note-after-') && i === 0 ? l : l)));
        cursor = page.newestUuid;
        if (!page.hasNewer) break;
      }
      // The note names are by the entry before them, and that entry may be on the
      // previous page, so compare on the order of uuid entries and on the count.
      expect(seen.filter(l => !l.startsWith('note-after-'))).toEqual(order.filter(l => !l.startsWith('note-after-')));
      expect(seen).toHaveLength(order.length);
    });
  });

  /*
    The client holds pages on both sides of a gap and asks for what lies between from one
    side or the other. The page has to stop where it would meet what is held, and say so:
    a page that ends exactly where the next one begins holds none of its entries, so the
    client could not otherwise tell the gap is closed.
  */
  describe('untilUuid: stopping where the client already holds what follows', () => {
    it('ends a page after a cursor right in front of the entry it was told to stop at, and says it reached it', async () => {
      await writeChain(20);
      const page = await loadSessionMessages('/work', 'sess', undefined, 5, 'c4', undefined, 'c8');
      expect(labels(page.messages)).toEqual(['c5', 'c6', 'c7']);
      expect(page.reached).toBe(true);
    });

    it('does not say it reached it while the stop is still further than a page away', async () => {
      await writeChain(20);
      const page = await loadSessionMessages('/work', 'sess', undefined, 3, 'c4', undefined, 'c12');
      expect(labels(page.messages)).toEqual(['c5', 'c6', 'c7']);
      expect(page.reached).toBe(false);
    });

    it('reaches the stop when the page ends exactly in front of it', async () => {
      await writeChain(20);
      const page = await loadSessionMessages('/work', 'sess', undefined, 3, 'c4', undefined, 'c8');
      expect(labels(page.messages)).toEqual(['c5', 'c6', 'c7']);
      expect(page.reached).toBe(true);
    });

    it('returns nothing, and reaches the stop, when the cursor is already right in front of it', async () => {
      await writeChain(20);
      const page = await loadSessionMessages('/work', 'sess', undefined, 5, 'c7', undefined, 'c8');
      expect(page.messages).toEqual([]);
      expect(page.reached).toBe(true);
    });

    it('begins a page before a cursor right after the entry it was told to stop at, and says it reached it', async () => {
      await writeChain(20);
      const page = await loadSessionMessages('/work', 'sess', 'c12', 8, undefined, undefined, 'c8');
      expect(labels(page.messages)).toEqual(['c9', 'c10', 'c11']);
      expect(page.reached).toBe(true);
    });

    it('does not say it reached the stop while the page begins before the distance to it', async () => {
      await writeChain(20);
      const page = await loadSessionMessages('/work', 'sess', 'c12', 3, undefined, undefined, 'c2');
      expect(labels(page.messages)).toEqual(['c9', 'c10', 'c11']);
      expect(page.reached).toBe(false);
    });

    it('does not repeat the entries without a uuid that follow the stop entry', async () => {
      await writeChain(20, [8]);
      const page = await loadSessionMessages('/work', 'sess', 'c12', 8, undefined, undefined, 'c8');
      // The note after c8 belongs to c8, which the client holds.
      expect(labels(page.messages)).toEqual(['c9', 'c10', 'c11']);
      expect(page.reached).toBe(true);
    });

    it('says nothing was reached when no stop was named', async () => {
      await writeChain(20);
      const page = await loadSessionMessages('/work', 'sess', undefined, 3, 'c4');
      expect(page.reached).toBe(false);
    });

    it('closes a gap from either side without repeating or skipping an entry', async () => {
      const order = await writeChain(40, [13, 14]);
      // History c1..c8 and the newest c29..c40 are held; fill the gap from the history side.
      let cursor = 'c8';
      const seen: string[] = [];
      for (let guard = 0; guard < 20; guard++) {
        const page = await loadSessionMessages('/work', 'sess', undefined, 5, cursor, undefined, 'c29');
        seen.push(...labels(page.messages));
        cursor = page.newestUuid ?? cursor;
        if (page.reached) break;
      }
      const uuidOnly = (l: string) => !l.startsWith('note-after-');
      expect(seen.filter(uuidOnly)).toEqual(order.filter(uuidOnly).slice(8, 28).filter(l => l !== undefined));
      // And from the newest side, ending where the history ends.
      let before = 'c29';
      const seen2: string[] = [];
      for (let guard = 0; guard < 20; guard++) {
        const page = await loadSessionMessages('/work', 'sess', before, 5, undefined, undefined, 'c8');
        seen2.unshift(...labels(page.messages));
        before = page.oldestUuid ?? before;
        if (page.reached) break;
      }
      expect(seen2.filter(uuidOnly)).toEqual(seen.filter(uuidOnly));
    });
  });

  describe('aroundUuid: the page centred on an entry', () => {
    it('is centred on the entry', async () => {
      await writeChain(20);
      const page = await loadSessionMessages('/work', 'sess', undefined, 4, undefined, 'c10');
      expect(labels(page.messages)).toEqual(['c8', 'c9', 'c10', 'c11']);
      expect(page.hasMore).toBe(true);
      expect(page.hasNewer).toBe(true);
      expect(page.oldestUuid).toBe('c8');
      expect(page.newestUuid).toBe('c11');
    });

    it('starts at the beginning for an entry near it, and says nothing is older', async () => {
      await writeChain(20);
      const page = await loadSessionMessages('/work', 'sess', undefined, 4, undefined, 'c1');
      expect(page.messages[0].uuid).toBe('c1');
      expect(page.hasMore).toBe(false);
      expect(page.messages.some(m => m.uuid === 'c1')).toBe(true);
    });

    it('runs to the end for an entry near it, and says nothing is newer', async () => {
      await writeChain(20);
      const page = await loadSessionMessages('/work', 'sess', undefined, 4, undefined, 'c20');
      expect(page.messages[page.messages.length - 1].uuid).toBe('c20');
      expect(page.hasNewer).toBe(false);
    });

    it('always holds the entry it was asked for, even when uuid-less entries fall at the edge', async () => {
      await writeChain(20, [10, 11, 12]);
      const page = await loadSessionMessages('/work', 'sess', undefined, 2, undefined, 'c11');
      expect(page.messages.some(m => m.uuid === 'c11')).toBe(true);
    });

    it('serves the newest page and asks the client to start over when the entry is gone', async () => {
      await writeChain(10);
      const page = await loadSessionMessages('/work', 'sess', undefined, 3, undefined, 'missing');
      expect(page.reset).toBe(true);
      expect(labels(page.messages)).toEqual(['c8', 'c9', 'c10']);
    });
  });
});
