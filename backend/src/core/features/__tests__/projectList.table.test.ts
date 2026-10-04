import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ProjectCollection } from '../../entities/project/Project.collection';
import { canSymlink } from '../../entities/__tests__/canSymlink';
import { getProjectsList } from '../getProjectsList';
import { syncProjectsList } from '../syncProjectsList';
import { hideProject } from '../projectPreferences';

/**
 * The project list is the `projects` table's. The CLI's records are what bring the
 * table up to date, and the list leaves out what the user removed and what is gone.
 */
describe('the project list as a table', () => {
  const originalConfigDir = process.env.CLAUDE_CONFIG_DIR;
  const originalCcgHome = process.env.CCG_HOME;
  let root: string;
  let projectsDir: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'ccg-list-table-')));
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

  /** A working directory that exists on disk. */
  const workdir = (name: string) => {
    const path = join(root, 'work', name);
    mkdirSync(path, { recursive: true });
    return path;
  };

  /** One transcript of a session in [cwd], written [mtimeSeconds] after the epoch. */
  const session = (cwd: string, file: string, mtimeSeconds: number) => {
    const folder = join(projectsDir, cwd.replace(/[^a-zA-Z0-9]/g, '-'));
    mkdirSync(folder, { recursive: true });
    const path = join(folder, file);
    writeFileSync(path, JSON.stringify({ type: 'user', cwd }) + '\n');
    utimesSync(path, mtimeSeconds, mtimeSeconds);
  };

  describe('reading the list', () => {
    it('is empty before anything has been recorded', async () => {
      expect(await getProjectsList()).toEqual([]);
    });

    it('answers what the table holds without looking at the CLI records', async () => {
      session(workdir('seen'), 'a.jsonl', 1_700_000_000);

      expect(await getProjectsList()).toEqual([]); // nothing synced yet
      await syncProjectsList();
      expect((await getProjectsList()).map((entry) => entry.name)).toEqual(['seen']);
    });

    it('lists a directory the program was asked about even though it has no session', async () => {
      const path = workdir('quiet');
      await new ProjectCollection().idOf(path);

      const [entry] = await getProjectsList();

      expect(entry).toMatchObject({ name: 'quiet', path, sessionCount: 0 });
      expect(Number.isNaN(Date.parse(entry.lastModified))).toBe(false);
    });

    it('leaves out a directory with no session that is gone from disk', async () => {
      const projects = new ProjectCollection();
      await projects.idOf(join(root, 'work', 'never-made'));

      expect(await getProjectsList()).toEqual([]);
    });

    it('keeps a directory that has sessions even when it is gone from disk', async () => {
      const path = join(root, 'work', 'moved-away');
      session(path, 'a.jsonl', 1_700_000_000); // its folder is not on disk, its sessions are
      await syncProjectsList();

      expect((await getProjectsList()).map((entry) => entry.path)).toEqual([path]);
    });

    it('tells the webview the times as ISO strings', async () => {
      session(workdir('a'), 'a.jsonl', 1_700_000_000);

      const [entry] = await syncProjectsList();

      expect(entry.lastModified).toBe(new Date(1_700_000_000 * 1000).toISOString());
    });
  });

  describe('bringing the table up to date', () => {
    it('registers a directory that was only ever used from a terminal', async () => {
      const path = workdir('terminal-only');
      session(path, 'a.jsonl', 1_700_000_000);

      await syncProjectsList();

      expect(await new ProjectCollection().findByPath(path)).not.toBeNull();
    });

    it('gives a directory the same number whether the table or a prompt met it first', async () => {
      const path = workdir('app');
      const first = await new ProjectCollection().idOf(path);
      session(path, 'a.jsonl', 1_700_000_000);

      await syncProjectsList();

      expect((await new ProjectCollection().findByPath(path))?.id).toBe(first);
      expect(await new ProjectCollection().all()).toHaveLength(1);
    });

    it('refreshes the count and the times of a directory it already has', async () => {
      const path = workdir('app');
      session(path, 'a.jsonl', 1_700_000_000);
      await syncProjectsList();

      session(path, 'b.jsonl', 1_700_000_500);
      const [entry] = await syncProjectsList();

      expect(entry.sessionCount).toBe(2);
      expect(entry.lastModified).toBe(new Date(1_700_000_500 * 1000).toISOString());
    });

    it.skipIf(!canSymlink)('counts the same directory seen through two records once', async () => {
      const path = workdir('app');
      const link = join(root, 'work', 'shortcut');
      // Same directory, two spellings: the CLI recorded sessions under both.
      mkdirSync(join(root, 'work'), { recursive: true });
      symlinkSync(path, link);
      session(path, 'a.jsonl', 1_700_000_000);
      session(link, 'b.jsonl', 1_700_000_100);

      const list = await syncProjectsList();

      expect(list).toHaveLength(1);
      expect(list[0].sessionCount).toBe(2);
    });

    it('does not rewrite the table when nothing changed', async () => {
      session(workdir('app'), 'a.jsonl', 1_700_000_000);
      await syncProjectsList();
      const projects = new ProjectCollection();
      const before = (await projects.all())[0];

      await syncProjectsList();

      const after = (await projects.all())[0];
      expect(after).toEqual(before);
    });

    it('sets the count of a project the CLI no longer knows to 0 only when asked to prune', async () => {
      const path = workdir('app');
      session(path, 'a.jsonl', 1_700_000_000);
      await syncProjectsList();
      rmSync(projectsDir, { recursive: true, force: true });
      mkdirSync(projectsDir, { recursive: true });

      await syncProjectsList(false);
      expect((await new ProjectCollection().all())[0].sessionCount).toBe(1);

      await syncProjectsList(true);
      expect((await new ProjectCollection().all())[0].sessionCount).toBe(0);
    });
  });

  describe('a project the user removed from the list', () => {
    it('is not listed, and keeps its row and number', async () => {
      const path = workdir('app');
      session(path, 'a.jsonl', 1_700_000_000);
      await syncProjectsList();
      const id = (await new ProjectCollection().findByPath(path))?.id;

      rmSync(projectsDir, { recursive: true, force: true });
      mkdirSync(projectsDir, { recursive: true });
      await hideProject(path);

      expect(await syncProjectsList(true)).toEqual([]);
      expect((await new ProjectCollection().findByPath(path))?.id).toBe(id);
    });

    it('is listed again once a session newer than the removal turns up', async () => {
      const path = workdir('app');
      session(path, 'a.jsonl', 1_700_000_000);
      await syncProjectsList();
      await hideProject(path);
      rmSync(projectsDir, { recursive: true, force: true });
      mkdirSync(projectsDir, { recursive: true });
      expect(await syncProjectsList(true)).toEqual([]);

      session(path, 'new.jsonl', Math.floor(Date.now() / 1000) + 60);

      expect((await syncProjectsList(true)).map((entry) => entry.path)).toEqual([path]);
    });

    it('is not brought back by a session that is older than the removal', async () => {
      const path = workdir('app');
      session(path, 'a.jsonl', 1_700_000_000);
      await syncProjectsList();
      await hideProject(path);

      expect(await syncProjectsList()).toEqual([]);
    });

    it('does nothing for a directory the table never held', async () => {
      await hideProject(join(root, 'work', 'unknown'));

      expect(await new ProjectCollection().all()).toEqual([]);
    });
  });
});
