import { AbstractEntityCollection, EntityChange } from '../AbstractEntityCollection';
import { RawRow } from '../Column';
import { TableCounts, TableIdentity, TableLook, TableMetadataSource } from '../TableMetadataSource';
import { TableMetadata } from './TableMetadata.entity';

/**
 * Every table's record, and the one place ids come from.
 *
 * It is a collection like any other, so its own rows are numbered too. It does not
 * number them from a record of its own, which would need a record for the record:
 * it never deletes a row, so its own ids are simply one more than the highest.
 */
export class TableMetadataCollection
  extends AbstractEntityCollection<TableMetadata>
  implements TableMetadataSource
{
  readonly domain = 'system';
  readonly table = 'table_metadatas';
  protected readonly columns = TableMetadata.COLUMNS;
  protected readonly schemaVersion = 1;

  constructor() {
    super(null);
  }

  protected hydrate(row: RawRow): TableMetadata {
    return TableMetadata.fromRow(row);
  }

  async allocate(identity: TableIdentity, count: number, firstLook: () => Promise<TableLook>): Promise<number> {
    // The table's file is looked at before the lock is taken, and only the first
    // time: a second process doing the same meanwhile is settled inside the write.
    const known = await this.recordOf(identity.table);
    const look = known === null ? await firstLook() : null;

    return this.mutate((records) => {
      const now = Date.now();
      const existing = records.find((record) => record.tableName === identity.table);
      if (existing) {
        existing.lastId = Math.max(existing.lastId, look?.highestId ?? 0) + count;
        existing.updatedAt = now;
        return EntityChange.write(records, existing.lastId);
      }

      const id = records.reduce((highest, record) => Math.max(highest, record.id), 0) + 1;
      const lastId = (look?.highestId ?? 0) + count;
      const created = new TableMetadata(
        id,
        null,
        identity.table,
        identity.domain,
        lastId,
        look?.counts.rowCount ?? 0,
        look?.counts.lineCount ?? 0,
        identity.schemaVersion,
        now,
        now,
      );
      return EntityChange.write([...records, created], lastId);
    });
  }

  async schemaVersionOf(table: string): Promise<number | null> {
    return (await this.recordOf(table))?.schemaVersion ?? null;
  }

  async countsOf(table: string): Promise<TableCounts | null> {
    const record = await this.recordOf(table);
    return record === null ? null : new TableCounts(record.rowCount, record.lineCount);
  }

  async adjustCounts(table: string, rows: number, lines: number): Promise<void> {
    await this.mutate((records) => {
      const existing = records.find((record) => record.tableName === table);
      if (!existing) return EntityChange.keep(records, undefined);
      existing.rowCount = Math.max(0, existing.rowCount + rows);
      existing.lineCount = Math.max(0, existing.lineCount + lines);
      existing.updatedAt = Date.now();
      return EntityChange.write(records, undefined);
    });
  }

  async settle(table: string, counts: TableCounts, maxId: number): Promise<void> {
    await this.mutate((records) => {
      const existing = records.find((record) => record.tableName === table);
      if (!existing) return EntityChange.keep(records, undefined);
      const differs =
        existing.rowCount !== counts.rowCount || existing.lineCount !== counts.lineCount || existing.lastId < maxId;
      if (!differs) return EntityChange.keep(records, undefined);
      existing.rowCount = counts.rowCount;
      existing.lineCount = counts.lineCount;
      existing.lastId = Math.max(existing.lastId, maxId);
      existing.updatedAt = Date.now();
      return EntityChange.write(records, undefined);
    });
  }

  /** The record of one table, or null if it has none. */
  private async recordOf(table: string): Promise<TableMetadata | null> {
    return (await this.all()).find((record) => record.tableName === table) ?? null;
  }
}
