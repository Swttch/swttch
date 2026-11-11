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

// The Claude desktop app's record of who started whom: what the machine running the test has of it is no
// business of these tests, so each test says what it is.
const desktopStarters = vi.hoisted(() => ({ value: new Map<string, string>(), archived: new Set<string>() }));
vi.mock('../desktopSessions', () => ({
  readDesktopState: vi.fn(async () => ({ starters: desktopStarters.value, archived: desktopStarters.archived })),
}));

// Whether the sync switch is on (and the person a sponsor): off, nothing from the desktop app is shown.
const desktopSync = vi.hoisted(() => ({ enabled: true }));
vi.mock('../desktopSync', () => ({ desktopSyncEnabled: vi.fn(async () => desktopSync.enabled) }));

import { isArchivedRow, readSessionMarks, readSessionMarksToShow, starterIdOfRow } from '../sessionMarks';
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
    desktopStarters.value = new Map();
    desktopStarters.archived = new Set();
    desktopSync.enabled = true;
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

  describe('who started a session, with the desktop app\'s record beside the package\'s', () => {
    it('uses what the package recorded, and the desktop app only where the package left it open', () => {
      expect(starterIdOfRow({ parentSessionUid: 'chosen', desktopParentSessionId: 'desktop' })).toBe('chosen');
      expect(starterIdOfRow({ parentSessionUid: null, desktopParentSessionId: 'desktop' })).toBe('desktop');
      expect(starterIdOfRow({ desktopParentSessionId: 'desktop' })).toBe('desktop');
      expect(starterIdOfRow({ parentSessionUid: null })).toBeNull();
      expect(starterIdOfRow(undefined)).toBeNull();
    });

    it('does not bring the desktop app\'s record back under a session taken to the top level on purpose', () => {
      expect(starterIdOfRow({ parentSessionUid: '', desktopParentSessionId: 'desktop' })).toBeNull();
    });

    it('adds the desktop app\'s record beside the package\'s row and leaves the row\'s own columns as they were', async () => {
      desktopStarters.value = new Map([['child', 'manager']]);
      await writeMarks([JSON.stringify({ id: 'child', parentSessionUid: null, handle: 'kid', future: 1 })]);

      const row = (await readSessionMarksToShow()).get('child')?.row;

      expect(row).toEqual({ id: 'child', parentSessionUid: null, handle: 'kid', future: 1, desktopParentSessionId: 'manager' });
    });

    it('makes a row of its own for a session only the desktop app knows a starter of', async () => {
      desktopStarters.value = new Map([['child', 'manager']]);

      expect((await readSessionMarksToShow()).get('child')?.row).toEqual({ id: 'child', desktopParentSessionId: 'manager' });
    });

    it('shows nothing from the desktop app while the sync is off', async () => {
      desktopSync.enabled = false;
      desktopStarters.value = new Map([['child', 'manager']]);
      desktopStarters.archived = new Set(['one']);
      await writeMarks([JSON.stringify({ id: 'two', parentSessionUid: 'manager' })]);

      const marks = await readSessionMarksToShow();

      expect(marks.get('child')).toBeUndefined();
      expect(marks.get('one')).toBeUndefined();
      expect(marks.get('two')?.row).toEqual({ id: 'two', parentSessionUid: 'manager' });
    });

    it('keeps the desktop app\'s record on a row whose parent the package chose, which decides nothing there', async () => {
      desktopStarters.value = new Map([['child', 'manager']]);
      await writeMarks([JSON.stringify({ id: 'child', parentSessionUid: '' })]);

      const row = (await readSessionMarksToShow()).get('child')?.row;

      expect(row?.parentSessionUid).toBe('');
      expect(row?.desktopParentSessionId).toBe('manager');
      expect(starterIdOfRow(row)).toBeNull();
    });

    it('is archived when the package says so, or when it chose nothing and the desktop app says so', () => {
      expect(isArchivedRow({ archivedAt: 1794301002844, desktopArchived: false })).toBe(true);
      expect(isArchivedRow({ archivedAt: 0, desktopArchived: true })).toBe(true);
      expect(isArchivedRow({ desktopArchived: true })).toBe(true);
      expect(isArchivedRow({ archivedAt: 0 })).toBe(false);
      expect(isArchivedRow(undefined)).toBe(false);
    });

    it('does not show a session archived again that was brought back on purpose, whatever the desktop app says', () => {
      expect(isArchivedRow({ archivedAt: -1, desktopArchived: true })).toBe(false);
    });

    it('carries what the desktop app archived beside the row, and makes a row for a session the package has none for', async () => {
      desktopStarters.archived = new Set(['one', 'two']);
      await writeMarks([JSON.stringify({ id: 'one', archivedAt: 0, handle: 'h' })]);

      const marks = await readSessionMarksToShow();

      expect(marks.get('one')?.row).toEqual({ id: 'one', archivedAt: 0, handle: 'h', desktopArchived: true });
      expect(marks.get('two')?.row).toEqual({ id: 'two', desktopArchived: true });
    });

    it('reads no desktop record while the package is not installed', async () => {
      mockInstalled.mockResolvedValue(false);
      desktopStarters.value = new Map([['child', 'manager']]);

      expect((await readSessionMarksToShow()).size).toBe(0);
    });
  });
});
