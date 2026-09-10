import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('../getProjectSessionsPath', () => ({
  getProjectSessionsPath: vi.fn(),
}));

import { getSessionEntry } from '../getSessionEntry';
import { getSessionsList } from '../getSessionsList';
import { getProjectSessionsPath } from '../getProjectSessionsPath';
import { writeSessionTitleOverride } from '../sessionTitleOverrides';

const mockGetPath = vi.mocked(getProjectSessionsPath);

/**
 * #434 — the row a session carries alongside its own load.
 *
 * The webview merges this into the session list, so it has to be the same row
 * the list would have produced. A row that differs would make the header change
 * the moment paging happens to reach the session.
 */
describe('getSessionEntry', () => {
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await mkdtemp(join(tmpdir(), 'session-entry-'));
    mockGetPath.mockResolvedValue(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function writeSession(sessionId: string, lines: string[]): Promise<void> {
    await writeFile(join(tmpDir, `${sessionId}.jsonl`), lines.join('\n'));
  }

  it('builds the same row the list builds for that session', async () => {
    await writeSession('sess-1', [
      JSON.stringify({
        type: 'user',
        uuid: 'u1',
        timestamp: '2026-09-09T05:19:49.612Z',
        message: { content: 'How should we manage our work?' },
      }),
    ]);

    const entry = await getSessionEntry('/work', 'sess-1');
    const listed = (await getSessionsList('/work')).sessions.find(
      (s) => s.sessionId === 'sess-1',
    );

    expect(entry).toEqual(listed);
    expect(entry?.title).toBe('How should we manage our work?');
  });

  it('applies the title override the list applies', async () => {
    await writeSession('sess-renamed', [
      JSON.stringify({
        type: 'user',
        uuid: 'u1',
        timestamp: '2026-09-09T05:19:49.612Z',
        message: { content: 'original prompt' },
      }),
    ]);
    // Written through the same function the rename feature uses, so the test
    // cannot drift from where overrides actually live.
    await writeSessionTitleOverride(tmpDir, 'sess-renamed', 'A name the user picked');

    const entry = await getSessionEntry('/work', 'sess-renamed');
    expect(entry?.title).toBe('A name the user picked');
  });

  it('names the working directory the session belongs to', async () => {
    await writeSession('sess-1', [
      JSON.stringify({ type: 'user', uuid: 'u1', message: { content: 'hi' } }),
    ]);

    const entry = await getSessionEntry('/work', 'sess-1');
    expect(entry?.sessionDir).toBe('/work');
  });

  it('gives no row for a session that is not on disk', async () => {
    expect(await getSessionEntry('/work', 'nonexistent')).toBeNull();
  });

  it('gives no row for a sidechain, which the list does not show', async () => {
    await writeSession('sess-side', [
      JSON.stringify({ type: 'user', uuid: 'u1', isSidechain: true, message: { content: 'sub' } }),
    ]);

    expect(await getSessionEntry('/work', 'sess-side')).toBeNull();
  });
});
