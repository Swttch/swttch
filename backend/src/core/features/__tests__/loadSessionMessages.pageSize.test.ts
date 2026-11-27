import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('../getProjectSessionsPath', () => ({
  getProjectSessionsPath: vi.fn(),
}));

import { loadSessionMessages, type PaginatedSessionMessages } from '../loadSessionMessages';
import { getProjectSessionsPath } from '../getProjectSessionsPath';

/**
 * A page is so many entries of the conversation (#708). Most records of a session file draw nothing of their own, so a
 * page counted in records held under one screen of the chat.
 */
describe('loadSessionMessages: a page is counted in entries of the conversation', () => {
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await mkdtemp(join(tmpdir(), 'load-session-page-'));
    vi.mocked(getProjectSessionsPath).mockResolvedValue(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  /** `turns` entries of the conversation (c1, c2, …), each followed by `others` records that draw nothing. */
  async function writeChain(turns: number, others: number): Promise<void> {
    const lines: string[] = [];
    let parent: string | undefined;
    const add = (uuid: string, entry: Record<string, unknown>) => {
      lines.push(JSON.stringify({ ...entry, uuid, parentUuid: parent }));
      parent = uuid;
    };
    for (let i = 1; i <= turns; i++) {
      add(`c${i}`, { type: i % 2 ? 'user' : 'assistant', message: { content: 'words' } });
      for (let n = 1; n <= others; n++) {
        add(`c${i}-${n}`, n % 2 ? { type: 'attachment' } : { type: 'user', message: { content: [{ type: 'tool_result' }] } });
      }
    }
    await writeFile(join(tmpDir, 'sess.jsonl'), lines.join('\n'));
  }

  const turnsOf = (page: PaginatedSessionMessages) =>
    page.messages.map(m => String(m.uuid)).filter(uuid => !uuid.includes('-'));
  const load = (before?: string, after?: string, around?: string) =>
    loadSessionMessages('/work', 'sess', before, 4, after, around);

  it('serves the newest page with that many of them, and every record in between', async () => {
    await writeChain(20, 3);
    const page = await load();
    expect(turnsOf(page)).toEqual(['c17', 'c18', 'c19', 'c20']);
    expect(page.messages).toHaveLength(16);
    expect(page.oldestUuid).toBe('c17');
  });

  it('serves an older page the same way', async () => {
    await writeChain(20, 3);
    const page = await load('c17');
    expect(turnsOf(page)).toEqual(['c13', 'c14', 'c15', 'c16']);
    expect(page.messages[page.messages.length - 1].uuid).toBe('c16-3');
    expect(page.hasMore).toBe(true);
  });

  it('walks the whole chain toward the newest without repeating or skipping a record', async () => {
    await writeChain(10, 3);
    const first = await load(undefined, undefined, 'c1');
    const seen = first.messages.map(m => m.uuid);
    let cursor = first.newestUuid!;
    for (let guard = 0; guard < 20; guard++) {
      const page = await load(undefined, cursor);
      seen.push(...page.messages.map(m => m.uuid));
      if (!page.hasNewer) break;
      cursor = page.newestUuid!;
    }
    expect(seen).toHaveLength(40);
    expect(new Set(seen).size).toBe(40);
  });

  it('centres a page around an entry by the same count', async () => {
    await writeChain(20, 3);
    const page = await load(undefined, undefined, 'c10');
    expect(turnsOf(page)).toEqual(['c8', 'c9', 'c10', 'c11']);
  });

  it('stops a page at a limit of records where hardly any of them is the conversation', async () => {
    await writeChain(3, 500);
    const page = await load();
    expect(page.messages.length).toBeLessThanOrEqual(4 * 20);
    expect(page.hasMore).toBe(true);
  });
});
