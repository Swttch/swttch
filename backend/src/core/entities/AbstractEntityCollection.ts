import { join } from 'path';
import { AbstractEntity } from './AbstractEntity';
import { Column, RawRow } from './Column';
import { entitiesRoot } from './entityPaths';
import { MigrationGate } from './migration/MigrationGate';
import { JsonlEdit, JsonlFile, JsonlFileUnreadableError, JsonlSnapshot } from './storage/JsonlFile';
import { TableCounts, TableIdentity, TableLook, TableMetadataSource } from './TableMetadataSource';

/**
 * An entity file exists but cannot be read.
 *
 * Reading refuses rather than answering "empty": an empty list would look like
 * every row was lost, and the next write would then replace the file with it.
 */
export class EntityFileUnreadableError extends Error {
  constructor(
    readonly filePath: string,
    readonly reason: string,
  ) {
    super(`entity file ${filePath} could not be read (${reason})`);
    this.name = 'EntityFileUnreadableError';
  }
}

/**
 * A table's file was written by a newer version of the program than this one.
 *
 * Writing refuses: this version does not know what the newer layout means, and
 * adding a row in the layout it knows would leave the file half in one and half
 * in the other.
 */
export class EntitySchemaTooNewError extends Error {
  constructor(
    readonly table: string,
    readonly fileVersion: number,
    readonly codeVersion: number,
  ) {
    super(
      `table ${table} is at layout version ${fileVersion}, newer than the ${codeVersion} this version of the program writes`,
    );
    this.name = 'EntitySchemaTooNewError';
  }
}

/**
 * What a change to the rows of a table decides: which rows the table keeps and a
 * value to hand back to the caller.
 *
 * {@link EntityChange.keep} says nothing needs writing. {@link EntityChange.write}
 * says the file must be rewritten with the given rows, which are the entities the
 * change was given, edited in place or with some added or left out.
 */
export class EntityChange<E extends AbstractEntity, T> {
  private constructor(
    readonly entities: E[],
    readonly result: T,
    readonly needsWrite: boolean,
  ) {}

  static keep<E extends AbstractEntity, T>(entities: E[], result: T): EntityChange<E, T> {
    return new EntityChange(entities, result, false);
  }

  static write<E extends AbstractEntity, T>(entities: E[], result: T): EntityChange<E, T> {
    return new EntityChange(entities, result, true);
  }
}

/** One window onto the rows of a table, and how many rows the whole of it holds. */
export class EntityPage<E extends AbstractEntity> {
  constructor(
    readonly entities: E[],
    /** Rows that matched, in all of the table, not only in this window. */
    readonly total: number,
    readonly offset: number,
    readonly limit: number,
  ) {}

  /** Whether rows follow this window. */
  get hasMore(): boolean {
    return this.offset + this.entities.length < this.total;
  }
}

/** The rows a file holds once its lines are read, and what was not a row. */
class TableRows<E extends AbstractEntity> {
  constructor(
    readonly entities: E[],
    /** JSON values that are not rows of this table, kept as they were. */
    readonly rejected: unknown[],
  ) {}
}

/**
 * All the rows of one table: its file, and everything that acts on many rows.
 *
 * One collection class per entity class (`PromptItem` and `PromptItemCollection`),
 * and one file per collection, found by the table's domain and name. An instance
 * of the entity class is one row; this is the set, which is why reading all rows,
 * finding by id and inserting a row are here and not on the entity.
 *
 * The file is one line of JSON per row (see {@link JsonlFile}). Which line stands
 * for a row is decided here:
 *
 * - Two lines with the same `id` are two versions of one row, and the LATER one
 *   is the row.
 * - A line `{"id":N,"deleted":true}` removes row N.
 * - Rows come back in the order their `id` first appeared.
 *
 * Adding a row is appending a line. Changing or deleting one rewrites the file,
 * which also drops the lines a later line had replaced.
 *
 * Nothing is cached. Several backends can share the file, so each call reads it
 * afresh and each change is one read-modify-write on the atomic path.
 *
 * The JSON of the file is turned into entities on the way in and entities into
 * JSON on the way out, and never shows up in between.
 */
