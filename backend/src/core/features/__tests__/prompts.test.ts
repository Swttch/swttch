import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync, realpathSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  SavedPrompt,
  readPrompts,
  readPromptOrderByCategory,
  createPrompt,
  updatePrompt,
  deletePrompt,
  reorderPrompts,
  mutatePromptStore,
  PROMPT_NAME_MAX_LENGTH,
  PROMPT_CONTENT_MAX_LENGTH,
} from '../prompts';
import { createCategory, deleteCategory } from '../prompt-category-registry';
import { ProjectCollection } from '../../entities/project/Project.collection';
import type { Project } from '../../entities/project/Project.entity';
import { PromptItemCollection } from '../../entities/prompt/PromptItem.collection';
import { PromptCategoryItemLinkCollection } from '../../entities/prompt/PromptCategoryItemLink.collection';

// Everything is exercised end to end against real directories, because the
// whole point of the store is the read-modify-write: a mocked fs would let an
// unreadable-file regression through (the #386 class of defect), and that is the
// one failure mode a prompt library must not have.

describe('prompt library store', () => {
  let home: string;
  let projectDir: string;
  let previousHome: string | undefined;
  const itemsFile = () => join(home, 'entities', 'prompt', 'prompt_items.entity.jsonl');

  beforeEach(() => {
    previousHome = process.env.CCG_HOME;
    home = mkdtempSync(join(tmpdir(), 'ccg-home-'));
    projectDir = mkdtempSync(join(tmpdir(), 'ccg-project-'));
    process.env.CCG_HOME = home;
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = previousHome;
    rmSync(home, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  /** The rows of the items file, one parsed line each. */
  const readRows = () =>
    readFileSync(itemsFile(), 'utf-8')
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line)) as Array<{
      id: number;
      projectId: number | null;
      uuid: string;
      name: string;
      content: string;
      priority: number;
    }>;

  const rowsOf = (projects: Project[]) => projects.map((project) => project.path);

  const ok = async (scope: 'global' | 'project', name: string, categories?: string[]) => {
    const result = await createPrompt(
      scope,
      scope === 'project' ? projectDir : undefined,
      name,
      `${name} body`,
      categories,
    );
    if (result.status !== 'ok') throw new Error(`fixture failed: ${result.error}`);
    return result.prompt;
  };
  const namesOf = async (scope: 'global' | 'project') =>
    (await readPrompts(scope, scope === 'project' ? projectDir : undefined)).map((p) => p.name);

  describe('readPrompts()', () => {
    it('reads an absent store as an empty list', async () => {
      expect(await readPrompts('project', projectDir)).toEqual([]);
    });

    it('refuses to call an unreadable file an empty library', async () => {
      mkdirSync(itemsFile(), { recursive: true }); // a path that is a folder cannot be read as a file
      await expect(readPrompts('global')).rejects.toThrow(/could not be read/);
    });

    it('hands out the uuid as the id and never the integer one', async () => {
      const created = await ok('global', 'one');
      const [read] = await readPrompts('global');
      expect(read?.id).toBe(created.id);
      expect(read?.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('lists a project\'s prompts apart from the global ones', async () => {
      await ok('global', 'shared');
      await ok('project', 'mine');
      expect(await namesOf('global')).toEqual(['shared']);
      expect(await namesOf('project')).toEqual(['mine']);
    });

    it('does not show one project\'s prompts in another', async () => {
      await ok('project', 'mine');
      const other = mkdtempSync(join(tmpdir(), 'ccg-other-'));
      try {
        expect(await readPrompts('project', other)).toEqual([]);
      } finally {
        rmSync(other, { recursive: true, force: true });
      }
    });

    it('answers an empty list for project scope with no project', async () => {
      expect(await readPrompts('project')).toEqual([]);
    });
  });

  describe('createPrompt()', () => {
    it('stores the prompt and assigns an id and both timestamps', async () => {
      const result = await createPrompt('project', projectDir, '머지 정리', '머지했어 확인하고 로컬 정리해');
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;

      expect(result.prompt.id).not.toBe('');
      expect(result.prompt.createdAt).toBeGreaterThan(0);
      expect(result.prompt.updatedAt).toBe(result.prompt.createdAt);
      expect(readRows()).toHaveLength(1);
      expect(readRows()[0]?.content).toBe('머지했어 확인하고 로컬 정리해');
    });

    it('writes the number of the project in the projectId column and nothing in the global rows', async () => {
      await ok('project', 'mine');
      await ok('global', 'shared');
      const rows = readRows();
      expect(typeof rows.find((row) => row.name === 'mine')?.projectId).toBe('number');
      expect(rows.find((row) => row.name === 'shared')?.projectId).toBeNull();
    });

    it('registers the directory of a project prompt as a project', async () => {
      await ok('project', 'mine');
      const projects = await new ProjectCollection().all();
      expect(projects).toHaveLength(1);
      expect(rowsOf(projects)[0]).toBe(realpathSync(projectDir));
    });

    it('trims the name but leaves the content exactly as the user typed it', async () => {
      const result = await createPrompt('project', projectDir, '  정리  ', '  들여쓴 본문  ');
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;
      expect(result.prompt.name).toBe('정리');
      expect(result.prompt.content).toBe('  들여쓴 본문  ');
    });

    it('puts the newest prompt on top and keeps the others in order', async () => {
      await ok('project', 'first');
      await ok('project', 'second');
      await ok('project', 'third');
      expect(await namesOf('project')).toEqual(['third', 'second', 'first']);
      expect(readRows().map((row) => row.priority).sort()).toEqual([1, 2, 3]);
    });

    it('never hands out an integer id twice', async () => {
      const first = await ok('global', 'a');
      await deletePrompt('global', undefined, first.id);
      await ok('global', 'b');
      expect(readRows().map((row) => row.id)).toEqual([2]);
    });

    it('rejects an empty name and an empty content', async () => {
      expect(await createPrompt('project', projectDir, '   ', 'body')).toEqual({
        status: 'error',
        error: 'Prompt name must not be empty',
      });
      expect(await createPrompt('project', projectDir, 'name', '')).toEqual({
        status: 'error',
        error: 'Prompt content must not be empty',
      });
    });

    it('rejects a name and a content that exceed their limits', async () => {
      const longName = 'n'.repeat(PROMPT_NAME_MAX_LENGTH + 1);
      const longContent = 'c'.repeat(PROMPT_CONTENT_MAX_LENGTH + 1);
      expect((await createPrompt('project', projectDir, longName, 'body')).status).toBe('error');
      expect((await createPrompt('project', projectDir, 'name', longContent)).status).toBe('error');
    });

    it('refuses to write when the store exists but cannot be read', async () => {
      mkdirSync(itemsFile(), { recursive: true }); // a path that is a folder cannot be read as a file
      const result = await createPrompt('project', projectDir, 'name', 'body');
      expect(result.status).toBe('error');
      // The unreadable path is still there, unreplaced: refusing the write is the
      // whole point, because replacing it would delete every saved prompt.
      expect(statSync(itemsFile()).isDirectory()).toBe(true);
    });

    it('creates the entity folder when nothing has been saved yet', async () => {
      expect(existsSync(join(home, 'entities'))).toBe(false);
      expect((await createPrompt('project', projectDir, 'name', 'body')).status).toBe('ok');
      expect(existsSync(itemsFile())).toBe(true);
    });

    it('refuses project scope with no project', async () => {
      expect(await createPrompt('project', undefined, 'name', 'body')).toEqual({
        status: 'error',
        error: 'projectPath required for project scope',
      });
    });
  });

  describe('categories on a prompt', () => {
    it('files a prompt under the categories named by uuid', async () => {
      const review = await createCategory('review');
      if (review.status !== 'ok') throw new Error('fixture failed');
      const categoryId = review.categories[0]?.id as string;

      const prompt = await ok('global', 'one', [categoryId]);
      expect(prompt.categories).toEqual([categoryId]);
      expect((await readPrompts('global'))[0]?.categories).toEqual([categoryId]);
    });

    it('ignores a category uuid that no category has', async () => {
      const prompt = await ok('global', 'one', ['00000000-0000-0000-0000-000000000000']);
      expect(prompt.categories).toBeUndefined();
    });

    it('lets an edit move a prompt between categories', async () => {
      await createCategory('a');
      const made = await createCategory('b');
      if (made.status !== 'ok') throw new Error('fixture failed');
      const [a, b] = made.categories.map((category) => category.id) as [string, string];
      const prompt = await ok('global', 'one', [a]);

      const result = await updatePrompt('global', undefined, prompt.id, 'one', 'body', [b]);
      expect(result.status === 'ok' && result.prompt.categories).toEqual([b]);
    });

    it('lets an edit take a prompt out of every category', async () => {
      const made = await createCategory('a');
      if (made.status !== 'ok') throw new Error('fixture failed');
      const prompt = await ok('global', 'one', [made.categories[0]?.id as string]);

      const result = await updatePrompt('global', undefined, prompt.id, 'one', 'body', []);
      expect(result.status === 'ok' && result.prompt.categories).toBeUndefined();
    });

    it('unfiles the prompts of a deleted category without deleting them', async () => {
      const made = await createCategory('a');
      if (made.status !== 'ok') throw new Error('fixture failed');
      const categoryId = made.categories[0]?.id as string;
      await ok('global', 'one', [categoryId]);

      await deleteCategory(categoryId);
      const [read] = await readPrompts('global');
      expect(read?.name).toBe('one');
      expect(read?.categories).toBeUndefined();
      expect(await new PromptCategoryItemLinkCollection().all()).toEqual([]);
    });

    it('keeps a project prompt\'s place inside a category apart from the global ones', async () => {
      const made = await createCategory('a');
      if (made.status !== 'ok') throw new Error('fixture failed');
      const categoryId = made.categories[0]?.id as string;
      const shared = await ok('global', 'shared', [categoryId]);
      const mine = await ok('project', 'mine', [categoryId]);

      expect(Object.fromEntries(await readPromptOrderByCategory('global'))).toEqual({ [categoryId]: [shared.id] });
      expect(Object.fromEntries(await readPromptOrderByCategory('project', projectDir))).toEqual({ [categoryId]: [mine.id] });
    });
  });

  describe('updatePrompt()', () => {
    it('edits the name and content and moves updatedAt but not createdAt', async () => {
      const created = await ok('project', 'before');

      const result = await updatePrompt('project', projectDir, created.id, 'after', 'new body');
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;
      expect(result.prompt.name).toBe('after');
      expect(result.prompt.content).toBe('new body');
      expect(result.prompt.createdAt).toBe(created.createdAt);
      expect(result.prompt.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
    });

    it('keeps the place of an edited prompt', async () => {
      const first = await ok('global', 'first');
      await ok('global', 'second');
      await updatePrompt('global', undefined, first.id, 'first edited', 'body');
      expect(await namesOf('global')).toEqual(['second', 'first edited']);
    });

    it('reports an unknown id instead of silently adding a prompt', async () => {
      const result = await updatePrompt('project', projectDir, 'deadbeef', 'name', 'body');
      expect(result).toEqual({ status: 'error', error: 'Prompt not found: deadbeef' });
    });

    it('rejects an id that did not come from us', async () => {
      const result = await updatePrompt('project', projectDir, '../../escape', 'name', 'body');
      expect(result.status).toBe('error');
    });
  });

  describe('deletePrompt()', () => {
    it('removes only the named prompt', async () => {
      const kept = await ok('project', 'kept');
      const doomed = await ok('project', 'doomed');

      expect(await deletePrompt('project', projectDir, doomed.id)).toEqual({ status: 'ok' });
      const remaining = await readPrompts('project', projectDir);
      expect(remaining.map((prompt) => prompt.id)).toEqual([kept.id]);
    });

    it('reports an unknown id rather than claiming success', async () => {
      const result = await deletePrompt('project', projectDir, 'deadbeef');
      expect(result).toEqual({ status: 'error', error: 'Prompt not found: deadbeef' });
    });

    it('cannot delete a prompt of the other scope', async () => {
      const shared = await ok('global', 'shared');
      const result = await deletePrompt('project', projectDir, shared.id);
      expect(result.status).toBe('error');
      expect(await namesOf('global')).toEqual(['shared']);
    });
  });

  describe('reorderPrompts()', () => {
    it('stores the library order and reads it back', async () => {
      const a = await ok('global', 'a');
      const b = await ok('global', 'b');
      const c = await ok('global', 'c');

      expect(await reorderPrompts('global', undefined, [a.id, c.id, b.id])).toEqual({ status: 'ok' });
      expect(await namesOf('global')).toEqual(['a', 'c', 'b']);
    });

    it('leaves the other scope\'s order alone', async () => {
      const g1 = await ok('global', 'g1');
      await ok('global', 'g2');
      await ok('project', 'p1');
      await ok('project', 'p2');

      await reorderPrompts('global', undefined, [g1.id]);
      expect(await namesOf('global')).toEqual(['g1', 'g2']);
      expect(await namesOf('project')).toEqual(['p2', 'p1']);
    });

    it('puts prompts the order leaves out below the named ones, in their old order', async () => {
      await ok('global', 'a');
      await ok('global', 'b');
      const c = await ok('global', 'c'); // list is c, b, a
      await reorderPrompts('global', undefined, [(await readPrompts('global'))[2]!.id]);
      expect(await namesOf('global')).toEqual(['a', 'c', 'b']);
      expect(c.name).toBe('c');
    });

    it('ignores an id that is not in the scope', async () => {
      const a = await ok('global', 'a');
      const b = await ok('global', 'b');
      await reorderPrompts('global', undefined, ['gone', a.id, b.id]);
      expect(await namesOf('global')).toEqual(['a', 'b']);
    });

    it('stores the order inside one category without touching the library order', async () => {
      const made = await createCategory('x');
      if (made.status !== 'ok') throw new Error('fixture failed');
      const categoryId = made.categories[0]?.id as string;
      const a = await ok('global', 'a', [categoryId]);
      const b = await ok('global', 'b', [categoryId]); // library: b, a  category: b, a

      await reorderPrompts('global', undefined, [a.id, b.id], categoryId);

      expect(await namesOf('global')).toEqual(['b', 'a']);
      expect((await readPromptOrderByCategory('global')).get(categoryId)).toEqual([a.id, b.id]);
    });

    it('refuses an unknown category', async () => {
      const result = await reorderPrompts('global', undefined, [], 'nope');
      expect(result.status).toBe('error');
    });

    it('survives a row it cannot read without losing it', async () => {
      const a = await ok('global', 'a');
      const stranger = { id: 'x', note: 'from a newer version' };
      writeFileSync(itemsFile(), readFileSync(itemsFile(), 'utf-8') + JSON.stringify(stranger) + '\n', 'utf-8');
      await reorderPrompts('global', undefined, [a.id]);
      expect(readRows()).toContainEqual(stranger);
    });
  });

  describe('mutatePromptStore()', () => {
    it('adds the new prompts on top in the order the list gives, keeping the old ones', async () => {
      await ok('global', 'old');
      const result = await mutatePromptStore('global', undefined, (prompts) => [
        new SavedPrompt('in-1', 'in1', 'x', 5, 5),
        new SavedPrompt('in-2', 'in2', 'y', 6, 6),
        ...prompts,
      ]);
      expect(result).toEqual({ status: 'ok' });
      expect(await namesOf('global')).toEqual(['in1', 'in2', 'old']);
      expect((await readPrompts('global'))[0]?.id).toBe('in-1');
    });

    it('edits a prompt in place and removes one that is gone from the list', async () => {
      const a = await ok('global', 'a');
      const b = await ok('global', 'b');
      await mutatePromptStore('global', undefined, (prompts) =>
        prompts
          .filter((p) => p.id !== b.id)
          .map((p) => new SavedPrompt(p.id, 'renamed', p.content, p.createdAt, p.updatedAt, p.categories)),
      );
      expect(await namesOf('global')).toEqual(['renamed']);
      expect((await readPrompts('global'))[0]?.id).toBe(a.id);
    });

    it('stores nothing when the mutation refuses', async () => {
      await ok('global', 'a');
      const result = await mutatePromptStore('global', undefined, () => 'no thanks');
      expect(result).toEqual({ status: 'error', error: 'no thanks' });
      expect(await namesOf('global')).toEqual(['a']);
    });
  });

  it('is what the collection class sees on disk', async () => {
    await ok('global', 'a');
    const items = await new PromptItemCollection().inScope(null);
    expect(items.map((item) => item.name)).toEqual(['a']);
  });
});
