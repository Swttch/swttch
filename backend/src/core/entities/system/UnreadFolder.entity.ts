import { AbstractEntity } from '../AbstractEntity';
import { Column, RawRow } from '../Column';

/**
 * A folder whose old files a migration could not read (`unread_folders`).
 *
 * The migration is recorded as done all the same, so without this row nothing would
 * ever look at the folder again. The row is what lets the program read it again by
 * itself, when the user opens that project's prompts, when the window is active
 * again and when the backend starts, until the move succeeds and the row is deleted.
 */
export class UnreadFolder extends AbstractEntity {
  static readonly COLUMNS = AbstractEntity.columnsWith(
    new Column('migration', 'string'),
    new Column('path', 'string'),
    new Column('firstSeenAt', 'number'),
  );

  constructor(
    id: number,
    projectId: number | null,
    /** The migration that could not read it, as recorded in `system_migrations`. It is the one asked to read it again. */
    public migration: string,
    /** The folder, in the spelling the migration reported it. */
    public path: string,
    /** When it was first found unreadable, in epoch milliseconds. */
    public firstSeenAt: number,
  ) {
    super(id, projectId);
  }

  /** A row that has not been inserted yet, so it has no number. */
  static draft(migration: string, path: string, seenAt: number): UnreadFolder {
    return new UnreadFolder(0, null, migration, path, seenAt);
  }

  static fromRow(row: RawRow): UnreadFolder {
    return new UnreadFolder(
      row.int('id'),
      row.nullableInt('projectId'),
      row.string('migration'),
      row.string('path'),
      row.number('firstSeenAt'),
    );
  }

  get columns(): readonly Column[] {
    return UnreadFolder.COLUMNS;
  }

  toJSON() {
    return {
      id: this.id,
      projectId: this.projectId,
      migration: this.migration,
      path: this.path,
      firstSeenAt: this.firstSeenAt,
    };
  }
}
