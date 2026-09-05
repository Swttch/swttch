import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('../getProjectSessionsPath', () => ({
  getProjectSessionsPath: vi.fn(),
}));

vi.mock('../extractSessionInfo', () => ({
  extractSessionInfo: vi.fn(),
  scanTail: vi.fn(),
}));

vi.mock('../sessionTitleOverrides', () => ({
  readSessionTitleOverrides: vi.fn(),
}));

import { readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { getSessionsList } from '../getSessionsList';
import { getProjectSessionsPath } from '../getProjectSessionsPath';
import { extractSessionInfo, scanTail } from '../extractSessionInfo';
import { readSessionTitleOverrides } from '../sessionTitleOverrides';

const mockReaddir = vi.mocked(readdir);
const mockStat = vi.mocked(stat);
const mockExistsSync = vi.mocked(existsSync);
const mockGetPath = vi.mocked(getProjectSessionsPath);
const mockExtractInfo = vi.mocked(extractSessionInfo);
const mockScanTail = vi.mocked(scanTail);
const mockReadOverrides = vi.mocked(readSessionTitleOverrides);

/** Give each file the timestamp the ordering pass will read from its tail. */
function tailTimestamps(byFile: Record<string, string | null>) {
  mockScanTail.mockImplementation(async (file: string) => {
    const name = file.split('/').pop() ?? file;
    return { lastTimestamp: byFile[name] ?? null, summary: null };
  });
}

/** Give each session the info the title pass will read from its head. */
function headInfo(byId: Record<string, Partial<ReturnType<typeof info>>>) {
  mockExtractInfo.mockImplementation(async (file: string) => {
    const id = (file.split('/').pop() ?? file).replace(/\.jsonl$/, '');
    const found = byId[id];
    if (!found) throw new Error(`no fixture for ${id}`);
    return info(found);
  });
}

function info(overrides: Partial<{
  title: string;
  lastTimestamp: string | null;
  createdAt: string;
  messageCount: number | null;
  isSidechain: boolean;
}> = {}) {
  return {
    title: 'Session',
    lastTimestamp: '2025-01-01T00:00:00Z',
    createdAt: '2025-01-01T00:00:00Z',
    messageCount: null,
    isSidechain: false,
    ...overrides,
  };
}

describe('getSessionsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPath.mockResolvedValue('/home/.claude/projects/-test');
    mockReadOverrides.mockResolvedValue({});
    mockExistsSync.mockReturnValue(true);
    mockStat.mockResolvedValue({ mtimeMs: 0 } as unknown as Awaited<ReturnType<typeof stat>>);
  });

  it('should return empty result when sessions dir does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    const result = await getSessionsList('/test');
    expect(result).toEqual({ sessions: [], total: 0, hasMore: false, nextOffset: 0 });
  });

  it('should return sessions sorted by lastTimestamp descending', async () => {
    mockReaddir.mockResolvedValue(['sess-1.jsonl', 'sess-2.jsonl'] as unknown as Awaited<ReturnType<typeof readdir>>);
    tailTimestamps({ 'sess-1.jsonl': '2025-01-01T00:00:00Z', 'sess-2.jsonl': '2025-01-02T00:00:00Z' });
    headInfo({ 'sess-1': { title: 'Old session' }, 'sess-2': { title: 'New session' } });

    const result = await getSessionsList('/test');

    expect(result.sessions).toHaveLength(2);
    expect(result.sessions[0].sessionId).toBe('sess-2');
    expect(result.sessions[1].sessionId).toBe('sess-1');
    expect(result.total).toBe(2);
    expect(result.hasMore).toBe(false);
  });

  it('should filter only .jsonl files', async () => {
    mockReaddir.mockResolvedValue(['sess-1.jsonl', 'readme.txt', 'data.json'] as unknown as Awaited<ReturnType<typeof readdir>>);
    tailTimestamps({ 'sess-1.jsonl': '2025-01-01T00:00:00Z' });
    headInfo({ 'sess-1': {} });

    const result = await getSessionsList('/test');

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].sessionId).toBe('sess-1');
  });

  it('should skip sessions that fail to parse', async () => {
    mockReaddir.mockResolvedValue(['good.jsonl', 'bad.jsonl'] as unknown as Awaited<ReturnType<typeof readdir>>);
    tailTimestamps({ 'good.jsonl': '2025-01-02T00:00:00Z', 'bad.jsonl': '2025-01-01T00:00:00Z' });
    mockExtractInfo.mockImplementation(async (file: string) => {
      if (file.endsWith('bad.jsonl')) throw new Error('Parse failed');
      return info({ title: 'Good' });
    });

    const result = await getSessionsList('/test');

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].title).toBe('Good');
  });

  it('should override the title with a stored override when one exists', async () => {
    mockReaddir.mockResolvedValue(['sess-1.jsonl', 'sess-2.jsonl'] as unknown as Awaited<ReturnType<typeof readdir>>);
    tailTimestamps({ 'sess-1.jsonl': '2025-01-02T00:00:00Z', 'sess-2.jsonl': '2025-01-01T00:00:00Z' });
    headInfo({ 'sess-1': { title: 'Original 1' }, 'sess-2': { title: 'Original 2' } });
    mockReadOverrides.mockResolvedValue({ 'sess-1': 'Renamed 1' });

    const result = await getSessionsList('/test');

    expect(result.sessions.find((s) => s.sessionId === 'sess-1')?.title).toBe('Renamed 1');
    expect(result.sessions.find((s) => s.sessionId === 'sess-2')?.title).toBe('Original 2');
  });

  it('should keep the original title when no override exists', async () => {
    mockReaddir.mockResolvedValue(['sess-1.jsonl'] as unknown as Awaited<ReturnType<typeof readdir>>);
    tailTimestamps({ 'sess-1.jsonl': '2025-01-01T00:00:00Z' });
    headInfo({ 'sess-1': { title: 'Original' } });
    mockReadOverrides.mockResolvedValue({ 'other-session': 'Irrelevant' });

    const result = await getSessionsList('/test');
    expect(result.sessions[0].title).toBe('Original');
  });

  it('states the directory each session belongs to', async () => {
    mockReaddir.mockResolvedValue(['sess-1.jsonl'] as unknown as Awaited<ReturnType<typeof readdir>>);
    tailTimestamps({ 'sess-1.jsonl': '2025-01-01T00:00:00Z' });
    headInfo({ 'sess-1': {} });

    const result = await getSessionsList('/test');
    expect(result.sessions[0].sessionDir).toBe('/test');
  });

  describe('paging', () => {
    const five = ['a.jsonl', 'b.jsonl', 'c.jsonl', 'd.jsonl', 'e.jsonl'];

    beforeEach(() => {
      mockReaddir.mockResolvedValue(five as unknown as Awaited<ReturnType<typeof readdir>>);
      tailTimestamps({
        'a.jsonl': '2025-01-05T00:00:00Z',
        'b.jsonl': '2025-01-04T00:00:00Z',
        'c.jsonl': '2025-01-03T00:00:00Z',
        'd.jsonl': '2025-01-02T00:00:00Z',
        'e.jsonl': '2025-01-01T00:00:00Z',
      });
      headInfo({ a: {}, b: {}, c: {}, d: {}, e: {} });
    });

    it('returns every session when no limit is given', async () => {
      const result = await getSessionsList('/test');
      expect(result.sessions.map((s) => s.sessionId)).toEqual(['a', 'b', 'c', 'd', 'e']);
      expect(result.hasMore).toBe(false);
    });

    it('returns only the newest page and reports that more remain', async () => {
      const result = await getSessionsList('/test', { limit: 2 });
      expect(result.sessions.map((s) => s.sessionId)).toEqual(['a', 'b']);
      expect(result.total).toBe(5);
      expect(result.hasMore).toBe(true);
    });

    it('continues from the offset on the next page', async () => {
      const result = await getSessionsList('/test', { offset: 2, limit: 2 });
      expect(result.sessions.map((s) => s.sessionId)).toEqual(['c', 'd']);
      expect(result.hasMore).toBe(true);
    });

    it('reports no more remaining once the last page is served', async () => {
      const result = await getSessionsList('/test', { offset: 4, limit: 2 });
      expect(result.sessions.map((s) => s.sessionId)).toEqual(['e']);
      expect(result.hasMore).toBe(false);
    });

    // A page of 20 that came back with 19 rows would be indistinguishable from
    // the end of the list, so a skipped session must not consume a slot.
    it('reads past a sidechain rather than letting it use up a slot', async () => {
      headInfo({ a: {}, b: { isSidechain: true }, c: {}, d: {}, e: {} });

      const result = await getSessionsList('/test', { limit: 2 });

      expect(result.sessions.map((s) => s.sessionId)).toEqual(['a', 'c']);
      expect(result.hasMore).toBe(true);
    });

    // Counting returned rows would overlap the skipped ones, re-reading them on
    // the next page. The walk's own position is the only correct continuation.
    it('continues from where the walk stopped, not from the number of rows returned', async () => {
      headInfo({ a: {}, b: { isSidechain: true }, c: {}, d: {}, e: {} });

      const first = await getSessionsList('/test', { limit: 2 });
      expect(first.sessions.map((s) => s.sessionId)).toEqual(['a', 'c']);
      expect(first.nextOffset).toBe(3);

      const second = await getSessionsList('/test', { offset: first.nextOffset, limit: 2 });
      expect(second.sessions.map((s) => s.sessionId)).toEqual(['d', 'e']);
      expect(second.hasMore).toBe(false);
    });

    // The whole point of paging is that the files past the page stay closed.
    it('does not open the transcripts beyond the requested page', async () => {
      await getSessionsList('/test', { limit: 2 });

      const opened = mockExtractInfo.mock.calls.map((c) => String(c[0]).split('/').pop());
      expect(opened).not.toContain('e.jsonl');
      expect(mockExtractInfo.mock.calls.length).toBeLessThan(five.length);
    });

    // Ordering has to see every session, or the "newest N" is only the newest N
    // of whatever subset happened to be examined.
    it('orders across every session before cutting the page', async () => {
      await getSessionsList('/test', { limit: 1 });
      expect(mockScanTail.mock.calls.length).toBe(five.length);
    });
  });
});
