import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../extractSessionInfo', () => ({
  extractSessionInfo: vi.fn(),
  scanTail: vi.fn(),
}));
vi.mock('../sessionTitleOverrides', () => ({
  readSessionTitleOverrides: vi.fn(),
}));
vi.mock('../sessionTitleSettings', () => ({
  includeLastPromptInTitles: vi.fn(),
}));
vi.mock('../sessionMarks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sessionMarks')>()),
  readSessionMarksToShow: vi.fn(),
}));

import { orderByFamily } from '../sessionFamilyOrder';
import { resolvePage, type SessionSortKey } from '../getSessionsList';
import { extractSessionInfo } from '../extractSessionInfo';
import { readSessionTitleOverrides } from '../sessionTitleOverrides';
import { includeLastPromptInTitles } from '../sessionTitleSettings';
import { readSessionMarksToShow, SessionMark } from '../sessionMarks';

const mockExtract = vi.mocked(extractSessionInfo);
const mockOverrides = vi.mocked(readSessionTitleOverrides);
const mockLastPrompt = vi.mocked(includeLastPromptInTitles);
const mockMarks = vi.mocked(readSessionMarksToShow);

/**
 * A page of the session list holds whole families: a top-level session and
 * everything under it, however many that is. The page is counted in top-level
 * sessions.
 */

const HOUR = 60 * 60 * 1000;
const T0 = Date.parse('2026-11-11T00:00:00Z');

/** A key `hoursAgo` hours before T0 (smaller means newer). */
function key(sessionId: string, hoursAgo: number): SessionSortKey {
  return {
    sessionId,
    fullPath: `/p/${sessionId}.jsonl`,
    sessionsPath: '/p',
    sessionDir: '/work',
    sortedAt: T0 - hoursAgo * HOUR,
  };
}

function marks(entries: Record<string, { startedBy: string; startedAt?: number }>) {
  return new Map(
    Object.entries(entries).map(([id, mark]) => [
      id,
      new SessionMark({ id, parentSessionUid: mark.startedBy, startedAt: mark.startedAt ?? 0 }),
    ]),
  );
}

function idsOf(keys: SessionSortKey[]): string[] {
  return keys.map((k) => k.sessionId);
}

describe('orderByFamily', () => {
  it('keeps the order it was given while no session started another', () => {
    const keys = [key('a', 1), key('b', 2), key('c', 3)];

    const order = orderByFamily(keys, new Map());

    expect(idsOf(order.keys)).toEqual(['a', 'b', 'c']);
    expect([0, 1, 2].map((i) => order.familyEnd(i))).toEqual([1, 2, 3]);
  });

  it('puts every session under a top-level session right after it, to any depth', () => {
    // manager > deploy > verify, and manager > review. `other` is newer than
    // the whole family and stays first.
    const keys = [
      key('other', 0.5),
      key('manager', 1),
      key('review', 2),
      key('verify', 3),
      key('deploy', 4),
    ];
    const order = orderByFamily(
      keys,
      marks({
        deploy: { startedBy: 'manager', startedAt: 10 },
        verify: { startedBy: 'deploy', startedAt: 20 },
        review: { startedBy: 'manager', startedAt: 30 },
      }),
    );

    expect(idsOf(order.keys)).toEqual(['other', 'manager', 'deploy', 'verify', 'review']);
    expect(order.familyEnd(0)).toBe(1);
    // Every member of the family reports the same end.
    expect([1, 2, 3, 4].map((i) => order.familyEnd(i))).toEqual([5, 5, 5, 5]);
  });

  it('places a family by its most recent session, wherever that session sits', () => {
    // The manager last moved ten days ago; a session it started moved an hour
    // ago. The family belongs ahead of the session from yesterday.
    const keys = [key('child', 1), key('yesterday', 24), key('manager', 240)];
    const order = orderByFamily(keys, marks({ child: { startedBy: 'manager' } }));

    expect(idsOf(order.keys)).toEqual(['manager', 'child', 'yesterday']);
  });

  it('treats a session whose starter is not in the listing as top-level', () => {
    const keys = [key('child', 1), key('b', 2)];
    const order = orderByFamily(keys, marks({ child: { startedBy: 'a-session-in-another-folder' } }));

    expect(idsOf(order.keys)).toEqual(['child', 'b']);
  });

  it('keeps both sessions when two records each name the other as the starter', () => {
    const keys = [key('a', 1), key('b', 2)];
    const order = orderByFamily(keys, marks({ a: { startedBy: 'b' }, b: { startedBy: 'a' } }));

    expect(idsOf(order.keys).sort()).toEqual(['a', 'b']);
  });
});

