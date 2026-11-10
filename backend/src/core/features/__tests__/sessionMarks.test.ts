import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('../getProjectSessionsPath', () => ({
  getProjectSessionsPath: vi.fn(),
}));

// Whether the session-management MCP is installed. Mocked because looking for a
// global package runs the package managers of the machine the test runs on.
vi.mock('../../session-mcp', () => ({
  isSessionMcpInstalled: vi.fn(),
}));

import { readSessionMarks, readSessionMarksToShow } from '../sessionMarks';
import { isSessionMcpInstalled } from '../../session-mcp';
import { getSessionsList } from '../getSessionsList';
import { getSessionEntry } from '../getSessionEntry';
import { getProjectSessionsPath } from '../getProjectSessionsPath';

const mockGetPath = vi.mocked(getProjectSessionsPath);
const mockInstalled = vi.mocked(isSessionMcpInstalled);

/**
 * The session-management MCP writes `sidebar/session_marks`; this backend only
 * reads it, to put each mark on its row of the session list.
 */
describe('session marks', () => {
  let home: string;
  let sessionsDir: string;
  let savedHome: string | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    home = await mkdtemp(join(tmpdir(), 'session-marks-home-'));
    sessionsDir = await mkdtemp(join(tmpdir(), 'session-marks-sessions-'));
    savedHome = process.env.CCG_HOME;
    process.env.CCG_HOME = home;
    mockGetPath.mockResolvedValue(sessionsDir);
    // Installed, unless a test says otherwise.
    mockInstalled.mockResolvedValue(true);
  });

  afterEach(async () => {
    if (savedHome === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = savedHome;
    await rm(home, { recursive: true, force: true });
    await rm(sessionsDir, { recursive: true, force: true });
  });

  async function writeMarks(lines: string[]): Promise<void> {
    const dir = join(home, 'entities', 'sidebar');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'session_marks.entity.jsonl'), lines.join('\n') + '\n');
  }

  async function writeSession(sessionId: string, prompt: string): Promise<void> {
    const entry = {
      type: 'user',
      uuid: `${sessionId}-u1`,
      timestamp: '2026-11-10T05:19:49.612Z',
      message: { content: prompt },
    };
    await writeFile(join(sessionsDir, `${sessionId}.jsonl`), JSON.stringify(entry));
  }

  it('answers nothing on a machine that has no marks file', async () => {
    expect((await readSessionMarks()).size).toBe(0);
  });

  it('takes the later line for a session and drops a deleted one', async () => {
    await writeMarks([
      JSON.stringify({ id: 'child', parentSessionUid: 'first-parent', handle: 'a' }),
      JSON.stringify({ id: 'gone', parentSessionUid: 'parent' }),
      JSON.stringify({ id: 'child', parentSessionUid: 'second-parent', handle: 'a' }),
      JSON.stringify({ id: 'gone', deleted: true }),
    ]);

    const marks = await readSessionMarks();

    expect([...marks.keys()]).toEqual(['child']);
    expect(marks.get('child')?.row.parentSessionUid).toBe('second-parent');
  });

  it('skips a line it cannot understand and keeps the rest', async () => {
    await writeMarks([
      '{"id":"cut-short","parentSess',
      JSON.stringify({ id: 42, parentSessionUid: 'parent' }),
      JSON.stringify(['not', 'a', 'row']),
      JSON.stringify({ id: 'child', parentSessionUid: 'parent' }),
    ]);

    expect([...(await readSessionMarks()).keys()]).toEqual(['child']);
  });

  it('hands a row on whole, with columns this program does not know', async () => {
    const row = {
      id: 'child',
      parentSessionUid: 'parent',
      archivedAt: 1794301002844,
      aColumnAddedLater: { nested: true },
    };
    await writeMarks([JSON.stringify(row)]);

    const mark = (await readSessionMarks()).get('child');

    expect(mark?.sessionId).toBe('child');
    expect(JSON.parse(JSON.stringify(mark))).toEqual(row);
  });

  it('puts the mark on its row of the session list, and nothing on the others', async () => {
    await writeSession('parent', 'Manage the release');
    await writeSession('child', 'Deploy the release');
    await writeMarks([JSON.stringify({ id: 'child', parentSessionUid: 'parent', startedAt: 5 })]);

    const { sessions } = await getSessionsList('/work');
    const child = sessions.find((s) => s.sessionId === 'child');
    const parent = sessions.find((s) => s.sessionId === 'parent');

    expect(JSON.parse(JSON.stringify(child?.sessionMark))).toEqual({
      id: 'child',
      parentSessionUid: 'parent',
      startedAt: 5,
    });
    expect(parent).toBeDefined();
    expect(parent && 'sessionMark' in parent).toBe(false);
  });

  describe('while the session-management MCP is not installed', () => {
    beforeEach(() => {
      mockInstalled.mockResolvedValue(false);
    });

    it('shows no mark, though the file is still there', async () => {
      await writeMarks([JSON.stringify({ id: 'child', parentSessionUid: 'parent' })]);

      expect((await readSessionMarksToShow()).size).toBe(0);
      // The file itself reads as before: only what the list shows is switched off.
      expect((await readSessionMarks()).size).toBe(1);
    });

    it('leaves every row of the session list without one', async () => {
      await writeSession('parent', 'Manage the release');
      await writeSession('child', 'Deploy the release');
      await writeMarks([JSON.stringify({ id: 'child', parentSessionUid: 'parent' })]);

      const { sessions } = await getSessionsList('/work');
      const entry = await getSessionEntry('/work', 'child');

      expect(sessions).toHaveLength(2);
      expect(sessions.every((s) => !('sessionMark' in s))).toBe(true);
      expect(entry && 'sessionMark' in entry).toBe(false);
    });
  });

  it('builds the same row for one session as the list builds', async () => {
    await writeSession('child', 'Deploy the release');
    await writeMarks([JSON.stringify({ id: 'child', parentSessionUid: 'parent' })]);

    const entry = await getSessionEntry('/work', 'child');
    const listed = (await getSessionsList('/work')).sessions.find((s) => s.sessionId === 'child');

    expect(entry?.sessionMark?.row.parentSessionUid).toBe('parent');
    expect(JSON.parse(JSON.stringify(entry))).toEqual(JSON.parse(JSON.stringify(listed)));
  });
});
