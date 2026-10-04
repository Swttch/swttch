import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { EntityFileUnreadableError } from '../AbstractEntityCollection';
import { PromptItem } from '../prompt/PromptItem.entity';
import { PromptCategory } from '../prompt/PromptCategory.entity';
import { SystemMigration } from '../system/SystemMigration.entity';
import { PromptItemCollection } from '../prompt/PromptItem.collection';
import { PromptCategoryCollection } from '../prompt/PromptCategory.collection';
import { PromptCategoryItemLinkCollection } from '../prompt/PromptCategoryItemLink.collection';
import { ProjectCollection } from '../project/Project.collection';
import { TableMetadataCollection } from '../system/TableMetadata.collection';
import { SystemMigrationCollection } from '../system/SystemMigration.collection';

const NOW = 1_700_000_000_000;

/** What a row of `prompt_items` looks like in its file. A fixture for planting files by hand. */
const itemAttributes = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  projectId: null,
  uuid: 'uuid-1',
  name: 'review',
  content: 'Review the diff.',
  priority: 1,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

/** A prompt that has not been inserted yet. */
const draftItem = (overrides: Record<string, unknown> = {}): PromptItem => {
  const a = itemAttributes(overrides);
  return PromptItem.draft(
    a.projectId as number | null,
    a.uuid as string,
    a.name as string,
    a.content as string,
    a.priority as number,
    a.createdAt as number,
    a.updatedAt as number,
  );
};