export abstract class AbstractEntityCollection<E extends AbstractEntity> {
  /** Folder under the entities root, singular snake_case: `prompt`. */
  abstract readonly domain: string;
  /**
   * Table name, plural snake_case: `prompt_items`.
   *
   * A domain prefix is optional and not the default. It is put on a name that is
   * likely to turn up in other domains too (`items`, `categories`), to keep the
   * tables of one domain together. Tables that run the machinery itself sit in the
   * `system` domain.
   */
  abstract readonly table: string;
  /** What a row of this table must look like. */
  protected abstract readonly columns: readonly Column[];
  /**
   * The version of the column layout this class writes, starting at 1. Raised by
   * the change that alters the columns; a file at a higher version is not written.
   */
  protected abstract readonly schemaVersion: number;
  /** Build the entity for one row that has passed the column check. */
  protected abstract hydrate(row: RawRow): E;

  protected constructor(private readonly metadata: TableMetadataSource | null) {}

  /** `~/.claude-code-gui/entities/<domain>/<table>.entity.jsonl`. */
  get filePath(): string {
    return join(entitiesRoot(), this.domain, `${this.table}.entity.jsonl`);
  }

  private get file(): JsonlFile {
    return new JsonlFile(this.filePath);
  }

  /** Every row, as entities. Throws {@link EntityFileUnreadableError} if the file is unreadable. */
  async all(): Promise<E[]> {
    await MigrationGate.ready();
    const snapshot = await this.readSnapshot();
    const rows = this.split(snapshot.values);
    await this.settleCounts(snapshot, rows.entities.length);
    return rows.entities;
  }

  async find(id: number): Promise<E | null> {
    return (await this.all()).find((candidate) => candidate.id === id) ?? null;
  }

  async where(predicate: (entity: E) => boolean): Promise<E[]> {
    return (await this.all()).filter(predicate);
  }

  /**
   * One window of the rows (those [predicate] accepts, if one is given), starting
   * at [offset] and at most [limit] long, with the number of rows that matched.
   *
   * Callers of a table that can grow ask for a window and not for all of it, so the
   * day the file stops being cheap to read in full they do not have to change.
   */
  async page(offset: number, limit: number, predicate?: (entity: E) => boolean): Promise<EntityPage<E>> {
    const rows = predicate === undefined ? await this.all() : await this.where(predicate);
    return new EntityPage(rows.slice(offset, offset + limit), rows.length, offset, limit);
  }

  /**
   * How many rows there are, or how many [predicate] accepts.
   *
   * Without a predicate the answer is the count the table's record holds, which is
   * kept up to date by every write and put right whenever the whole file is read.
   * It can be off for a moment when another process is writing, and is read from
   * the file when the table has no record yet.
   */
  async count(predicate?: (entity: E) => boolean): Promise<number> {
    await MigrationGate.ready();
    if (predicate !== undefined) return (await this.where(predicate)).length;
    const recorded = await this.metadata?.countsOf(this.table);
    if (recorded) return recorded.rowCount;
    return (await this.all()).length;
  }

  /**
   * Add a row, giving it the next id.
   *
   * The number comes from the table's record BEFORE the row is written, so a
   * failure between the two costs a number that is never used, never a number used
   * twice. The write is one line at the end of the file, whatever the table's size.
   */
  async insert(entity: E): Promise<E> {
    await MigrationGate.ready();
    this.prepareForWrite(entity);
    await this.assertWritable();
    entity.assignId((await this.allocateIds(1))[0] as number);
    await this.translate(() => this.file.append([entity]));
    await this.metadata?.adjustCounts(this.table, 1, 1);
    return entity;
  }

