import { Migration, MigrationContext, MigrationReport } from './Migration';

/**
 * What an import wrote, as counts for the sentence in the record.
 */
export class ImportCounts {
  constructor(
    /** What the old store held and was written to the new one, by kind: `{ prompts: 11 }`. */
    readonly written: ReadonlyMap<string, number>,
    /** Old rows that could not be read, or pointed at nothing. */
    readonly skipped: number = 0,
    /** Directories whose old files could not be read for lack of permission. */
    readonly unreadable: string[] = [],
  ) {}

  summary(): string {
    const parts = [...this.written].map(([kind, count]) => `${count} ${kind}`);
    const moved = parts.length > 0 ? `moved ${parts.join(', ')}` : 'nothing to move';
    return this.skipped > 0 ? `${moved}; skipped ${this.skipped} unreadable rows` : moved;
  }
}

/**
 * A migration that moves data out of a file an older version kept into entities.
 *
 * Every such move goes through the same four steps, and the steps are what make it
 * safe to run at any time and more than once:
 *
 * 1. READ the old store. It is only read: never written, renamed or deleted, so it
 *    stays as the backup and an older version finds it exactly as it was.
 * 2. WRITE the rows into the entities, each only if no row stands for it already,
 *    so a run that is cut off and started again adds what is missing and nothing
 *    twice.
 * 3. VERIFY by reading the rows back and counting them against what was meant to
 *    be written. A mismatch throws, and the migration is not recorded.
 * 4. The runner records the migration, after all of the above.
 *
 * A store that is not there is not an error: there was nothing to move.
 */
export abstract class LegacyImport<S> extends Migration {
  /** Read the old store, or answer null when there is none. */
  protected abstract read(context: MigrationContext): Promise<S | null>;

  /** Write what was read into the entities, adding only what is not there yet. */
  protected abstract write(context: MigrationContext, source: S): Promise<ImportCounts>;

  /** Read the entities back and compare them with [source]. Throw when something is missing. */
  protected abstract verify(context: MigrationContext, source: S, written: ImportCounts): Promise<void>;

  async up(context: MigrationContext): Promise<MigrationReport> {
    const source = await this.read(context);
    if (source === null) return new MigrationReport('no old data to move');

    const written = await this.write(context, source);
    await this.verify(context, source, written);
    return new MigrationReport(written.summary(), written.unreadable);
  }
}
