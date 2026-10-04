import { AbstractEntity } from '../AbstractEntity';
import { Column, RawRow } from '../Column';

/**
 * The record that a migration has run (`system_migrations`).
 *
 * Written LAST, after everything the migration did. A run that is interrupted
 * leaves no record and so is run again, and one that finished is never run a
 * second time, which is what stops rows the user has since deleted from coming
 * back. `name` is the migration's file name without its extension, and the set of
 * names here is what decides which migrations are still to run.
 */
export class SystemMigration extends AbstractEntity {
  static readonly COLUMNS = AbstractEntity['columnsWith'](
    new Column('name', 'string'),
    new Column('appVersion', 'string'),
    new Column('ranAt', 'number'),
    new Column('elapsedMs', 'int'),
    new Column('summary', 'string'),
  );

  constructor(
    id: number,
    projectId: number | null,
    /** The migration's file name without its extension, e.g. `20261004120000_create-projects`. */
    public name: string,
    /** The version of the program that ran it. */
    public appVersion: string,
    /** When it finished, in epoch milliseconds. */
    public ranAt: number,
    /** How long it took, in milliseconds. */
    public elapsedMs: number,
    /** What it did, in a sentence for a person: counts of rows moved, rows skipped. */
    public summary: string,
  ) {
    super(id, projectId);
  }

  /** A record that has not been inserted yet, so it has no number. */
  static draft(name: string, appVersion: string, ranAt: number, elapsedMs: number, summary: string): SystemMigration {
    return new SystemMigration(0, null, name, appVersion, ranAt, elapsedMs, summary);
  }

  static fromRow(row: RawRow): SystemMigration {
    return new SystemMigration(
      row.int('id'),
      row.nullableInt('projectId'),
      row.string('name'),
      row.string('appVersion'),
      row.number('ranAt'),
      row.int('elapsedMs'),
      row.string('summary'),
    );
  }

  get columns(): readonly Column[] {
    return SystemMigration.COLUMNS;
  }

  toJSON() {
    return {
      id: this.id,
      projectId: this.projectId,
      name: this.name,
      appVersion: this.appVersion,
      ranAt: this.ranAt,
      elapsedMs: this.elapsedMs,
      summary: this.summary,
    };
  }
}