  /**
   * Add every candidate that no stored row stands for, in one write, answering the
   * rows that were added.
   *
   * [isSame] says whether a stored row already stands for a candidate. The check
   * runs INSIDE the write, so several processes moving the same data at once add
   * each row once. The numbers are taken before the write, so a candidate that
   * turns out to be there already costs a number that is never used.
   */
  async insertMissing(
    candidates: E[],
    isSame: (stored: E, candidate: E) => boolean,
  ): Promise<E[]> {
    if (candidates.length === 0) return [];
    await MigrationGate.ready();
    for (const candidate of candidates) this.prepareForWrite(candidate);
    await this.assertWritable();
    const ids = await this.allocateIds(candidates.length);
    candidates.forEach((candidate, index) => candidate.assignId(ids[index] as number));

    const added = await this.translate(() =>
      this.file.update((snapshot) => {
        const stored = [...this.split(snapshot.values).entities];
        const missing: E[] = [];
        for (const candidate of candidates) {
          if (stored.some((row) => isSame(row, candidate))) continue;
          stored.push(candidate);
          missing.push(candidate);
        }
        return missing.length === 0 ? JsonlEdit.keep(missing) : JsonlEdit.append(missing, missing);
      }),
    );
    if (added.length > 0) await this.metadata?.adjustCounts(this.table, added.length, added.length);
    return added;
  }

  /**
   * Store the new state of an entity that was read from this table, answering
   * whether there was such a row. The row is found by its `id`.
   */
  async save(entity: E): Promise<boolean> {
    this.prepareForWrite(entity);
    return this.mutate((entities) => {
      const index = entities.findIndex((row) => row.id === entity.id);
      if (index === -1) return EntityChange.keep(entities, false);
      return EntityChange.write(
        entities.map((row, i) => (i === index ? entity : row)),
        true,
      );
    });
  }

  /** Remove one row, answering whether there was one. */
  async delete(id: number): Promise<boolean> {
    return this.mutate((entities) => {
      const kept = entities.filter((row) => row.id !== id);
      return kept.length === entities.length
        ? EntityChange.keep(entities, false)
        : EntityChange.write(kept, true);
    });
  }

  /**
   * Change the table's rows in one atomic read-modify-write, answering whatever
   * [change] says to answer.
   *
   * The lower level that `save` and `delete` are written on, and what a change that
   * touches many rows at once (moving a row to the top and pushing the rest down)
   * is written on too. [change] gets the entities and may edit them in place; it
   * must answer {@link EntityChange.write} for the edit to be stored.
   *
   * Writing replaces the file, so lines that are not rows of this table are put
   * back as they were: reading must not quietly edit a store, and a hand edit or a
   * row from a newer version has to survive our next save.
   */
  async mutate<T>(change: (entities: E[]) => EntityChange<E, T>): Promise<T> {
    await MigrationGate.ready();
    await this.assertWritable();
    const outcome = await this.translate(() =>
      this.file.update((snapshot) => {
        const rows = this.split(snapshot.values);
        const changed = change(rows.entities);
        if (!changed.needsWrite) return JsonlEdit.keep(new MutateOutcome<T>(changed.result, null));

        const lines = [
          ...changed.entities.map((entity) => JSON.stringify(entity)),
          ...rows.rejected.map((value) => JSON.stringify(value)),
          ...snapshot.unparseable,
        ];
        const counts = new TableCounts(changed.entities.length, lines.length);
        return JsonlEdit.rewrite(lines, new MutateOutcome(changed.result, new WrittenState(counts, changed.entities)));
      }),
    );
    if (outcome.written !== null) {
      const maxId = outcome.written.entities.reduce((highest, row) => Math.max(highest, row.id), 0);
      await this.metadata?.settle(this.table, outcome.written.counts, maxId);
    }
    return outcome.result;
  }

