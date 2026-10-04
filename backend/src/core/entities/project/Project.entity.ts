import { AbstractEntity } from '../AbstractEntity';
import { Column, RawRow } from '../Column';

/**
 * One working directory the program knows about (`projects`).
 *
 * The rows of every project-scoped table point here by `id`, so the directory is
 * written down once. A row of this table belongs to no project, which is why its
 * own `projectId` is always null.
 *
 * `sessionCount`, `lastModified` and `createdAt` describe the conversations the
 * CLI has recorded in the directory. A directory with none has a count of 0 and
 * both times at the moment it was first seen. `favoritedAt`, `alias` and
 * `description` are what the user decided about the project; they never reach the
 * real folder or the CLI's records.
 */
export class Project extends AbstractEntity {
  static readonly COLUMNS = AbstractEntity['columnsWith'](
    new Column('path', 'string'),
    new Column('sessionCount', 'int'),
    new Column('lastModified', 'number'),
    new Column('createdAt', 'number'),
    new Column('favoritedAt', 'number'),
    new Column('alias', 'nullable-string'),
    new Column('description', 'nullable-string'),
    new Column('hiddenAt', 'number'),
  );

  constructor(
    id: number,
    projectId: number | null,
    /** The directory, in the one spelling `normalizeCwd` settles. */
    public path: string,
    /** Sessions the CLI has recorded here. */
    public sessionCount: number,
    /** The newest session's last write, in epoch milliseconds. */
    public lastModified: number,
    /** The oldest session's creation, in epoch milliseconds. */
    public createdAt: number,
    /** When the user pinned the project, in epoch milliseconds; 0 when it is not pinned. */
    public favoritedAt: number,
    /** The name the user gave the project to be shown instead of the folder's. */
    public alias: string | null,
    /** The note the user wrote about the project. */
    public description: string | null,
    /**
     * When the user removed the project from the list, in epoch milliseconds; 0
     * when it is listed. The row stays, because the prompts and other rows of the
     * project point at it; the project is listed again as soon as a session newer
     * than this appears.
     */
    public hiddenAt: number,
  ) {
    super(id, projectId);
  }

  /** A project that has not been inserted yet, so it has no number, first seen at [seenAt]. */
  static draft(path: string, seenAt: number): Project {
    return new Project(0, null, path, 0, seenAt, seenAt, 0, null, null, 0);
  }

  static fromRow(row: RawRow): Project {
    return new Project(
      row.int('id'),
      row.nullableInt('projectId'),
      row.string('path'),
      row.int('sessionCount'),
      row.number('lastModified'),
      row.number('createdAt'),
      row.number('favoritedAt'),
      row.nullableString('alias'),
      row.nullableString('description'),
      row.number('hiddenAt'),
    );
  }

  /** Whether the user removed this project from the list. */
  get isHidden(): boolean {
    return this.hiddenAt > 0;
  }

  /** Whether the user pinned this project. */
  get isFavorite(): boolean {
    return this.favoritedAt > 0;
  }

  get columns(): readonly Column[] {
    return Project.COLUMNS;
  }

  toJSON() {
    return {
      id: this.id,
      projectId: this.projectId,
      path: this.path,
      sessionCount: this.sessionCount,
      lastModified: this.lastModified,
      createdAt: this.createdAt,
      favoritedAt: this.favoritedAt,
      alias: this.alias,
      description: this.description,
      hiddenAt: this.hiddenAt,
    };
  }
}
