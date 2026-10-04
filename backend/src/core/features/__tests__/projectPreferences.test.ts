import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ProjectCollection } from '../../entities/project/Project.collection';
import { describeProject, pinProject, readFavoritePaths, readProjectMeta } from '../projectPreferences';

describe('what the user decided about a project', () => {
  const originalCcgHome = process.env.CCG_HOME;
  let root: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'ccg-prefs-')));
    process.env.CCG_HOME = join(root, 'ccg');
  });

  afterEach(() => {
    if (originalCcgHome === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = originalCcgHome;
    rmSync(root, { recursive: true, force: true });
  });

  const workdir = (name: string) => {
    const path = join(root, 'work', name);
    mkdirSync(path, { recursive: true });
    return path;
  };

  describe('pinning', () => {
    it('lists the pinned projects in the order they were pinned', async () => {
      const [a, b, c] = [workdir('a'), workdir('b'), workdir('c')];

      await pinProject(b, true);
      await pinProject(a, true);
      const result = await pinProject(c, true);

      expect(result.ok).toBe(true);
      expect(result.favoritePaths).toEqual([b, a, c]);
    });

    it('keeps the order even when two are pinned in the same millisecond', async () => {
      const paths = ['p1', 'p2', 'p3', 'p4'].map(workdir);

      await Promise.all(paths.map((path) => pinProject(path, true)));

      expect(new Set(await readFavoritePaths())).toEqual(new Set(paths));
      expect(await readFavoritePaths()).toHaveLength(4);
    });

    it('unpins, leaving the others where they were', async () => {
      const [a, b, c] = [workdir('a'), workdir('b'), workdir('c')];
      await pinProject(a, true);
      await pinProject(b, true);
      await pinProject(c, true);

      const result = await pinProject(b, false);

      expect(result.favoritePaths).toEqual([a, c]);
    });

    it('does not write when the project is already in the wanted state', async () => {
      const a = workdir('a');
      await pinProject(a, true);
      const projects = new ProjectCollection();
      const pinnedAt = (await projects.all())[0].favoritedAt;

      await pinProject(a, true);

      expect((await projects.all())[0].favoritedAt).toBe(pinnedAt);
    });

    it('recognises the same directory under another spelling', async () => {
      const a = workdir('a');
      await pinProject(a, true);

      const result = await pinProject(`${a}/`, false);

      expect(result.favoritePaths).toEqual([]);
      expect(await new ProjectCollection().all()).toHaveLength(1);
    });

    it('registers a directory that is pinned before anything else has met it', async () => {
      const a = workdir('a');

      await pinProject(a, true);

      expect(await new ProjectCollection().findByPath(a)).not.toBeNull();
    });

    it('answers the list as it stands for an empty path, without changing anything', async () => {
      const a = workdir('a');
      await pinProject(a, true);

      const result = await pinProject('', true);

      expect(result).toMatchObject({ ok: true, favoritePaths: [a] });
    });

    it('says it could not, and gives the list as it was, for a path that is not absolute', async () => {
      const a = workdir('a');
      await pinProject(a, true);

      const result = await pinProject('relative/dir', true);

      expect(result.ok).toBe(false);
      expect(result.favoritePaths).toEqual([a]);
    });
  });

  describe('an alias and a note', () => {
    it('sets both and lists them under the project\'s directory', async () => {
      const a = workdir('a');

      const result = await describeProject(a, { name: '  My app ', description: ' The main one ' });

      expect(result.ok).toBe(true);
      expect(result.projectMeta).toEqual([{ path: a, name: 'My app', description: 'The main one' }]);
    });

    it('lists a project with only a note without a name', async () => {
      const a = workdir('a');

      const result = await describeProject(a, { description: 'note' });

      expect(JSON.parse(JSON.stringify(result.projectMeta))).toEqual([{ path: a, description: 'note' }]);
    });

    it('clears both when both are emptied, and drops the project from the overlay', async () => {
      const a = workdir('a');
      await describeProject(a, { name: 'x', description: 'y' });

      const result = await describeProject(a, { name: '  ', description: '' });

      expect(result.projectMeta).toEqual([]);
      expect((await new ProjectCollection().findByPath(a))?.alias).toBeNull();
    });

    it('does not register a project just to clear what was never set', async () => {
      await describeProject(workdir('a'), {});

      expect(await new ProjectCollection().all()).toEqual([]);
    });

    it('does not write when nothing changed', async () => {
      const a = workdir('a');
      await describeProject(a, { name: 'x' });
      const projects = new ProjectCollection();
      const before = readProjectMeta();

      await describeProject(a, { name: 'x' });

      expect(await readProjectMeta()).toEqual(await before);
      expect(await projects.all()).toHaveLength(1);
    });

    it('lists every project that has one, in the order the projects were first seen', async () => {
      const [a, b] = [workdir('a'), workdir('b')];
      await describeProject(b, { name: 'B' });
      await describeProject(a, { name: 'A' });

      expect((await readProjectMeta()).map((entry) => entry.path)).toEqual([b, a]);
    });

    it('answers the overlay as it stands for an empty path', async () => {
      const a = workdir('a');
      await describeProject(a, { name: 'A' });

      expect((await describeProject('', {})).projectMeta).toHaveLength(1);
    });

    it('says it could not for a path that is not absolute', async () => {
      const result = await describeProject('relative/dir', { name: 'x' });

      expect(result.ok).toBe(false);
    });
  });
});
