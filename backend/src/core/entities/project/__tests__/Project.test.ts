import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Project } from '../Project.entity';
import { ProjectCollection } from '../Project.collection';
import { canSymlink } from '../../__tests__/canSymlink';

describe('projects', () => {
  let home: string;
  let previousHome: string | undefined;

  beforeEach(() => {
    previousHome = process.env.CCG_HOME;
    home = realpathSync(mkdtempSync(join(tmpdir(), 'projects-')));
    process.env.CCG_HOME = home;
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = previousHome;
    rmSync(home, { recursive: true, force: true });
  });

  const folder = (name: string) => {
    const path = join(home, name);
    mkdirSync(path, { recursive: true });
    return path;
  };

  describe('turning a directory into a number', () => {
    it('registers a directory the first time it is asked about', async () => {
      const projects = new ProjectCollection();
      const path = folder('app');

      const id = await projects.idOf(path);

      expect(id).toBe(1);
      const [stored] = await projects.all();
      expect(stored).toBeInstanceOf(Project);
      expect(stored).toMatchObject({
        path,
        projectId: null,
        sessionCount: 0,
        favoritedAt: 0,
        alias: null,
        description: null,
        hiddenAt: 0,
      });
      expect(stored?.lastModified).toBeGreaterThan(0);
      expect(stored?.createdAt).toBe(stored?.lastModified);
    });

    it('answers the same number for the same directory, however it is spelled', async () => {
      const projects = new ProjectCollection();
      const path = folder('app');

      const first = await projects.idOf(path);
      const second = await projects.idOf(`${path}/`);
      const third = await projects.idOf(join(path, '..', 'app'));

      expect([second, third]).toEqual([first, first]);
      expect(await projects.all()).toHaveLength(1);
    });

    it.skipIf(!canSymlink)('answers the same number for a link to a directory as for the directory', async () => {
      const projects = new ProjectCollection();
      const path = folder('app');
      const link = join(home, 'shortcut');
      symlinkSync(path, link);

      expect(await projects.idOf(link)).toBe(await projects.idOf(path));
    });

    it('numbers different directories apart', async () => {
      const projects = new ProjectCollection();

      const a = await projects.idOf(folder('a'));
      const b = await projects.idOf(folder('b'));

      expect(a).not.toBe(b);
    });

    it('registers a directory once when several asks arrive at once', async () => {
      const projects = new ProjectCollection();
      const path = folder('app');

      const ids = await Promise.all(Array.from({ length: 8 }, () => new ProjectCollection().idOf(path)));

      expect(new Set(ids).size).toBe(1);
      expect(await projects.all()).toHaveLength(1);
    });

    it('keeps a directory that no longer exists addressable', async () => {
      const projects = new ProjectCollection();
      const path = join(home, 'gone');

      const id = await projects.idOf(path);

      expect(await projects.idOf(path)).toBe(id);
      expect(await projects.pathOf(id)).toBe(path);
    });

    it('refuses a relative path', async () => {
      await expect(new ProjectCollection().idOf('relative/dir')).rejects.toThrow(/absolute/);
    });

    it('leaves null as no project', async () => {
      expect(await new ProjectCollection().idOfOrNull(null)).toBeNull();
      expect(await new ProjectCollection().all()).toEqual([]);
    });
  });

  describe('turning a number back into a directory', () => {
    it('answers the directory of a project, and null for one that is not there', async () => {
      const projects = new ProjectCollection();
      const path = folder('app');
      const id = await projects.idOf(path);

      expect(await projects.pathOf(id)).toBe(path);
      expect(await projects.pathOf(99)).toBeNull();
    });

    it('finds a project by directory without registering one', async () => {
      const projects = new ProjectCollection();

      expect(await projects.findByPath(folder('app'))).toBeNull();
      expect(await projects.all()).toEqual([]);
    });
  });

  describe('a project belongs to no project', () => {
    it('refuses a row that names a project of its own', async () => {
      const projects = new ProjectCollection();
      const row = new Project(0, 3, folder('app'), 0, 1, 1, 0, null, null, 0);

      await expect(projects.insert(row)).rejects.toThrow(/belongs to no project/);
      expect(await projects.all()).toEqual([]);
    });

    it('writes null in the projectId column', async () => {
      const projects = new ProjectCollection();
      await projects.idOf(folder('app'));

      const line = readFileSync(projects.filePath, 'utf-8').trim();

      expect(JSON.parse(line)).toMatchObject({ projectId: null });
    });

    it('settles the spelling of a path an entity is saved with', async () => {
      const projects = new ProjectCollection();
      const path = folder('app');
      const id = await projects.idOf(path);

      const stored = (await projects.find(id)) as Project;
      stored.path = `${path}/`;
      await projects.save(stored);

      expect((await projects.find(id))?.path).toBe(path);
    });
  });

  describe('what the user decided about a project', () => {
    it('is kept on the row and survives a rewrite', async () => {
      const projects = new ProjectCollection();
      const id = await projects.idOf(folder('app'));

      const project = (await projects.find(id)) as Project;
      project.favoritedAt = 1_700_000_000_000;
      project.alias = 'My app';
      project.description = 'The main one';
      await projects.save(project);
      await projects.idOf(folder('other')); // another row, appended after the rewrite

      const stored = (await projects.find(id)) as Project;
      expect(stored.isFavorite).toBe(true);
      expect(stored.alias).toBe('My app');
      expect(stored.description).toBe('The main one');
    });
  });
});
