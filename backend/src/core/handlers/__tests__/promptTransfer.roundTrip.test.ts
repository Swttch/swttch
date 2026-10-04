import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// The handlers move the old prompt files on first use, and look through the home
// folder in the background. Neither may touch this machine's real files.
const fakeHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('os', async (importOriginal) => {
  const original = await importOriginal<typeof import('os')>();
  return { ...original, homedir: () => fakeHome.dir };
});

import { MessageType } from '../../../shared';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import {
  exportPromptsHandler,
  importPromptsHandler,
  previewPromptImportHandler,
} from '../prompts';
import {
  createPrompt,
  readPromptOrderByCategory,
  readPrompts,
  reorderPrompts,
  type PromptScope,
} from '../../features/prompts';
import { createCategory, listCategories, reorderCategories } from '../../features/prompt-category-registry';
import { PROMPT_EXPORT_FORMAT } from '../../features/prompt-transfer';

describe('exporting and importing the prompt library', () => {
  let ccgHome: string;
  let scratch: string;
  let project: string;
  let previousHome: string | undefined;
  let sent: Array<{ type: string; payload: Record<string, any> }>;
  let saved: string | null;
  let pickedPath: string | null;

  const connections = {
    sendTo: (_id: string, type: string, payload: Record<string, any>) => {
      sent.push({ type, payload });
    },
  } as unknown as ConnectionManager;
  const bridge = {
    saveFile: async ({ contents }: { contents: string }) => {
      saved = contents;
      return { path: join(scratch, 'out.json') };
    },
    pickFiles: async () => ({ paths: pickedPath ? [pickedPath] : [] }),
  } as unknown as Bridge;

  const ask = async (
    handler: typeof exportPromptsHandler,
    type: MessageType,
    payload: Record<string, unknown>,
  ) => {
    sent = [];
    await handler('c1', { type, requestId: 'r1', payload } as IPCMessage, connections, bridge);
    return sent[sent.length - 1]?.payload as Record<string, any>;
  };

  /** Start a different machine: its own entity files and an empty home. */
  const switchMachine = (name: string) => {
    ccgHome = mkdtempSync(join(tmpdir(), `ccg-${name}-`));
    fakeHome.dir = mkdtempSync(join(tmpdir(), `ccg-${name}-user-`));
    process.env.CCG_HOME = ccgHome;
  };

  beforeEach(() => {
    previousHome = process.env.CCG_HOME;
    scratch = mkdtempSync(join(tmpdir(), 'ccg-transfer-'));
    project = mkdtempSync(join(tmpdir(), 'ccg-transfer-proj-'));
    saved = null;
    pickedPath = null;
    switchMachine('source');
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = previousHome;
    for (const dir of [ccgHome, fakeHome.dir, scratch, project]) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const make = async (scope: PromptScope, name: string, categoryIds: string[] = []) => {
    const result = await createPrompt(
      scope,
      scope === 'project' ? project : undefined,
      name,
      `${name} body`,
      categoryIds,
    );
    if (result.status !== 'ok') throw new Error(result.error);
    return result.prompt;
  };
  const makeCategory = async (name: string) => {
    const result = await createCategory(name);
    if (result.status !== 'ok') throw new Error(result.error);
    return result.categories.find((category) => category.name === name)!.id;
  };

  const exportAll = async (scope: PromptScope = 'global') => {
    await ask(exportPromptsHandler, MessageType.EXPORT_PROMPTS, {
      scope,
      ...(scope === 'project' ? { workingDir: project } : {}),
      ids: [],
    });
    return saved as unknown as string;
  };

  /** Preview the file and import everything in it, the way the library screen does. */
  const importFile = async (
    raw: string,
    strategy: 'skip' | 'overwrite' | 'duplicate' = 'skip',
    scope: PromptScope = 'global',
  ) => {
    pickedPath = join(scratch, 'in.json');
    writeFileSync(pickedPath, raw, 'utf-8');
    const where = scope === 'project' ? { workingDir: project } : {};
    const preview = await ask(previewPromptImportHandler, MessageType.PREVIEW_PROMPT_IMPORT, {
      scope,
      ...where,
    });
    const ack = await ask(importPromptsHandler, MessageType.IMPORT_PROMPTS, {
      scope,
      ...where,
      prompts: preview.items.map((item: { prompt: unknown }) => item.prompt),
      links: preview.links,
      strategy,
    });
    return { preview, ack };
  };

  /** What a screen shows, with category ids turned back into names so machines compare. */
  const shown = async (scope: PromptScope = 'global') => {
    const where = scope === 'project' ? project : undefined;
    const nameOf = new Map((await listCategories()).map((c) => [c.id, c.name]));
    const prompts = await readPrompts(scope, where);
    const byId = new Map(prompts.map((p) => [p.id, p.name]));
    const order = await readPromptOrderByCategory(scope, where);
    return {
      list: prompts.map((p) => [p.name, p.content, (p.categories ?? []).map((id) => nameOf.get(id)).sort()]),
      insideCategory: Object.fromEntries(
        [...order].map(([id, ids]) => [nameOf.get(id), ids.map((promptId) => byId.get(promptId))]),
      ),
      column: (await listCategories()).map((c) => c.name),
    };
  };

  describe('the file', () => {
    it('is v2, lists the prompts in the library order and carries the order inside each category', async () => {
      const review = await makeCategory('review');
      const a = await make('global', 'a', [review]);
      const b = await make('global', 'b', [review]);
      const c = await make('global', 'c');
      await reorderPrompts('global', undefined, [b.id, c.id, a.id]);
      await reorderPrompts('global', undefined, [a.id, b.id], review);

      const file = JSON.parse(await exportAll());

      expect(file.format).toBe(PROMPT_EXPORT_FORMAT);
      expect(file.prompts.map((p: { name: string }) => p.name)).toEqual(['b', 'c', 'a']);
      expect(file.prompts.map((p: { id: string }) => p.id)).toEqual([b.id, c.id, a.id]);
      expect(file.categories).toEqual([expect.objectContaining({ id: review, name: 'review' })]);
      expect(file.links).toEqual([
        { categoryId: review, promptId: a.id, priority: 1 },
        { categoryId: review, promptId: b.id, priority: 2 },
      ]);
    });

    it('uses string ids in the shape an older version reads', async () => {
      const review = await makeCategory('review');
      await make('global', 'a', [review]);

      const file = JSON.parse(await exportAll());

      expect(typeof file.prompts[0].id).toBe('string');
      expect(file.prompts[0].categories).toEqual([review]);
      expect(typeof file.categories[0].id).toBe('string');
      expect(file.prompts[0]).not.toHaveProperty('priority');
      expect(file.prompts[0]).not.toHaveProperty('cwd');
    });

    it('holds only the chosen prompts and the links among them', async () => {
      const review = await makeCategory('review');
      const a = await make('global', 'a', [review]);
      await make('global', 'b', [review]);
      sent = [];
      await ask(exportPromptsHandler, MessageType.EXPORT_PROMPTS, { scope: 'global', ids: [a.id] });

      const file = JSON.parse(saved as unknown as string);

      expect(file.prompts.map((p: { name: string }) => p.name)).toEqual(['a']);
      // `a` was filed first, so `b` sits above it: its place keeps the gap that
      // the left-out prompt leaves, and only the relative order is read back.
      expect(file.links).toEqual([{ categoryId: review, promptId: a.id, priority: 2 }]);
    });

    it('exports a project\'s prompts and nothing of the shared ones', async () => {
      await make('global', 'shared');
      await make('project', 'mine');

      const file = JSON.parse(await exportAll('project'));

      expect(file.prompts.map((p: { name: string }) => p.name)).toEqual(['mine']);
    });
  });

  describe('a round trip', () => {
    it('brings back the same prompts, order, categories and order inside each category', async () => {
      const review = await makeCategory('review');
      const docs = await makeCategory('docs');
      const a = await make('global', 'a', [review, docs]);
      const b = await make('global', 'b', [review]);
      const c = await make('global', 'c', [docs]);
      await make('global', 'plain');
      await reorderPrompts('global', undefined, [c.id, a.id, b.id]);
      await reorderPrompts('global', undefined, [b.id, a.id], review);
      await reorderCategories([docs, review]);
      const before = await shown();
      const raw = await exportAll();

      switchMachine('target');
      await importFile(raw);

      expect(await shown()).toEqual(before);
    });

    it('keeps the uuids, so a later import recognises the same prompts', async () => {
      const a = await make('global', 'a');
      const raw = await exportAll();

      switchMachine('target');
      await importFile(raw);

      expect((await readPrompts('global')).map((p) => p.id)).toEqual([a.id]);
    });

    it('brings a project\'s prompts into the project of the machine it is imported on', async () => {
      await make('project', 'mine');
      const raw = await exportAll('project');

      switchMachine('target');
      await importFile(raw, 'skip', 'project');

      expect((await shown('project')).list.map(([name]) => name)).toEqual(['mine']);
      expect(await shown('global')).toMatchObject({ list: [] });
    });

    it('reports what it did', async () => {
      await make('global', 'a');
      await make('global', 'b');
      const raw = await exportAll();

      switchMachine('target');
      const { preview, ack } = await importFile(raw);

      expect(preview).toMatchObject({ newCount: 2, updateCount: 0 });
      expect(ack).toMatchObject({ imported: 2, updated: 0, skipped: 0 });
    });
  });

  describe('files from before the order was carried', () => {
    const v1 = (over: Record<string, unknown> = {}) =>
      JSON.stringify({
        format: 'claude-code-prompts-export-v1',
        exportTime: '2026-09-13T00:00:00.000Z',
        promptCount: 3,
        prompts: [
          { id: 'p-new', name: 'newest', content: 'x', createdAt: 3, updatedAt: 3, categories: ['c1'] },
          { id: 'p-mid', name: 'middle', content: 'y', createdAt: 2, updatedAt: 2 },
          { id: 'p-old', name: 'oldest', content: 'z', createdAt: 1, updatedAt: 1, categories: ['c1'] },
        ],
        categories: [{ id: 'c1', name: 'review', createdAt: 1 }],
        ...over,
      });

    it('keeps the order of the prompts in the file, categories included', async () => {
      await importFile(v1());

      expect(await shown()).toEqual({
        list: [
          ['newest', 'x', ['review']],
          ['middle', 'y', []],
          ['oldest', 'z', ['review']],
        ],
        insideCategory: { review: ['newest', 'oldest'] },
        column: ['review'],
      });
    });

    it('reads the saved-file shape that has no format marker at all', async () => {
      await importFile(JSON.stringify({ prompts: [{ id: 'p', name: 'n', content: 'c' }] }));

      expect((await readPrompts('global')).map((p) => p.name)).toEqual(['n']);
    });

    it('matches a category to the one this machine already has, by name', async () => {
      const mine = await makeCategory('Review');

      await importFile(v1());

      expect((await listCategories()).map((c) => c.id)).toEqual([mine]);
      expect((await readPrompts('global'))[0]?.categories).toEqual([mine]);
    });
  });

  describe('into a library that already has prompts', () => {
    it('puts the new prompts on top in the file\'s order and leaves the others where they are', async () => {
      await make('global', 'old-1');
      await make('global', 'old-2');
      const src = [{ id: 'in-1', name: 'in1' }, { id: 'in-2', name: 'in2' }].map((p) => ({
        ...p,
        content: 'c',
        createdAt: 1,
        updatedAt: 1,
      }));

      await importFile(JSON.stringify({ prompts: src }));

      expect((await readPrompts('global')).map((p) => p.name)).toEqual(['in1', 'in2', 'old-2', 'old-1']);
    });

    it('puts the new prompts on top inside a category, in the order the file gives', async () => {
      const review = await makeCategory('review');
      await make('global', 'mine', [review]);
      const file = JSON.stringify({
        prompts: [
          { id: 'x', name: 'x', content: 'c', createdAt: 1, updatedAt: 1, categories: ['fc'] },
          { id: 'y', name: 'y', content: 'c', createdAt: 1, updatedAt: 1, categories: ['fc'] },
        ],
        categories: [{ id: 'fc', name: 'review', createdAt: 1 }],
        links: [
          { categoryId: 'fc', promptId: 'y', priority: 1 },
          { categoryId: 'fc', promptId: 'x', priority: 2 },
        ],
      });

      await importFile(file);

      expect((await shown()).insideCategory).toEqual({ review: ['y', 'x', 'mine'] });
      // The library order is the order of the file, not of the category.
      expect((await readPrompts('global')).map((p) => p.name)).toEqual(['x', 'y', 'mine']);
    });

    const stored = (name: string) => ({
      id: 'same',
      name,
      content: `${name} body`,
      createdAt: 5,
      updatedAt: 5,
    });

    it('skip keeps what is stored', async () => {
      await importFile(JSON.stringify({ prompts: [stored('first')] }));
      const { ack } = await importFile(JSON.stringify({ prompts: [stored('second')] }), 'skip');

      expect(ack).toMatchObject({ imported: 0, updated: 0, skipped: 1 });
      expect((await readPrompts('global')).map((p) => p.name)).toEqual(['first']);
    });

    it('overwrite replaces the prompt in place and keeps its place in the library', async () => {
      await importFile(JSON.stringify({ prompts: [stored('first')] }));
      await make('global', 'later'); // now above it
      const { ack } = await importFile(JSON.stringify({ prompts: [stored('second')] }), 'overwrite');

      expect(ack).toMatchObject({ imported: 0, updated: 1, skipped: 0 });
      expect((await readPrompts('global')).map((p) => p.name)).toEqual(['later', 'second']);
    });

    it('overwrite replaces the categories the prompt is filed under', async () => {
      const old = await makeCategory('old');
      await importFile(JSON.stringify({ prompts: [{ ...stored('first'), categories: [old] }], categories: [{ id: old, name: 'old', createdAt: 1 }] }));

      await importFile(
        JSON.stringify({
          prompts: [{ ...stored('second'), categories: ['n'] }],
          categories: [{ id: 'n', name: 'new', createdAt: 1 }],
        }),
        'overwrite',
      );

      expect((await shown()).list).toEqual([['second', 'second body', ['new']]]);
    });

    it('duplicate keeps both, the copy on top with an id of its own', async () => {
      await importFile(JSON.stringify({ prompts: [stored('first')] }));
      const { ack } = await importFile(JSON.stringify({ prompts: [stored('second')] }), 'duplicate');

      expect(ack).toMatchObject({ imported: 1, updated: 0, skipped: 0 });
      const prompts = await readPrompts('global');
      expect(prompts.map((p) => p.name)).toEqual(['second', 'first']);
      expect(new Set(prompts.map((p) => p.id)).size).toBe(2);
    });

    it('duplicate files the copy in the same categories, with the order of the file', async () => {
      const file = (name: string) =>
        JSON.stringify({
          prompts: [{ ...stored(name), categories: ['c'] }],
          categories: [{ id: 'c', name: 'review', createdAt: 1 }],
          links: [{ categoryId: 'c', promptId: 'same', priority: 1 }],
        });
      await importFile(file('first'));

      await importFile(file('second'), 'duplicate');

      expect((await shown()).insideCategory).toEqual({ review: ['second', 'first'] });
    });
  });

  describe('a file that cannot be used', () => {
    it('says the file is not JSON', async () => {
      pickedPath = join(scratch, 'bad.json');
      writeFileSync(pickedPath, '{ nope', 'utf-8');

      const ack = await ask(previewPromptImportHandler, MessageType.PREVIEW_PROMPT_IMPORT, { scope: 'global' });

      expect(ack).toMatchObject({ status: 'error', error: 'not-json' });
    });

    it('treats a cancelled picker as neither a preview nor an error', async () => {
      pickedPath = null;

      const ack = await ask(previewPromptImportHandler, MessageType.PREVIEW_PROMPT_IMPORT, { scope: 'global' });

      expect(ack).toMatchObject({ status: 'ok', cancelled: true });
    });

    it('ignores links that are not links', async () => {
      await importFile(
        JSON.stringify({
          prompts: [{ id: 'p', name: 'n', content: 'c' }],
          links: 'nonsense',
        }),
      );

      expect((await readPrompts('global')).map((p) => p.name)).toEqual(['n']);
    });
  });
});
