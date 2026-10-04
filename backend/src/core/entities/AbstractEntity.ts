import { BASE_COLUMNS, Column } from './Column';

/**
 * One row of one table, as a program object.
 *
 * The file holds the row as JSON; the program works with it as an instance of a
 * class named after the table (`prompt_items` is `PromptItem`). Nothing in the
 * app holds a row as a plain object: the collection turns JSON into instances on
 * the way in and instances into JSON on the way out, and everything between works
 * with the classes. What is shared by every table lives here, and each concrete
 * entity adds only its own columns, so a table that needs something new does not
 * touch the others.
 *
 * An instance stands for ONE row. Anything that acts on many rows at once belongs
 * to the matching collection class instead.
 */
export abstract class AbstractEntity {
  /** Whole number from 1, handed out by the sequence and never reused. 0 until the row is inserted. */
  id: number;
  /**
   * The number of the project (a row of `projects`) this row belongs to, or null
   * for a row that belongs to no project and is shared by all of them. A row of
   * `projects` itself is always null here.
   *
   * A number and not the directory: the directory is the project's own business
   * and can be corrected in one place, while every row that points at the project
   * keeps pointing at it. Outside the entity files a project is still named by its
   * path, and turning one into the other is `ProjectCollection`'s job.
   */
  projectId: number | null;

  protected constructor(id: number, projectId: number | null) {
    this.id = id;
    this.projectId = projectId;
  }

  /** The columns of this entity's table, in the order they are written. */
  abstract get columns(): readonly Column[];

  /** The base columns followed by [own]. What a concrete entity's `columns` answers. */
  protected static columnsWith(...own: Column[]): readonly Column[] {
    return [...BASE_COLUMNS, ...own];
  }

  /** True for a row shared by every project. */
  get isGlobal(): boolean {
    return this.projectId === null;
  }

  /** True once the collection has numbered this row. */
  get isInserted(): boolean {
    return this.id > 0;
  }

  /** Whether this row belongs to the project numbered [projectId], or to none when it is null. */
  belongsTo(projectId: number | null): boolean {
    return this.projectId === projectId;
  }

  /** Give a row that has none its number. Refuses to renumber a row. */
  assignId(id: number): void {
    if (this.isInserted) throw new Error(`row ${this.id} already has its number`);
    this.id = id;
  }

  /**
   * This row as it is written to its file: the one place an entity becomes a plain
   * object, on the way out. `JSON.stringify(entity)` calls it.
   */
  abstract toJSON(): Record<string, string | number | null>;
}
