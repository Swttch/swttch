import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { EntityChange, EntitySchemaTooNewError } from '../../AbstractEntityCollection';
import { PromptItem } from '../../prompt/PromptItem.entity';
import { PromptItemCollection } from '../../prompt/PromptItem.collection';
import { TableMetadataCollection } from '../TableMetadata.collection';

const NOW = 1_700_000_000_000;
const draft = (uuid: string) => PromptItem.draft(null, uuid, 'name', 'content', 1, NOW, NOW);

describe('table metadata', () => {
  let home: string;
  let previousHome: string | undefined;

  beforeEach(() => {
    previousHome = process.env.CCG_HOME;
    home = realpathSync(mkdtempSync(join(tmpdir(), 'table-metadata-')));
    process.env.CCG_HOME = home;
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = previousHome;
    rmSync(home, { recursive: true, force: true });
  });

  const itemsFile = () => join(home, 'entities', 'prompt', 'prompt_items.entity.jsonl');
  const recordOf = async (table: string) =>
    (await new TableMetadataCollection().all()).find((record) => record.tableName === table);

  describe('numbering', () => {
    it('gives a table its record the first time it numbers a row', async () => {
      expect(await recordOf('prompt_items')).toBeUndefined();

      await new PromptItemCollection().insert(draft('a'));

      const record = await recordOf('prompt_items');
      expect(record).toMatchObject({
        domain: 'prompt',
        lastId: 1,
        rowCount: 1,
        lineCount: 1,
        schemaVersion: 1,
        projectId: null,
      });
      expect(record?.createdAt).toBeGreaterThan(0);
    });

    it('numbers its own rows one above the highest, with no record of its own', async () => {
      await new PromptItemCollection().insert(draft('a'));
      const metadata = new TableMetadataCollection();

      expect((await metadata.all()).map((record) => record.id)).toEqual([1]);
      expect(await recordOf('table_metadatas')).toBeUndefined();
    });

    // This is the point of the record: a new row does not read the table it joins.
    // A row planted behind the program's back is therefore not seen by the next
    // insert; it is seen the next time the whole file is read.
    it('does not read the table once it has a record', async () => {
      const items = new PromptItemCollection();
      await items.insert(draft('a'));
      writeFileSync(
        itemsFile(),
        readFileSync(itemsFile(), 'utf-8') +
          JSON.stringify({ id: 99, projectId: null, uuid: 'x', name: 'n', content: 'c', priority: 1, createdAt: NOW, updatedAt: NOW }) +
          '\n',
        'utf-8',
      );

      const second = await items.insert(draft('b'));

      expect(second.id).toBe(2);
    });

    it('raises the last number to the highest one in the file when the whole file is read', async () => {
      const items = new PromptItemCollection();
      await items.insert(draft('a'));
      writeFileSync(
        itemsFile(),
        readFileSync(itemsFile(), 'utf-8') +
          JSON.stringify({ id: 99, projectId: null, uuid: 'x', name: 'n', content: 'c', priority: 1, createdAt: NOW, updatedAt: NOW }) +
          '\n',
        'utf-8',
      );

      await items.all();
      const next = await items.insert(draft('b'));

      expect(next.id).toBe(100);
    });

    it('takes the counts of a file that was filled before it had a record', async () => {
      const lines = [1, 2, 3].map((id) =>
        JSON.stringify({ id, projectId: null, uuid: `u${id}`, name: 'n', content: 'c', priority: id, createdAt: NOW, updatedAt: NOW }),
      );
      mkdirSync(join(home, 'entities', 'prompt'), { recursive: true });
      writeFileSync(itemsFile(), lines.join('\n') + '\n', 'utf-8');

      await new PromptItemCollection().insert(draft('new'));

      expect(await recordOf('prompt_items')).toMatchObject({ lastId: 4, rowCount: 4, lineCount: 4 });
    });
  });

  describe('the counts', () => {
    it('follow a delete, which rewrites the file without the row', async () => {
      const items = new PromptItemCollection();
      await items.insert(draft('a'));
      const second = await items.insert(draft('b'));

      await items.delete(second.id);

      expect(await recordOf('prompt_items')).toMatchObject({ rowCount: 1, lineCount: 1, lastId: 2 });
    });

    it('are put right when the whole file is read and they have drifted', async () => {
      const items = new PromptItemCollection();
      await items.insert(draft('a'));
      const metadata = new TableMetadataCollection();
      await metadata.adjustCounts('prompt_items', 40, 40); // as if another process had lost track

      await items.all();

      expect(await recordOf('prompt_items')).toMatchObject({ rowCount: 1, lineCount: 1 });
    });

    it('never go below zero', async () => {
      await new PromptItemCollection().insert(draft('a'));

      await new TableMetadataCollection().adjustCounts('prompt_items', -50, -50);

      expect(await recordOf('prompt_items')).toMatchObject({ rowCount: 0, lineCount: 0 });
    });

    it('are left alone for a table with no record', async () => {
      await new TableMetadataCollection().adjustCounts('nothing_here', 1, 1);

      expect(await new TableMetadataCollection().all()).toEqual([]);
    });
  });

  describe('the version of a table\'s layout', () => {
    const raiseVersion = async (to: number) => {
      const metadata = new TableMetadataCollection();
      await metadata.mutate((records) => {
        for (const record of records) record.schemaVersion = to;
        return EntityChange.write(records, undefined);
      });
    };

    it('is recorded as the one the running code writes', async () => {
      await new PromptItemCollection().insert(draft('a'));

      expect(await new TableMetadataCollection().schemaVersionOf('prompt_items')).toBe(1);
      expect(await new TableMetadataCollection().schemaVersionOf('unknown')).toBeNull();
    });

    it('stops a write to a table whose file is in a newer layout, and leaves the file as it was', async () => {
      const items = new PromptItemCollection();
      await items.insert(draft('a'));
      await raiseVersion(2);
      const before = readFileSync(itemsFile(), 'utf-8');

      await expect(items.insert(draft('b'))).rejects.toBeInstanceOf(EntitySchemaTooNewError);
      await expect(items.mutate((rows) => EntityChange.write(rows, 1))).rejects.toBeInstanceOf(
        EntitySchemaTooNewError,
      );

      expect(readFileSync(itemsFile(), 'utf-8')).toBe(before);
    });

    it('still reads a table whose file is in a newer layout', async () => {
      const items = new PromptItemCollection();
      await items.insert(draft('a'));
      await raiseVersion(2);

      expect((await items.all()).map((item) => item.uuid)).toEqual(['a']);
    });

    it('does not stop a write to a table at its own version or an older one', async () => {
      const items = new PromptItemCollection();
      await items.insert(draft('a'));
      await raiseVersion(1);

      await expect(items.insert(draft('b'))).resolves.toBeDefined();
    });
  });
});
