import { AbstractEntity } from '../AbstractEntity';
import { Column, RawRow } from '../Column';

/**
 * What the program keeps about one table, apart from the table's rows
 * (`table_metadatas`).
 *
 * It is the counter behind the table's ids and the record of what shape its file
 * is in. Ids are never reused: "the highest id plus one" would give a deleted
 * row's id to the next row created, and anything still pointing at the deleted row
 * (a link in another project's rows, say) would then silently point at a stranger.
 * So the highest id ever handed out is kept here, apart from the rows themselves.
 *
 * `lastId` is the one value that must be right. `rowCount` and `lineCount` are
 * hints kept for speed, put right whenever the whole file is read.
 */
export class TableMetadata extends AbstractEntity {
  static readonly COLUMNS = AbstractEntity['columnsWith'](
    new Column('tableName', 'string'),
    new Column('domain', 'string'),
    new Column('lastId', 'int'),
    new Column('rowCount', 'int'),
    new Column('lineCount', 'int'),
    new Column('schemaVersion', 'int'),
    new Column('createdAt', 'number'),
    new Column('updatedAt', 'number'),
  );

  constructor(
    id: number,
    projectId: number | null,
    /** The table described, e.g. `prompt_items`. */
    public tableName: string,
    /** The folder the table's file sits in, e.g. `prompt`. */
    public domain: string,
    /** The last id handed out for that table. Never goes down. */
    public lastId: number,
    /** Rows that are alive in the table's file. A hint. */
    public rowCount: number,
    /** Lines in the table's file, including ones a later line has replaced. A hint. */
    public lineCount: number,
    /** The version of the column layout the table's file was written in. */
    public schemaVersion: number,
    /** When the table was first numbered, in epoch milliseconds. */
    public createdAt: number,
    /** When this record last changed, in epoch milliseconds. */
    public updatedAt: number,
  ) {
    super(id, projectId);
  }

  static fromRow(row: RawRow): TableMetadata {
    return new TableMetadata(
      row.int('id'),
      row.nullableInt('projectId'),
      row.string('tableName'),
      row.string('domain'),
      row.int('lastId'),
      row.int('rowCount'),
      row.int('lineCount'),
      row.int('schemaVersion'),
      row.number('createdAt'),
      row.number('updatedAt'),
    );
  }

  get columns(): readonly Column[] {
    return TableMetadata.COLUMNS;
  }

  toJSON() {
    return {
      id: this.id,
      projectId: this.projectId,
      tableName: this.tableName,
      domain: this.domain,
      lastId: this.lastId,
      rowCount: this.rowCount,
      lineCount: this.lineCount,
      schemaVersion: this.schemaVersion,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
