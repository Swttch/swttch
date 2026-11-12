import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { normalizeProjectPath } from '../getProjectSessionsPath';
import { collectSortKeys } from '../getSessionsList';
import { getNestedSessionsList } from '../getNestedSessionsList';
import { syncProjectsList } from '../syncProjectsList';
import { findWorktreeOriginTranscripts, readWorktreeState } from '../worktreeSessions';

/**
 * A session that moves into a git worktree and stops there (#658).
 *
 * The shape below is what the CLI (2.1.322) wrote for a session opened in
 * `<repo>/services/svc` that then ran the EnterWorktree tool: the whole transcript
 * sits in the worktree's folder, its first `cwd` is the directory it was opened
 * in, and the `worktree-state` entry comes later, once the worktree was entered.
 * The folder of the directory it was opened in holds nothing.
 */
describe('sessions that stop inside a worktree (#658)', () => {
  const originalConfigDir = process.env.CLAUDE_CONFIG_DIR;
  const originalCcgHome = process.env.CCG_HOME;
  let configDir: string;
  let ccgHome: string;
  let projectsDir: string;

  const REPO = '/work/repo';
  const OPENED_IN = `${REPO}/services/svc`;
  const WORKTREE = `${REPO}/.claude/worktrees/demo`;
  const OTHER_WORKTREE = `${REPO}/.claude/worktrees/other`;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'ccg-worktree-sessions-'));
    ccgHome = mkdtempSync(join(tmpdir(), 'ccg-worktree-home-'));
    projectsDir = join(configDir, 'projects');
    mkdirSync(projectsDir, { recursive: true });
    process.env.CLAUDE_CONFIG_DIR = configDir;
    process.env.CCG_HOME = ccgHome;
  });

  afterEach(() => {
    if (originalConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
    if (originalCcgHome === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = originalCcgHome;
    rmSync(configDir, { recursive: true, force: true });
    rmSync(ccgHome, { recursive: true, force: true });
  });

  function writeTranscript(folderFor: string, sessionId: string, lines: unknown[]): void {
    const folder = join(projectsDir, normalizeProjectPath(folderFor));
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      join(folder, `${sessionId}.jsonl`),
      lines.map((l) => JSON.stringify(l)).join('\n'),
    );
  }

  /** What the CLI wrote for a session opened in [openedIn] that ended inside [worktree]. */
  function enteredWorktree(openedIn: string, worktree: string, sessionId: string): unknown[] {
    return [
      { type: 'queue-operation', timestamp: '2026-11-11T01:00:00.000Z' },
      { type: 'user', cwd: openedIn, timestamp: '2026-11-11T01:00:01.000Z', message: { role: 'user', content: 'hi' } },
      {
        type: 'worktree-state',
        worktreeSession: {
          originalCwd: openedIn,
          preEnterOriginalCwd: openedIn,
          worktreePath: worktree,
          worktreeName: 'demo',
          sessionId,
        },
      },
      { type: 'assistant', cwd: worktree, timestamp: '2026-11-11T01:00:05.000Z', message: { role: 'assistant', content: [] } },
    ];
  }

  it('reads the worktree state from a transcript', async () => {
    writeTranscript(WORKTREE, 's1', enteredWorktree(OPENED_IN, WORKTREE, 's1'));

    const state = await readWorktreeState(
      join(projectsDir, normalizeProjectPath(WORKTREE), 's1.jsonl'),
    );

    expect(state).toEqual({ originalCwd: OPENED_IN, worktreePath: WORKTREE });
  });

  it('skips a state that no longer names a worktree and takes the one that does', async () => {
    writeTranscript(WORKTREE, 's1', [
      { type: 'worktree-state', worktreeSession: null },
      ...enteredWorktree(OPENED_IN, WORKTREE, 's1'),
    ]);

    const state = await readWorktreeState(
      join(projectsDir, normalizeProjectPath(WORKTREE), 's1.jsonl'),
    );

    expect(state?.worktreePath).toBe(WORKTREE);
  });

  it('registers the worktree folder as the worktree, not as the directory it was opened in', async () => {
    writeTranscript(WORKTREE, 's1', enteredWorktree(OPENED_IN, WORKTREE, 's1'));

    const paths = (await syncProjectsList()).map((p) => p.path);

    expect(paths).toContain(WORKTREE);
    expect(paths).not.toContain(OPENED_IN);
  });

  it('lists the session in the directory it was opened in, under the worktree it is in', async () => {
    writeTranscript(WORKTREE, 's1', enteredWorktree(OPENED_IN, WORKTREE, 's1'));

    const keys = await collectSortKeys(OPENED_IN);

    expect(keys).toHaveLength(1);
    expect(keys[0].sessionId).toBe('s1');
    expect(keys[0].sessionDir).toBe(WORKTREE);
    expect(keys[0].fullPath).toBe(join(projectsDir, normalizeProjectPath(WORKTREE), 's1.jsonl'));
  });

  it('lists it in the repository root too, which holds the worktree', async () => {
    writeTranscript(WORKTREE, 's1', enteredWorktree(OPENED_IN, WORKTREE, 's1'));

    const nested = await getNestedSessionsList(REPO);

    expect(nested.sessions.map((s) => s.sessionId)).toEqual(['s1']);
    expect(nested.sessions[0].sessionDir).toBe(WORKTREE);
  });

  it('lists it once when the opened-in directory and the worktree are both in scope', async () => {
    writeTranscript(WORKTREE, 's1', enteredWorktree(OPENED_IN, WORKTREE, 's1'));
    // The opened-in directory is a project of its own because another session ran there.
    writeTranscript(OPENED_IN, 's2', [
      { type: 'user', cwd: OPENED_IN, timestamp: '2026-11-11T00:00:00.000Z', message: { role: 'user', content: 'x' } },
    ]);

    const nested = await getNestedSessionsList(REPO);

    expect(nested.sessions.map((s) => s.sessionId).sort()).toEqual(['s1', 's2']);
  });

  it('does not list a session that was opened somewhere else', async () => {
    writeTranscript(OTHER_WORKTREE, 'o1', enteredWorktree(`${REPO}/services/other`, OTHER_WORKTREE, 'o1'));

    expect(await findWorktreeOriginTranscripts(OPENED_IN)).toEqual([]);
    expect(await collectSortKeys(OPENED_IN)).toEqual([]);
  });

  it('does not list a worktree session under a repository it does not belong to', async () => {
    writeTranscript(WORKTREE, 's1', enteredWorktree(OPENED_IN, WORKTREE, 's1'));

    expect(await findWorktreeOriginTranscripts('/work/another-repo/services/svc')).toEqual([]);
  });

  it('leaves the worktree itself listing only what is filed under it', async () => {
    writeTranscript(WORKTREE, 's1', enteredWorktree(OPENED_IN, WORKTREE, 's1'));

    const keys = await collectSortKeys(WORKTREE);

    expect(keys.map((k) => k.sessionId)).toEqual(['s1']);
  });
});