  /** A block of [count] ids for this table, lowest first. */
  protected async allocateIds(count: number): Promise<number[]> {
    if (this.metadata === null) {
      throw new Error(`table ${this.table} has no record to take an id from`);
    }
    const identity = new TableIdentity(this.table, this.domain, this.schemaVersion);
    const last = await this.metadata.allocate(identity, count, async () => {
      const snapshot = await this.readSnapshot();
      const counts = new TableCounts(this.split(snapshot.values).entities.length, snapshot.lineCount);
      return new TableLook(highestIdIn(snapshot), counts);
    });
    return Array.from({ length: count }, (_, index) => last - count + 1 + index);
  }

  /**
   * Called on an entity before it is written to this table. It may settle values
   * the entity holds (the spelling of a path, say) and throws if the entity must
   * not be written at all. The default does nothing.
   */
  protected prepareForWrite(_entity: E): void {}

  /** Refuse to write a table whose file is in a layout newer than this class knows. */
  private async assertWritable(): Promise<void> {
    if (this.metadata === null) return;
    const stored = await this.metadata.schemaVersionOf(this.table);
    if (stored !== null && stored > this.schemaVersion) {
      throw new EntitySchemaTooNewError(this.table, stored, this.schemaVersion);
    }
  }

  /**
   * Put the record's counts and last number right after the whole file was read.
   * The record is a hint kept for speed and never the truth, so a failure to update
   * it is logged and does not fail the read.
   */
  private async settleCounts(snapshot: JsonlSnapshot, rowCount: number): Promise<void> {
    if (this.metadata === null) return;
    try {
      await this.metadata.settle(this.table, new TableCounts(rowCount, snapshot.lineCount), highestIdIn(snapshot));
    } catch (err) {
      console.error('[node-backend]', `could not update the counts of ${this.table}:`, err);
    }
  }

  private async readSnapshot(): Promise<JsonlSnapshot> {
    return this.translate(() => this.file.read());
  }

  /** The IO boundary's error, in this layer's words. */
  private async translate<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (err) {
      if (err instanceof JsonlFileUnreadableError) {
        throw new EntityFileUnreadableError(err.filePath, err.reason);
      }
      throw err;
    }
  }

  /**
   * The IO boundary: raw JSON values in, entities out. Which value is the row of an
   * id, and which ids are deleted, is settled here; what is not a row of this table
   * is kept aside as it was.
   */
  private split(raw: unknown[]): TableRows<E> {
    const latest = new Map<number, unknown>();
    const rejected: unknown[] = [];
    for (const value of raw) {
      const id = idOf(value);
      if (id === null) {
        rejected.push(value);
        continue;
      }
      if (isDeletion(value)) latest.delete(id);
      else latest.set(id, value);
    }

    const entities: E[] = [];
    for (const value of latest.values()) {
      const row = RawRow.parse(value, this.columns);
      if (row === null) rejected.push(value);
      else entities.push(this.hydrate(row));
    }
    return new TableRows(entities, rejected);
  }
}

/** The answer of a read-modify-write and, when it wrote, what it wrote. */
class MutateOutcome<T> {
  constructor(
    readonly result: T,
    readonly written: WrittenState<AbstractEntity> | null,
  ) {}
}

/** The rows a rewrite left in the file, and their counts. */
class WrittenState<E extends AbstractEntity> {
  constructor(
    readonly counts: TableCounts,
    readonly entities: E[],
  ) {}
}

/** The whole number a line's `id` holds, or null when the line has none. */
function idOf(value: unknown): number | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = (value as Record<string, unknown>).id;
  return typeof id === 'number' && Number.isInteger(id) && id >= 1 ? id : null;
}

/** Whether a line says its row is deleted, instead of being the row. */
function isDeletion(value: unknown): boolean {
  return (value as Record<string, unknown>).deleted === true;
}

/**
 * The highest `id` any line of the file mentions, rows replaced or deleted
 * included: a number that was ever used must never be handed out again.
 */
function highestIdIn(snapshot: JsonlSnapshot): number {
  return snapshot.values.reduce<number>((highest, value) => Math.max(highest, idOf(value) ?? 0), 0);
}