describe('entities', () => {
  let home: string;
  let previousHome: string | undefined;

  beforeEach(() => {
    previousHome = process.env.CCG_HOME;
    home = realpathSync(mkdtempSync(join(tmpdir(), 'entities-')));
    process.env.CCG_HOME = home;
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = previousHome;
    rmSync(home, { recursive: true, force: true });
  });

  const fileOf = (domain: string, table: string) =>
    join(home, 'entities', domain, `${table}.entity.jsonl`);
  const textOf = (domain: string, table: string) => readFileSync(fileOf(domain, table), 'utf-8');
  /** The lines of a table's file, each parsed. */
  const readRows = (domain: string, table: string) =>
    textOf(domain, table)
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  const plant = (domain: string, table: string, content: string) => {
    mkdirSync(join(home, 'entities', domain), { recursive: true });
    writeFileSync(fileOf(domain, table), content, 'utf-8');
  };
  /** Rows as the lines of a file, the way the program writes them. */
  const asLines = (rows: unknown[]) => rows.map((row) => JSON.stringify(row)).join('\n') + '\n';

  describe('where each table lives', () => {
    // Entity, table and file are one thing named three ways, and the folder is the
    // domain. The same tree is used for the class files.
    it.each([
      [new PromptItemCollection(), 'prompt', 'prompt_items'],
      [new PromptCategoryCollection(), 'prompt', 'prompt_categories'],
      [new PromptCategoryItemLinkCollection(), 'prompt', 'prompt_category_item_links'],
      [new ProjectCollection(), 'project', 'projects'],
      [new TableMetadataCollection(), 'system', 'table_metadatas'],
      [new SystemMigrationCollection(), 'system', 'system_migrations'],
    ])('keeps %o in %s/%s.entity.jsonl', (collection, domain, table) => {
      expect(collection.filePath).toBe(fileOf(domain, table));
      expect(collection.domain).toBe(domain);
      expect(collection.table).toBe(table);
    });
  });

  describe('creating a row', () => {
    it('numbers rows from 1 and writes one line of JSON per row', async () => {
      const items = new PromptItemCollection();

      const first = await items.insert(draftItem({ uuid: 'a', name: 'one' }));
      const second = await items.insert(draftItem({ uuid: 'b', name: 'two' }));

      expect([first.id, second.id]).toEqual([1, 2]);
      expect(textOf('prompt', 'prompt_items').split('\n')).toHaveLength(3); // two lines and the final break
      expect(readRows('prompt', 'prompt_items').map((row) => row.name)).toEqual(['one', 'two']);
    });

    // "The highest id plus one" would hand a deleted row's id to the next row, and
    // whatever still pointed at the deleted one would point at a stranger.
    it('never gives out an id again after the row was deleted', async () => {
      const items = new PromptItemCollection();
      await items.insert(draftItem({ uuid: 'a' }));
      const second = await items.insert(draftItem({ uuid: 'b' }));

      await items.delete(second.id);
      const third = await items.insert(draftItem({ uuid: 'c' }));

      expect(third.id).toBe(3);
    });

    it('numbers each table on its own', async () => {
      const items = new PromptItemCollection();
      const categories = new PromptCategoryCollection();
      await items.insert(draftItem());
      await items.insert(draftItem({ uuid: 'b' }));

      const category = await categories.insert(PromptCategory.draft('c1', 'Review', 1, NOW));

      expect(category.id).toBe(1);
    });

    it('records each table in the table metadata file', async () => {
      const items = new PromptItemCollection();
      await items.insert(draftItem());
      await items.insert(draftItem({ uuid: 'b' }));

      const records = readRows('system', 'table_metadatas');
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        tableName: 'prompt_items',
        domain: 'prompt',
        lastId: 2,
        rowCount: 2,
        lineCount: 2,
        schemaVersion: 1,
        projectId: null,
      });
    });

    // A file someone filled by hand has ids the table's record never handed out.
    it('starts above the highest id already in the file', async () => {
      plant('prompt', 'prompt_items', asLines([{ ...itemAttributes({ uuid: 'old' }), id: 7 }]));

      const created = await new PromptItemCollection().insert(draftItem({ uuid: 'new' }));

      expect(created.id).toBe(8);
      expect(readRows('system', 'table_metadatas')[0]).toMatchObject({ rowCount: 2, lineCount: 2 });
    });

    it('stores the number of the project on a project prompt, not its directory', async () => {
      const project = join(home, 'project');
      mkdirSync(project);
      const projectId = await new ProjectCollection().idOf(`${project}/`);

      await new PromptItemCollection().insert(draftItem({ projectId }));

      expect(readRows('prompt', 'prompt_items')[0].projectId).toBe(projectId);
      expect(textOf('prompt', 'prompt_items')).not.toContain(project);
    });

    it('numbers ten rows created at once without a repeat or a loss', async () => {
      const items = new PromptItemCollection();

      const created = await Promise.all(
        Array.from({ length: 10 }, (_, i) => items.insert(draftItem({ uuid: `u${i}` }))),
      );

      expect(new Set(created.map((item) => item.id)).size).toBe(10);
      expect(readRows('prompt', 'prompt_items')).toHaveLength(10);
    });
  });

  describe('creating several rows at once', () => {
    const sameUuid = (stored: PromptItem, candidate: PromptItem) =>
      stored.uuid === candidate.uuid;

    it('numbers a block of rows in one run, lowest first', async () => {
      const items = new PromptItemCollection();
      const added = await items.insertMissing(
        [draftItem({ uuid: 'a' }), draftItem({ uuid: 'b' }), draftItem({ uuid: 'c' })],
        sameUuid,
      );

      expect(added.map((item) => [item.uuid, item.id])).toEqual([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);
      expect(readRows('prompt', 'prompt_items')).toHaveLength(3);
    });

    it('adds only the candidates no stored row stands for', async () => {
      const items = new PromptItemCollection();
      await items.insert(draftItem({ uuid: 'a' }));

      const added = await items.insertMissing(
        [draftItem({ uuid: 'a' }), draftItem({ uuid: 'b' })],
        sameUuid,
      );

      expect(added.map((item) => item.uuid)).toEqual(['b']);
      expect((await items.all()).map((item) => item.uuid)).toEqual(['a', 'b']);
    });

    it('never gives a number out twice, even for rows it did not add', async () => {
      const items = new PromptItemCollection();
      await items.insertMissing([draftItem({ uuid: 'a' })], sameUuid);
      await items.insertMissing([draftItem({ uuid: 'a' })], sameUuid); // costs number 2
      const [third] = await items.insertMissing([draftItem({ uuid: 'c' })], sameUuid);

      expect(third?.id).toBe(3);
    });

    it('writes nothing when every candidate is already there', async () => {
      const items = new PromptItemCollection();
      await items.insert(draftItem({ uuid: 'a' }));
      const before = textOf('prompt', 'prompt_items');

      expect(await items.insertMissing([draftItem({ uuid: 'a' })], sameUuid)).toEqual([]);
      expect(textOf('prompt', 'prompt_items')).toBe(before);
    });

    it('answers nothing for no candidates', async () => {
      expect(await new PromptItemCollection().insertMissing([], sameUuid)).toEqual([]);
    });
  });

  describe('reading rows', () => {
    it('reads an absent file as no rows', async () => {
      expect(await new PromptItemCollection().all()).toEqual([]);
    });

    it('answers an entity instance, not a plain object', async () => {
      const items = new PromptItemCollection();
      await items.insert(draftItem());

      const [item] = await items.all();

      expect(item).toBeInstanceOf(PromptItem);
      expect(item.name).toBe('review');
    });

    it('finds a row by id, and answers null for one that is not there', async () => {
      const items = new PromptItemCollection();
      const created = await items.insert(draftItem());

      expect((await items.find(created.id))?.uuid).toBe('uuid-1');
      expect(await items.find(99)).toBeNull();
    });

    it('serialises an entity as its row', async () => {
      const created = await new PromptItemCollection().insert(draftItem());

      expect(JSON.parse(JSON.stringify(created))).toEqual({ ...itemAttributes(), id: 1 });
    });

    it('reads a missing projectId as null', async () => {
      const { projectId: _projectId, ...without } = { ...itemAttributes(), id: 1 } as Record<string, unknown>;
      plant('prompt', 'prompt_items', asLines([without]));

      const [item] = await new PromptItemCollection().all();

      expect(item.projectId).toBeNull();
      expect(item.isGlobal).toBe(true);
    });

    it('lists one project\'s prompts, or the shared ones, in the library\'s order', async () => {
      const project = join(home, 'project');
      mkdirSync(project);
      const projectId = await new ProjectCollection().idOf(project);
      const items = new PromptItemCollection();
      await items.insert(draftItem({ uuid: 'a', name: 'b-shared', priority: 2 }));
      await items.insert(draftItem({ uuid: 'b', name: 'a-shared', priority: 1 }));
      await items.insert(draftItem({ uuid: 'c', name: 'project', projectId, priority: 1 }));

      expect((await items.inScope(null)).map((item) => item.name)).toEqual(['a-shared', 'b-shared']);
      expect((await items.inScope(projectId)).map((item) => item.name)).toEqual(['project']);
    });
  });

  describe('reading a window of rows', () => {
    const fill = async (count: number) => {
      const items = new PromptItemCollection();
      for (let i = 1; i <= count; i++) await items.insert(draftItem({ uuid: `u${i}`, name: `n${i}` }));
      return items;
    };

    it('answers the rows from an offset, at most a limit of them, with the total', async () => {
      const items = await fill(5);

      const page = await items.page(1, 2);

      expect(page.entities.map((item) => item.name)).toEqual(['n2', 'n3']);
      expect(page.total).toBe(5);
      expect(page.hasMore).toBe(true);
    });

    it('says there is nothing after the last window', async () => {
      const items = await fill(5);

      const page = await items.page(4, 10);

      expect(page.entities.map((item) => item.name)).toEqual(['n5']);
      expect(page.hasMore).toBe(false);
    });

    it('windows only the rows a predicate accepts, and counts those', async () => {
      const items = await fill(5);

      const page = await items.page(0, 2, (item) => item.priority === 1);

      expect(page.total).toBe(5);
      const none = await items.page(0, 2, (item) => item.name === 'n3');
      expect(none.entities.map((item) => item.name)).toEqual(['n3']);
      expect(none.total).toBe(1);
    });

    it('counts rows from the table record and follows inserts and deletes', async () => {
      const items = await fill(3);
      expect(await items.count()).toBe(3);

      await items.delete(2);

      expect(await items.count()).toBe(2);
      expect(await items.count((item) => item.name === 'n1')).toBe(1);
    });
  });

  describe('changing and removing rows', () => {
    it('changes some columns of one row and leaves the rest', async () => {
      const items = new PromptItemCollection();
      const created = await items.insert(draftItem());

      created.name = 'renamed';
      created.updatedAt = NOW + 5;
      expect(await items.save(created)).toBe(true);

      const stored = await items.find(created.id);
      expect(stored?.name).toBe('renamed');
      expect(stored?.content).toBe('Review the diff.');
      expect(stored?.updatedAt).toBe(NOW + 5);
    });

    it('never changes an id, and refuses to number a row twice', async () => {
      const created = await new PromptItemCollection().insert(draftItem());

      expect(() => created.assignId(99)).toThrow(/already has its number/);
      expect(created.id).toBe(1);
    });

    it('answers false for a row that is not there', async () => {
      const stranger = new PromptItem(5, null, 'u', 'n', 'c', 1, NOW, NOW);

      expect(await new PromptItemCollection().save(stranger)).toBe(false);
    });

    it('removes one row and says whether there was one', async () => {
      const items = new PromptItemCollection();
      const created = await items.insert(draftItem());

      expect(await items.delete(created.id)).toBe(true);
      expect(await items.delete(created.id)).toBe(false);
      expect(await items.all()).toEqual([]);
    });

    it('drops the lines a change replaced when it rewrites the file', async () => {
      const items = new PromptItemCollection();
      const created = await items.insert(draftItem());
      await items.insert(draftItem({ uuid: 'b' }));
      await items.delete(created.id);

      expect(readRows('prompt', 'prompt_items')).toHaveLength(1);
      expect(readRows('system', 'table_metadatas')[0]).toMatchObject({ rowCount: 1, lineCount: 1, lastId: 2 });
    });
  });

  describe('which line is the row', () => {
    const row = (id: number, overrides: Record<string, unknown> = {}) => ({
      ...itemAttributes({ uuid: `u${id}` }),
      id,
      ...overrides,
    });

    it('takes the later of two lines with the same id', async () => {
      plant('prompt', 'prompt_items', asLines([row(1, { name: 'before' }), row(1, { name: 'after' })]));

      const items = await new PromptItemCollection().all();

      expect(items.map((item) => [item.id, item.name])).toEqual([[1, 'after']]);
    });

    it('treats a line that says an id is deleted as removing the row', async () => {
      plant('prompt', 'prompt_items', asLines([row(1), row(2), { id: 1, deleted: true }]));

      expect((await new PromptItemCollection().all()).map((item) => item.id)).toEqual([2]);
    });

    // The line that deletes a row is not a row that failed the column check, so it
    // is not kept as one: a rewrite leaves neither the row nor the line behind.
    it('leaves neither a deleted row nor the line that deleted it after a rewrite', async () => {
      plant('prompt', 'prompt_items', asLines([row(1), row(2), { id: 1, deleted: true }]));
      const items = new PromptItemCollection();

      const [kept] = await items.all();
      kept.name = 'touched';
      await items.save(kept);

      expect(readRows('prompt', 'prompt_items').map((line) => line.id)).toEqual([2]);
      expect(textOf('prompt', 'prompt_items')).not.toContain('deleted');
    });

    it('lists rows in the order their id first appeared', async () => {
      plant('prompt', 'prompt_items', asLines([row(2), row(1), row(2, { name: 'again' })]));

      const items = await new PromptItemCollection().all();

      expect(items.map((item) => [item.id, item.name])).toEqual([
        [2, 'again'],
        [1, 'review'],
      ]);
    });

    // A number that was ever used must never be handed out again, a deleted row's
    // included.
    it('counts the id of a deleted row when numbering the next one', async () => {
      plant('prompt', 'prompt_items', asLines([row(1), row(5), { id: 5, deleted: true }]));

      const created = await new PromptItemCollection().insert(draftItem({ uuid: 'new' }));

      expect(created.id).toBe(6);
    });

    it('skips blank lines and the carriage return of a Windows editor', async () => {
      const text = [JSON.stringify(row(1)), '', JSON.stringify(row(2))].join('\r\n') + '\r\n';
      plant('prompt', 'prompt_items', text);

      expect((await new PromptItemCollection().all()).map((item) => item.id)).toEqual([1, 2]);
    });
  });

  describe('a line that is not JSON', () => {
    const good = { ...itemAttributes({ uuid: 'good' }), id: 1 };

    // One damaged line costs that line and nothing else. The file as a whole is not
    // "unreadable", and the next rewrite puts the line back as it was.
    it('is set aside, and the rows around it are read', async () => {
      plant('prompt', 'prompt_items', `${JSON.stringify(good)}\nthis is not json\n`);

      expect((await new PromptItemCollection().all()).map((item) => item.uuid)).toEqual(['good']);
    });

    it('is written back untouched when the file is rewritten', async () => {
      plant('prompt', 'prompt_items', `this is not json\n${JSON.stringify(good)}\n`);
      const items = new PromptItemCollection();

      const [kept] = await items.all();
      kept.name = 'touched';
      await items.save(kept);

      expect(textOf('prompt', 'prompt_items')).toContain('this is not json');
      expect((await items.all())[0].name).toBe('touched');
    });

    // A process that died while writing leaves the last line cut short.
    it('is what a last line cut short is, and the next row starts on a fresh line', async () => {
      plant('prompt', 'prompt_items', `${JSON.stringify(good)}\n{"id":2,"uuid":"cu`);
      const items = new PromptItemCollection();
      expect((await items.all()).map((item) => item.uuid)).toEqual(['good']);

      const created = await items.insert(draftItem({ uuid: 'next' }));

      // A cut line is not JSON, so nothing in it can be read, its id included. In a
      // real crash the table's record had handed out that number before the write
      // began, which is what keeps it from being used again.
      expect(created.id).toBe(2);
      expect((await items.all()).map((item) => item.uuid)).toEqual(['good', 'next']);
      expect(textOf('prompt', 'prompt_items')).toContain('{"id":2,"uuid":"cu\n');
    });

    it('does not stop a row from being added to a file that holds one', async () => {
      plant('prompt', 'prompt_items', 'garbage\n');

      const created = await new PromptItemCollection().insert(draftItem());

      expect(created.id).toBe(1);
      expect(textOf('prompt', 'prompt_items').startsWith('garbage\n')).toBe(true);
    });
  });

  describe('a file that cannot be read', () => {
    // Answering "empty" would look like every row was lost, and the next write
    // would then replace the file with that. A path that is a directory cannot be
    // read as a file; so can no other kind of damage be told apart from missing.
    it('refuses to read rather than answering empty', async () => {
      mkdirSync(fileOf('prompt', 'prompt_items'), { recursive: true });

      await expect(new PromptItemCollection().all()).rejects.toBeInstanceOf(EntityFileUnreadableError);
    });

    it('leaves what it found as it was when asked to write', async () => {
      mkdirSync(fileOf('prompt', 'prompt_items'), { recursive: true });

      await expect(new PromptItemCollection().insert(draftItem())).rejects.toBeInstanceOf(Error);
    });

    it('treats an empty file as no rows', async () => {
      plant('prompt', 'prompt_items', '');

      expect(await new PromptItemCollection().all()).toEqual([]);
    });
  });

  describe('rows that fail the column check', () => {
    const good = { ...itemAttributes({ uuid: 'good' }), id: 1 };

    it('skips a malformed row when reading', async () => {
      plant('prompt', 'prompt_items', asLines([good, { id: 2, name: 7 }]));

      expect((await new PromptItemCollection().all()).map((item) => item.uuid)).toEqual(['good']);
    });

    // Reading must not quietly edit a store. A row from a newer version, or one a
    // person mangled by hand, has to survive our next rewrite.
    it('writes a skipped row back untouched when it rewrites the file', async () => {
      const mangled = { id: 2, name: 7, note: 'keep me' };
      plant('prompt', 'prompt_items', asLines([good, mangled]));
      const items = new PromptItemCollection();

      const [first] = await items.all();
      first.name = 'touched';
      await items.save(first);

      const rows = readRows('prompt', 'prompt_items');
      expect(rows).toHaveLength(2);
      expect(rows).toContainEqual(mangled);
    });

    it('skips a row whose id is not a positive whole number', async () => {
      plant('prompt', 'prompt_items', asLines([good, { ...good, id: 0 }, { ...good, id: 1.5 }, { ...good, id: -3 }]));

      expect(await new PromptItemCollection().all()).toHaveLength(1);
    });
  });

  describe('the migration record', () => {
    it('knows which migrations have run', async () => {
      const migrations = new SystemMigrationCollection();
      await migrations.insert(SystemMigration.draft('20260101000000_first', '0.34.0', NOW, 12, 'moved 3 prompts'));
      await migrations.insert(SystemMigration.draft('20260101000100_second', '0.34.0', NOW, 4, 'registered 2 projects'));

      expect(await migrations.hasRun('20260101000000_first')).toBe(true);
      expect(await migrations.hasRun('another')).toBe(false);
      expect([...(await migrations.names())].sort()).toEqual(['20260101000000_first', '20260101000100_second']);
    });

    it('keeps what a migration did, for a person to read', async () => {
      const migrations = new SystemMigrationCollection();
      await migrations.insert(SystemMigration.draft('20260101000000_first', '0.34.0', NOW, 12, 'moved 3 prompts'));

      expect(readRows('system', 'system_migrations')[0]).toMatchObject({
        name: '20260101000000_first',
        appVersion: '0.34.0',
        ranAt: NOW,
        elapsedMs: 12,
        summary: 'moved 3 prompts',
        projectId: null,
      });
    });
  });
});