describe('resolvePage — pages of whole families', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOverrides.mockResolvedValue({});
    mockLastPrompt.mockResolvedValue(false);
    mockExtract.mockImplementation(async () => ({
      title: 'Session',
      lastTimestamp: null,
      createdAt: '2026-11-10T00:00:00Z',
      messageCount: 1,
      isSidechain: false,
    }));
  });

  /** One manager with `count` sessions it started, each older than the one before. */
  function crowdedManager(count: number) {
    const keys: SessionSortKey[] = [key('manager', 1)];
    const entries: Record<string, { startedBy: string; startedAt: number }> = {};
    for (let i = 0; i < count; i++) {
      keys.push(key(`child-${i}`, 100 + i));
      entries[`child-${i}`] = { startedBy: 'manager', startedAt: i + 1 };
    }
    return { keys, entries };
  }

  it('brings a session that is far older than its starter on the same page', async () => {
    // Forty sessions started by the manager, the oldest of them days older than
    // anything else on the page. Plain paging by row would leave most of them
    // for a later page and draw the family half empty.
    const { keys, entries } = crowdedManager(40);
    const lone = [key('lone-1', 2), key('lone-2', 3)];
    mockMarks.mockResolvedValue(marks(entries));

    const page = await resolvePage([...lone.slice(0, 1), ...keys, ...lone.slice(1)].sort((a, b) => b.sortedAt - a.sortedAt), {
      limit: 2,
    });

    // Two top-level sessions: `manager` (with all forty) and `lone-1`.
    expect(page.sessions).toHaveLength(42);
    expect(page.sessions.map((s) => s.sessionId)).toContain('child-39');
  });

  it('counts the page in top-level sessions, not rows', async () => {
    const { keys, entries } = crowdedManager(5);
    mockMarks.mockResolvedValue(marks(entries));
    const all = [...keys, key('lone-1', 2), key('lone-2', 3), key('lone-3', 4)].sort(
      (a, b) => b.sortedAt - a.sortedAt,
    );

    const first = await resolvePage(all, { limit: 2 });

    expect(first.sessions.map((s) => s.sessionId)).toEqual([
      'manager',
      'child-0',
      'child-1',
      'child-2',
      'child-3',
      'child-4',
      'lone-1',
    ]);
    expect(first.hasMore).toBe(true);
    expect(first.total).toBe(all.length);
  });

  it('continues from where the page before stopped, without a gap or an overlap', async () => {
    const { keys, entries } = crowdedManager(5);
    mockMarks.mockResolvedValue(marks(entries));
    const all = [...keys, key('lone-1', 2), key('lone-2', 3), key('lone-3', 4)].sort(
      (a, b) => b.sortedAt - a.sortedAt,
    );

    const pages = [];
    let offset = 0;
    for (let guard = 0; guard < 10; guard++) {
      const page = await resolvePage(all, { limit: 2, offset });
      pages.push(page);
      if (!page.hasMore) break;
      offset = page.nextOffset;
    }

    const ids = pages.flatMap((p) => p.sessions.map((s) => s.sessionId));
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(all.map((k) => k.sessionId).sort());
    expect(pages).toHaveLength(2);
  });

  it('does not let a family with nothing to show use up a slot', async () => {
    const keys = [key('ghost', 1), key('b', 2), key('c', 3)];
    mockMarks.mockResolvedValue(new Map());
    mockExtract.mockImplementation(async (file: string) => ({
      title: 'Session',
      lastTimestamp: null,
      createdAt: '2026-11-10T00:00:00Z',
      messageCount: 1,
      // A transcript that never held a conversation is not a row.
      isSidechain: file.includes('ghost'),
    }));

    const page = await resolvePage(keys, { limit: 2 });

    expect(page.sessions.map((s) => s.sessionId)).toEqual(['b', 'c']);
  });

  it('pages exactly as before when no session started another', async () => {
    mockMarks.mockResolvedValue(new Map());
    const keys = [key('a', 1), key('b', 2), key('c', 3), key('d', 4)];

    const page = await resolvePage(keys, { limit: 3 });

    expect(page.sessions.map((s) => s.sessionId)).toEqual(['a', 'b', 'c']);
    expect(page.hasMore).toBe(true);
    expect(page.nextOffset).toBe(3);
  });
});
