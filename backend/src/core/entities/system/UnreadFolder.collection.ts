import { AbstractEntityCollection, EntityChange } from '../AbstractEntityCollection';
import { RawRow } from '../Column';
import { defaultTableMetadata } from '../defaultTableMetadata';
import { UnreadFolder } from './UnreadFolder.entity';

export class UnreadFolderCollection extends AbstractEntityCollection<UnreadFolder> {
  readonly domain = 'system';
  readonly table = 'unread_folders';
  protected readonly columns = UnreadFolder.COLUMNS;
  protected readonly schemaVersion = 1;

  constructor() {
    super(defaultTableMetadata());
  }

  protected hydrate(row: RawRow): UnreadFolder {
    return UnreadFolder.fromRow(row);
  }

  /**
   * Remember that [migration] could not read each of [paths]. A folder already
   * remembered for that migration is left as it is, so the first sighting stays.
   */
  async remember(migration: string, paths: string[], seenAt: number): Promise<void> {
    await this.insertMissing(
      [...new Set(paths)].map((path) => UnreadFolder.draft(migration, path, seenAt)),
      (stored, candidate) => stored.migration === candidate.migration && stored.path === candidate.path,
    );
  }

  /** Forget the rows of [migration] for [paths]: the folders were read. */
  async forget(migration: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const gone = new Set(paths);
    await this.mutate((rows) => {
      const kept = rows.filter((row) => !(row.migration === migration && gone.has(row.path)));
      return kept.length === rows.length ? EntityChange.keep(rows, undefined) : EntityChange.write(kept, undefined);
    });
  }
}
