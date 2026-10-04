import { AbstractEntity } from '../AbstractEntity';
import { Column, RawRow } from '../Column';

/**
 * One category (`prompt_categories`).
 *
 * Categories belong to no project: one set is shared by the shared prompts and by
 * every project's, so `projectId` is always null here.
 */
export class PromptCategory extends AbstractEntity {
  static readonly COLUMNS = AbstractEntity['columnsWith'](
    new Column('uuid', 'string'),
    new Column('name', 'string'),
    new Column('priority', 'int'),
    new Column('createdAt', 'number'),
  );

  constructor(
    id: number,
    projectId: number | null,
    /** Identity that survives leaving this machine; see {@link PromptItem.uuid}. */
    public uuid: string,
    public name: string,
    /** Place in the category column. Smaller is higher; 1 is the top. */
    public priority: number,
    /** Creation time in epoch milliseconds. */
    public createdAt: number,
  ) {
    super(id, projectId);
  }

  /** A category that has not been inserted yet, so it has no number. */
  static draft(uuid: string, name: string, priority: number, createdAt: number): PromptCategory {
    return new PromptCategory(0, null, uuid, name, priority, createdAt);
  }

  static fromRow(row: RawRow): PromptCategory {
    return new PromptCategory(
      row.int('id'),
      row.nullableInt('projectId'),
      row.string('uuid'),
      row.string('name'),
      row.int('priority'),
      row.number('createdAt'),
    );
  }

  get columns(): readonly Column[] {
    return PromptCategory.COLUMNS;
  }

  toJSON() {
    return {
      id: this.id,
      projectId: this.projectId,
      uuid: this.uuid,
      name: this.name,
      priority: this.priority,
      createdAt: this.createdAt,
    };
  }
}
