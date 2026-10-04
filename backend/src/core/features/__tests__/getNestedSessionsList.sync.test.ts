import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getNestedSessionsList } from '../getNestedSessionsList';

/**
 * Where the directories under a root come from while a user pages through the
 * nested sessions: the first page brings the project list up to date, the pages
 * after it read the list as it stands.
 */
describe('getNestedSessionsList and the project list', () => {
  const originalConfigDir = process.env.CLAUDE_CONFIG_DIR;
  const originalCcgHome = process.env.CCG_HOME;
  let root: string;
  let projectsDir: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'ccg-nested-sync-')));
    projectsDir = join(root, 'claude', 'projects');
    mkdirSync(projectsDir, { recursive: true });
    process.env.CLAUDE_CONFIG_DIR = join(root, 'claude');
    process.env.CCG_HOME = join(root, 'ccg');
  });

  afterEach(() => {
    if (originalConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
    if (originalCcgHome === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = originalCcgHome;
    rmSync(root, { recursive: true, force: true });
  });

  // A real folder under the test's own root, so the path is absolute on every platform.
  let repo: string;
  beforeEach(() => {
    repo = join(root, 'repo');
    mkdirSync(repo, { recursive: true });
  });

  /** A session transcript in [cwd], so the CLI has a record of that directory. */
  const session = (cwd: string, id: string, mtimeSeconds: number) => {
    const folder = join(projectsDir, cwd.replace(/[^a-zA-Z0-9]/g, '-'));
    mkdirSync(folder, { recursive: true });
    const path = join(folder, `${id}.jsonl`);
    writeFileSync(
      path,
      JSON.stringify({ type: 'user', cwd, sessionId: id, message: { role: 'user', content: 'hi' }, timestamp: new Date(mtimeSeconds * 1000).toISOString() }) + '\n',
    );
    utimesSync(path, mtimeSeconds, mtimeSeconds);
  };

  it('picks up a directory made in a terminal a moment ago when it reads the first page', async () => {
    session(repo, 'root-1', 1_700_000_000);
    await getNestedSessionsList(repo, { offset: 0, limit: 20 });

    session(join(repo, 'packages', 'new'), 'new-1', 1_700_000_100);
    const page = await getNestedSessionsList(repo, { offset: 0, limit: 20 });

    expect(page.scopeDirCount).toBe(2);
  });

  it('does not rescan for the pages after the first, so the directories do not shift while paging', async () => {
    session(repo, 'root-1', 1_700_000_000);
    await getNestedSessionsList(repo, { offset: 0, limit: 20 });

    session(join(repo, 'packages', 'new'), 'new-1', 1_700_000_100);
    const later = await getNestedSessionsList(repo, { offset: 20, limit: 20 });

    expect(later.scopeDirCount).toBe(1);
  });
});
