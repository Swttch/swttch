import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MigrationContext } from '../../entities/migration/Migration';
import { ProjectCollection } from '../../entities/project/Project.collection';
import { PromptItem } from '../../entities/prompt/PromptItem.entity';
import { PromptItemCollection } from '../../entities/prompt/PromptItem.collection';
import { listCategories } from '../../features/prompt-category-registry';
import { createPrompt, readPromptOrderByCategory, readPrompts } from '../../features/prompts';
import ImportLegacyPrompts from '../20261004120200_import-legacy-prompts';

// The old files are written the way the previous version wrote them, and the move
// is checked against real directories: what matters is that every screen shows the
// same library after it, and that the old files are left untouched.

describe('importing the old prompt files', () => {
  let ccgHome: string;
  let userHome: string;
  let projectDir: string;
  let previousHome: string | undefined;

  beforeEach(() => {
    previousHome = process.env.CCG_HOME;
    ccgHome = realpathSync(mkdtempSync(join(tmpdir(), 'ccg-entities-')));
    userHome = realpathSync(mkdtempSync(join(tmpdir(), 'ccg-userhome-')));
    projectDir = realpathSync(mkdtempSync(join(tmpdir(), 'ccg-proj-')));
    process.env.CCG_HOME = ccgHome;
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = previousHome;
    for (const dir of [ccgHome, userHome, projectDir]) rmSync(dir, { recursive: true, force: true });
  });

  const write = (file: string, content: unknown) => {
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content), 'utf-8');
  };
  const globalFile = () => join(userHome, '.claude-code-gui', 'prompts.json');
  const projectFile = (dir: string = projectDir) => join(dir, '.claude-code-gui', 'prompts.json');
  const hash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

  /** Make the program know a project, as the first migration does. */
  const know = (dir: string) => new ProjectCollection().idOf(dir);
  const run = () => new ImportLegacyPrompts().up(new MigrationContext(userHome));

  const prompt = (id: string, createdAt: number, over: Record<string, unknown> = {}) => ({
    id,
    name: `name ${id}`,
    content: `content ${id}`,
    createdAt,
    updatedAt: createdAt + 5,
    ...over,
  });

  const ids = async (scope: 'global' | 'project') =>
    (await readPrompts(scope, scope === 'project' ? projectDir : undefined)).map((p) => p.id);

  describe('the shared file', () => {
    it('does nothing when there is no old file', async () => {
      const report = await run();

      expect(report.summary).toBe('no old data to move');
      expect(report.unreadable).toEqual([]);
      expect(existsSync(join(ccgHome, 'entities'))).toBe(false);
    });

    it('moves prompts and categories and shows the same library as before', async () => {
      write(globalFile(), {
        prompts: [
          prompt('old', 1000, { categories: ['cat-b'] }),
          prompt('new', 3000, { categories: ['cat-a', 'cat-b'] }),
          prompt('mid', 2000),
        ],
        categories: [
          { id: 'cat-a', name: 'alpha', createdAt: 10 },
          { id: 'cat-b', name: 'beta', createdAt: 20 },
        ],
      });

      const report = await run();

      expect(report.summary).toBe('moved 3 prompts, 2 categories, 3 links');
      // Newest first, as the old screens listed them.
      expect(await ids('global')).toEqual(['new', 'mid', 'old']);
      expect((await listCategories()).map((c) => [c.id, c.name])).toEqual([
        ['cat-a', 'alpha'],
        ['cat-b', 'beta'],
      ]);
      const read = await readPrompts('global');
      expect(read.find((p) => p.id === 'new')?.categories).toEqual(['cat-a', 'cat-b']);
      expect(read.find((p) => p.id === 'mid')?.categories).toBeUndefined();
      // Inside a category: the newest first, too.
      expect(Object.fromEntries(await readPromptOrderByCategory('global'))).toEqual({
        'cat-a': ['new'],
        'cat-b': ['new', 'old'],
      });
    });

    it('moves name, content and both times exactly as they were written', async () => {
      write(globalFile(), {
        prompts: [
          {
            id: 'p',
            name: '  Merge cleanup  ',
            content: '  body\nsecond line  ',
            createdAt: 1700000000123,
            updatedAt: 1700000009999,
          },
        ],
      });
      await run();

      const [moved] = await readPrompts('global');
      expect(moved).toMatchObject({
        id: 'p',
        name: '  Merge cleanup  ',
        content: '  body\nsecond line  ',
        createdAt: 1700000000123,
        updatedAt: 1700000009999,
      });
    });

    it('keeps the old id as the uuid and gives the row a fresh number', async () => {
      write(globalFile(), { prompts: [prompt('abc-123', 1)] });
      await run();

      const [item] = await new PromptItemCollection().inScope(null);
      expect(item?.uuid).toBe('abc-123');
      expect(item?.id).toBe(1);
      expect(item?.projectId).toBeNull();
    });

    it('leaves the old file exactly as it was', async () => {
      write(globalFile(), { prompts: [prompt('a', 1)], categories: [{ id: 'c', name: 'c', createdAt: 1 }] });
      const before = hash(globalFile());

      await run();

      expect(hash(globalFile())).toBe(before);
    });

    it('skips what cannot be read and counts it', async () => {
      write(globalFile(), {
        prompts: [
          prompt('good', 1),
          { id: 'no-content', name: 'x' },
          'not an object',
          { name: 'no id', content: 'b' },
          prompt('good', 2), // an id seen twice
          prompt('pointing', 3, { categories: ['gone'] }),
        ],
      });

      const report = await run();

      expect(report.summary).toBe('moved 2 prompts, 0 categories, 0 links; skipped 5 unreadable rows');
      expect(await ids('global')).toEqual(['pointing', 'good']);
      expect((await readPrompts('global')).find((p) => p.id === 'pointing')?.categories).toBeUndefined();
    });

    it('reads a missing createdAt as 0, which lists the prompt last', async () => {
      write(globalFile(), {
        prompts: [{ id: 'undated', name: 'n', content: 'c' }, prompt('dated', 5)],
      });
      await run();

      expect(await ids('global')).toEqual(['dated', 'undated']);
    });

    it('adds no row twice when it runs again, as after a run that was cut off', async () => {
      write(globalFile(), { prompts: [prompt('a', 1)], categories: [{ id: 'c', name: 'c', createdAt: 1 }] });
      await run();

      await run();

      expect(await ids('global')).toEqual(['a']);
      expect(await listCategories()).toHaveLength(1);
    });

    it('moves only what is missing after a run that was cut off half way', async () => {
      write(globalFile(), { prompts: [prompt('a', 1), prompt('b', 2)] });
      // The first prompt had been written when the process ended.
      await new PromptItemCollection().insert(PromptItem.draft(null, 'a', 'name a', 'content a', 2, 1, 6));

      await run();

      expect(await ids('global')).toEqual(['b', 'a']);
    });

    it('refuses to write over an entity file it cannot read', async () => {
      write(globalFile(), { prompts: [prompt('a', 1)] });
      // A path that is a folder cannot be read as a file.
      mkdirSync(join(ccgHome, 'entities', 'prompt', 'prompt_items.entity.jsonl'), { recursive: true });

      await expect(run()).rejects.toThrow();
    });

    it('moves an empty old file as nothing', async () => {
      write(globalFile(), '');

      expect((await run()).summary).toBe('moved 0 prompts, 0 categories, 0 links');
    });

    // The old store was never allowed to declare the library empty over a file it
    // could not parse. The file stays where it is, and the user is told which
    // directory it was in; nothing else is held back.
    it('reports a file that is not JSON and moves the rest', async () => {
      write(globalFile(), '{"prompts": [');
      write(projectFile(), { prompts: [prompt('mine', 1)] });
      await know(projectDir);

      const report = await run();

      expect(report.unreadable).toEqual([join(userHome, '.claude-code-gui')]);
      expect(await ids('project')).toEqual(['mine']);
      expect(readFileSync(globalFile(), 'utf-8')).toBe('{"prompts": [');
    });
  });

  describe('a project file', () => {
    it('moves a project\'s prompts under that project, leaving the shared ones alone', async () => {
      write(globalFile(), { prompts: [prompt('shared', 1)] });
      write(projectFile(), { prompts: [prompt('mine-old', 10), prompt('mine-new', 20)] });
      await know(projectDir);

      const report = await run();

      expect(report.summary).toBe('moved 3 prompts, 0 categories, 0 links');
      expect(await ids('project')).toEqual(['mine-new', 'mine-old']);
      expect(await ids('global')).toEqual(['shared']);
    });

    it('files a project prompt under the shared category its old id named', async () => {
      write(globalFile(), { prompts: [], categories: [{ id: 'cat', name: 'review', createdAt: 1 }] });
      write(projectFile(), { prompts: [prompt('mine', 10, { categories: ['cat'] })] });
      await know(projectDir);

      await run();

      expect((await readPrompts('project', projectDir))[0]?.categories).toEqual(['cat']);
      expect(Object.fromEntries(await readPromptOrderByCategory('project', projectDir))).toEqual({ cat: ['mine'] });
      expect(Object.fromEntries(await readPromptOrderByCategory('global'))).toEqual({});
    });

    it('keeps the same prompt id in two projects apart', async () => {
      const other = realpathSync(mkdtempSync(join(tmpdir(), 'ccg-proj2-')));
      try {
        write(projectFile(), { prompts: [prompt('same', 1, { name: 'first' })] });
        write(projectFile(other), { prompts: [prompt('same', 1, { name: 'second' })] });
        await know(projectDir);
        await know(other);

        await run();

        expect((await readPrompts('project', projectDir))[0]?.name).toBe('first');
        expect((await readPrompts('project', other))[0]?.name).toBe('second');
      } finally {
        rmSync(other, { recursive: true, force: true });
      }
    });

    it('moves every project that has an old file and passes over the rest', async () => {
      const second = realpathSync(mkdtempSync(join(tmpdir(), 'ccg-proj3-')));
      const empty = realpathSync(mkdtempSync(join(tmpdir(), 'ccg-proj4-')));
      try {
        write(projectFile(), { prompts: [prompt('a', 1)] });
        write(projectFile(second), { prompts: [prompt('b', 1)] });
        await know(projectDir);
        await know(second);
        await know(empty);

        const report = await run();

        expect(report.summary).toBe('moved 2 prompts, 0 categories, 0 links');
        expect(report.unreadable).toEqual([]);
      } finally {
        rmSync(second, { recursive: true, force: true });
        rmSync(empty, { recursive: true, force: true });
      }
    });

    it('leaves the old project file exactly as it was', async () => {
      write(projectFile(), { prompts: [prompt('a', 1)] });
      await know(projectDir);
      const before = hash(projectFile());

      await run();

      expect(hash(projectFile())).toBe(before);
    });

    it('does not put a new prompt of the same project on top of the moved ones out of order', async () => {
      write(projectFile(), { prompts: [prompt('a', 1), prompt('b', 2)] });
      await know(projectDir);
      await run();

      await createPrompt('project', projectDir, 'fresh', 'body');

      expect((await readPrompts('project', projectDir)).map((p) => p.name)).toEqual(['fresh', 'name b', 'name a']);
    });

    // A project that is the home folder holds the shared file, which is not a
    // project's: its prompts must not show up twice.
    it('does not take the shared file for the file of the project that is the home folder', async () => {
      write(globalFile(), { prompts: [prompt('shared', 1)] });
      await know(userHome);

      await run();

      expect((await new PromptItemCollection().all()).map((item) => [item.uuid, item.projectId])).toEqual([
        ['shared', null],
      ]);
    });

    it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
      'reports a project whose old file cannot be read for lack of permission, and moves the others',
      async () => {
        const locked = realpathSync(mkdtempSync(join(tmpdir(), 'ccg-proj5-')));
        try {
          write(projectFile(locked), { prompts: [prompt('hidden', 1)] });
          chmodSync(projectFile(locked), 0o000);
          write(projectFile(), { prompts: [prompt('open', 1)] });
          await know(locked);
          await know(projectDir);

          const report = await run();

          expect(report.unreadable).toEqual([locked]);
          expect(await ids('project')).toEqual(['open']);
        } finally {
          chmodSync(projectFile(locked), 0o600);
          rmSync(locked, { recursive: true, force: true });
        }
      },
    );

    it('reports a project file that is not JSON and moves the others', async () => {
      const broken = realpathSync(mkdtempSync(join(tmpdir(), 'ccg-proj6-')));
      try {
        write(projectFile(broken), 'not json');
        write(projectFile(), { prompts: [prompt('fine', 1)] });
        await know(broken);
        await know(projectDir);

        const report = await run();

        expect(report.unreadable).toEqual([broken]);
        expect(await ids('project')).toEqual(['fine']);
      } finally {
        rmSync(broken, { recursive: true, force: true });
      }
    });
  });

  // A folder that could not be read is read again later, by the program itself,
  // when the cause is gone. A file that is not JSON stands for any cause here: the
  // migration treats a permission refusal the same way.
  describe('reading the unread folders again', () => {
    const retry = (folders: string[]) => new ImportLegacyPrompts().retry(new MigrationContext(userHome), folders);

    it('moves a project\'s prompts once its file reads, and answers that nothing is unread any more', async () => {
      write(projectFile(), 'not json');
      await know(projectDir);
      expect((await run()).unreadable).toEqual([projectDir]);
      expect(await ids('project')).toEqual([]);

      write(projectFile(), { prompts: [prompt('a', 1), prompt('b', 2)] });

      expect(await retry([projectDir])).toEqual([]);
      expect(await ids('project')).toEqual(['b', 'a']);
    });

    it('answers the folders that still cannot be read, and moves nothing from them', async () => {
      write(projectFile(), 'not json');
      await know(projectDir);
      await run();

      expect(await retry([projectDir])).toEqual([projectDir]);
      expect(await ids('project')).toEqual([]);
    });

    it('moves the readable folders even when another one is still unread', async () => {
      const broken = realpathSync(mkdtempSync(join(tmpdir(), 'ccg-proj7-')));
      try {
        write(projectFile(broken), 'not json');
        write(projectFile(), 'not json');
        await know(broken);
        await know(projectDir);
        await run();
        write(projectFile(), { prompts: [prompt('fine', 1)] });

        expect(await retry([broken, projectDir])).toEqual([broken]);
        expect(await ids('project')).toEqual(['fine']);
      } finally {
        rmSync(broken, { recursive: true, force: true });
      }
    });

    it('moves the shared file first, so a project prompt finds the category its old id named', async () => {
      write(globalFile(), 'not json');
      write(projectFile(), 'not json');
      await know(projectDir);
      await run();
      write(globalFile(), { prompts: [], categories: [{ id: 'cat', name: 'review', createdAt: 1 }] });
      write(projectFile(), { prompts: [prompt('p', 1, { categories: ['cat'] })] });

      // Handed over in the wrong order on purpose.
      expect(await retry([projectDir, join(userHome, '.claude-code-gui')])).toEqual([]);

      const order = await readPromptOrderByCategory('project', projectDir);
      expect([...order.values()]).toEqual([['p']]);
    });

    it('puts the moved prompts below the ones the user made in that project meanwhile', async () => {
      write(projectFile(), 'not json');
      await know(projectDir);
      await run();
      // Two, so that a moved prompt given the same place as one of them would show.
      await createPrompt('project', projectDir, 'first made', 'body');
      await createPrompt('project', projectDir, 'second made', 'body');
      write(projectFile(), { prompts: [prompt('a', 1), prompt('b', 2)] });

      await retry([projectDir]);

      expect((await readPrompts('project', projectDir)).map((p) => p.name)).toEqual([
        'second made',
        'first made',
        'name b',
        'name a',
      ]);
    });

    it('adds no row twice when the same folder is read again', async () => {
      write(projectFile(), 'not json');
      await know(projectDir);
      await run();
      write(projectFile(), { prompts: [prompt('a', 1)] });

      await retry([projectDir]);
      await retry([projectDir]);

      expect(await ids('project')).toEqual(['a']);
    });

    it('leaves the old file exactly as it was', async () => {
      write(projectFile(), 'not json');
      await know(projectDir);
      await run();
      write(projectFile(), { prompts: [prompt('a', 1)] });
      const before = hash(projectFile());

      await retry([projectDir]);

      expect(hash(projectFile())).toBe(before);
    });

    it('lets go of a folder whose file is gone or whose project the program no longer knows', async () => {
      write(projectFile(), 'not json');
      await know(projectDir);
      await run();
      rmSync(projectFile());

      expect(await retry([projectDir, join(tmpdir(), 'ccg-never-seen-folder')])).toEqual([]);
      expect(await ids('project')).toEqual([]);
    });
  });
});
