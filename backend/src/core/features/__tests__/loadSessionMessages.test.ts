import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('../getProjectSessionsPath', () => ({
  getProjectSessionsPath: vi.fn(),
}));

// Wrap the real readJsonlEntries in a spy so tests can assert whether a page
// request actually touched disk (cache behavior, issue #8) while preserving
// real parsing behavior for every other test.
vi.mock('../readJsonlEntries', async (importActual) => {
  const actual = await importActual<typeof import('../readJsonlEntries')>();
  return { readJsonlEntries: vi.fn(actual.readJsonlEntries) };
});

import { loadSessionMessages } from '../loadSessionMessages';
import { getProjectSessionsPath } from '../getProjectSessionsPath';
import { readJsonlEntries } from '../readJsonlEntries';

const mockGetPath = vi.mocked(getProjectSessionsPath);
const mockReadJsonl = vi.mocked(readJsonlEntries);

describe('loadSessionMessages', () => {
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await mkdtemp(join(tmpdir(), 'load-session-'));
    mockGetPath.mockResolvedValue(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function writeSession(sessionId: string, lines: string[]): Promise<void> {
    await writeFile(join(tmpDir, `${sessionId}.jsonl`), lines.join('\n'));
  }

  it('should load and parse JSONL messages', async () => {
    await writeSession('sess-1', [
      JSON.stringify({ type: 'user', uuid: 'u1', message: { content: 'Hello' } }),
      JSON.stringify({ type: 'assistant', uuid: 'u2', message: { content: 'Hi' } }),
    ]);

    const result = await loadSessionMessages('/work', 'sess-1');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].type).toBe('user');
    expect(result.messages[1].type).toBe('assistant');
  });

  it('should skip invalid JSON lines', async () => {
    await writeSession('sess-1', [
      'invalid json',
      JSON.stringify({ type: 'user', uuid: 'u1' }),
      '{broken',
    ]);

    const result = await loadSessionMessages('/work', 'sess-1');
    expect(result.messages).toHaveLength(1);
  });

  it('should return empty array on file read error', async () => {
    const result = await loadSessionMessages('/work', 'nonexistent');
    expect(result.messages).toEqual([]);
  });

  it('should pass through all JSONL entry types without filtering', async () => {
    await writeSession('sess-1', [
      JSON.stringify({ type: 'user', uuid: 'u1' }),
      JSON.stringify({ type: 'assistant', uuid: 'u2' }),
      JSON.stringify({ type: 'summary', leafUuid: 'u2', summary: 'test' }),
      JSON.stringify({ type: 'system', uuid: 'u3' }),
      JSON.stringify({ type: 'progress', uuid: 'u4' }),
    ]);

    const result = await loadSessionMessages('/work', 'sess-1');
    expect(result.messages).toHaveLength(5);
  });

  it('should skip empty lines', async () => {
    await writeSession('sess-1', ['', JSON.stringify({ type: 'user', uuid: 'u1' }), '', '']);
    const result = await loadSessionMessages('/work', 'sess-1');
    expect(result.messages).toHaveLength(1);
  });

  // Regression test for issue #19: large session files must stream, not block.
  it('should handle multi-megabyte session files without exhausting memory', async () => {
    const lines: string[] = [];
    const bulk = 'A'.repeat(1000);
    for (let i = 0; i < 10_000; i++) {
      lines.push(
        JSON.stringify({
          type: i % 2 === 0 ? 'user' : 'assistant',
          uuid: `u${i}`,
          message: { content: [{ type: 'text', text: bulk }] },
        }),
      );
    }
    await writeSession('sess-big', lines);

    const result = await loadSessionMessages('/work', 'sess-big', undefined, 15_000);
    expect(result.messages).toHaveLength(10_000);
    expect(result.messages[0].type).toBe('user');
    expect(result.messages[9_999].type).toBe('assistant');
  }, 15_000);

  it('does not re-send uuid-less entries across a page boundary', async () => {
    // Single active chain (linked by parentUuid) with a uuid-less summary entry
    // sitting where the default page boundary would fall.
    await writeSession('sess-pg', [
      JSON.stringify({ type: 'user', uuid: 'u1' }),
      JSON.stringify({ type: 'assistant', uuid: 'a1', parentUuid: 'u1' }),
      JSON.stringify({ type: 'user', uuid: 'u2', parentUuid: 'a1' }),
      JSON.stringify({ type: 'assistant', uuid: 'a2', parentUuid: 'u2' }),
      JSON.stringify({ type: 'summary' }), // no uuid — always kept by filterActiveChain
      JSON.stringify({ type: 'user', uuid: 'u3', parentUuid: 'a2' }),
      JSON.stringify({ type: 'assistant', uuid: 'a3', parentUuid: 'u3' }),
    ]);

    // Latest page (size 3) snaps its start back to a2 so it begins on a uuid,
    // pulling the summary into this page rather than leaving it at the boundary.
    const first = await loadSessionMessages('/work', 'sess-pg', undefined, 3);
    expect(first.messages.map((m) => m.uuid ?? m.type)).toEqual(['a2', 'summary', 'u3', 'a3']);
    expect(first.oldestUuid).toBe('a2');
    expect(first.hasMore).toBe(true);

    // The older page starts exactly before the cursor — the summary is NOT repeated.
    const older = await loadSessionMessages('/work', 'sess-pg', 'a2', 3);
    expect(older.messages.map((m) => m.uuid ?? m.type)).toEqual(['u1', 'a1', 'u2']);
    expect(older.messages.some((m) => m.type === 'summary')).toBe(false);
    expect(older.hasMore).toBe(false);
  });

  // Issue #8: paging must not re-read the whole file on every page.
  it('serves a second page from cache without re-reading the unchanged file', async () => {
    await writeSession('sess-cache', [
      JSON.stringify({ type: 'user', uuid: 'u1' }),
      JSON.stringify({ type: 'assistant', uuid: 'a1', parentUuid: 'u1' }),
      JSON.stringify({ type: 'user', uuid: 'u2', parentUuid: 'a1' }),
      JSON.stringify({ type: 'assistant', uuid: 'a2', parentUuid: 'u2' }),
    ]);

    // First load populates the cache and reads the main file exactly once.
    const first = await loadSessionMessages('/work', 'sess-cache', undefined, 2);
    expect(first.messages.map((m) => m.uuid)).toEqual(['u2', 'a2']);
    expect(mockReadJsonl).toHaveBeenCalledTimes(1);

    // A page request against the same (unchanged) file must be served from the
    // cached snapshot — no additional disk read.
    mockReadJsonl.mockClear();
    const older = await loadSessionMessages('/work', 'sess-cache', 'u2', 2);
    expect(older.messages.map((m) => m.uuid)).toEqual(['u1', 'a1']);
    expect(mockReadJsonl).not.toHaveBeenCalled();
  });

  // Issue #8: a real content change (different mtime/size) must invalidate the cache.
  it('recomputes the snapshot after the session file changes', async () => {
    await writeSession('sess-inv', [
      JSON.stringify({ type: 'user', uuid: 'u1' }),
      JSON.stringify({ type: 'assistant', uuid: 'a1', parentUuid: 'u1' }),
    ]);

    const first = await loadSessionMessages('/work', 'sess-inv');
    expect(first.messages.map((m) => m.uuid)).toEqual(['u1', 'a1']);

    // Append a new turn: size (and mtime) change, so the fingerprint no longer matches.
    await writeSession('sess-inv', [
      JSON.stringify({ type: 'user', uuid: 'u1' }),
      JSON.stringify({ type: 'assistant', uuid: 'a1', parentUuid: 'u1' }),
      JSON.stringify({ type: 'user', uuid: 'u2', parentUuid: 'a1' }),
      JSON.stringify({ type: 'assistant', uuid: 'a2', parentUuid: 'u2' }),
    ]);

    mockReadJsonl.mockClear();
    const second = await loadSessionMessages('/work', 'sess-inv');
    // The new messages are visible and the file was re-read.
    expect(second.messages.map((m) => m.uuid)).toEqual(['u1', 'a1', 'u2', 'a2']);
    expect(mockReadJsonl).toHaveBeenCalledTimes(1);
  });

  // Issue #6: a cursor that isn't in the active chain must not strand older history.
  it('does not strand history when beforeUuid is not found', async () => {
    await writeSession('sess-miss', [
      JSON.stringify({ type: 'user', uuid: 'u1' }),
      JSON.stringify({ type: 'assistant', uuid: 'a1', parentUuid: 'u1' }),
      JSON.stringify({ type: 'user', uuid: 'u2', parentUuid: 'a1' }),
      JSON.stringify({ type: 'assistant', uuid: 'a2', parentUuid: 'u2' }),
    ]);

    // Cursor uuid does not exist in the chain: the old code returned an empty page
    // with hasMore=false, permanently hiding all older messages. The fallback must
    // instead return a real page whose oldestUuid is a genuine chain uuid so the
    // client can keep paging.
    const result = await loadSessionMessages('/work', 'sess-miss', 'does-not-exist', 2);
    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.oldestUuid).toBeDefined();
    // oldestUuid must be an actual message in the chain (so the next page locates it).
    expect(['u1', 'u2', 'a1', 'a2']).toContain(result.oldestUuid);
    // hasMore stays honest: there is older history before this fallback page.
    expect(result.hasMore).toBe(true);
  });

  // On reload, the composer should restore the session's actual mode rather than
  // falling back to the configured default — that fallback is what looked like the
  // mode "resetting itself" on refresh.
  describe('lastReportedMode', () => {
    it('finds the most recent permissionMode within the newest page', async () => {
      await writeSession('sess-mode', [
        JSON.stringify({ type: 'user', uuid: 'u1', permissionMode: 'plan' }),
        JSON.stringify({ type: 'assistant', uuid: 'a1', parentUuid: 'u1' }),
        JSON.stringify({ type: 'user', uuid: 'u2', parentUuid: 'a1', permissionMode: 'default' }),
        JSON.stringify({ type: 'assistant', uuid: 'a2', parentUuid: 'u2' }),
      ]);

      const result = await loadSessionMessages('/work', 'sess-mode');
      expect(result.lastReportedMode).toBe('ask_before_edit');
    });

    it('translates every CLI flag into the webview vocabulary', async () => {
      await writeSession('sess-flags', [
        JSON.stringify({ type: 'user', uuid: 'u1', permissionMode: 'bypassPermissions' }),
      ]);

      const result = await loadSessionMessages('/work', 'sess-flags');
      expect(result.lastReportedMode).toBe('bypass');
    });

    it('is null when the newest page carries no permissionMode at all', async () => {
      await writeSession('sess-none', [
        JSON.stringify({ type: 'user', uuid: 'u1' }),
        JSON.stringify({ type: 'assistant', uuid: 'a1', parentUuid: 'u1' }),
      ]);

      const result = await loadSessionMessages('/work', 'sess-none');
      expect(result.lastReportedMode).toBeNull();
    });

    // The whole point of bounding the search to one page: an older page must not
    // pay for (or claim to know) the session's current mode.
    it('is null on an older ("load older") page even if that page has a mode', async () => {
      await writeSession('sess-old-page', [
        JSON.stringify({ type: 'user', uuid: 'u1', permissionMode: 'plan' }),
        JSON.stringify({ type: 'assistant', uuid: 'a1', parentUuid: 'u1' }),
        JSON.stringify({ type: 'user', uuid: 'u2', parentUuid: 'a1' }),
        JSON.stringify({ type: 'assistant', uuid: 'a2', parentUuid: 'u2' }),
      ]);

      const result = await loadSessionMessages('/work', 'sess-old-page', 'u2', 10);
      expect(result.lastReportedMode).toBeNull();
    });

    // A tool_result is JSONL type "user" but carries no permissionMode — it is not a
    // prompt the CLI processed under any mode. A real session's last entries are
    // usually exactly this (assistant calls a tool, the result comes back as
    // "user"), so treating it as "unknown" would blank out the mode on nearly
    // every reload.
    it('skips user entries that are tool results, not prompts', async () => {
      await writeSession('sess-tool-result', [
        JSON.stringify({ type: 'user', uuid: 'u1', permissionMode: 'plan' }),
        JSON.stringify({ type: 'assistant', uuid: 'a1', parentUuid: 'u1' }),
        JSON.stringify({
          type: 'user',
          uuid: 'u2',
          parentUuid: 'a1',
          message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x' }] },
        }),
      ]);

      const result = await loadSessionMessages('/work', 'sess-tool-result');
      expect(result.lastReportedMode).toBe('plan');
    });

    it('does not fall through to an unrecognized flag as a guess', async () => {
      await writeSession('sess-unknown-flag', [
        JSON.stringify({ type: 'user', uuid: 'u1', permissionMode: 'plan' }),
        JSON.stringify({ type: 'user', uuid: 'u2', parentUuid: 'u1', permissionMode: 'somethingNew' }),
      ]);

      // The newest entry's flag is unrecognized — this must not silently report
      // the older recognized one either (issue #6 taught the same lesson about
      // guessing instead of being explicit about what is actually known).
      const result = await loadSessionMessages('/work', 'sess-unknown-flag');
      expect(result.lastReportedMode).toBeNull();
    });
  });
});
