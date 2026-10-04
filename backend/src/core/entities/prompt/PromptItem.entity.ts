import { AbstractEntity } from '../AbstractEntity';
import { Column, RawRow } from '../Column';

/**
 * One saved prompt (`prompt_items`).
 *
 * A row with a `projectId` is a project prompt and shows only in that project; a
 * row with none is shared by every project. Which categories it sits in, and where in
 * each, is not stored here but in the links (`prompt_category_item_links`).
 */
export class PromptItem extends AbstractEntity {
  static readonly COLUMNS = AbstractEntity.columnsWith(
    new Column('uuid', 'string'),
    new Column('name', 'string'),
    new Column('content', 'string'),
    new Column('priority', 'int'),
    new Column('createdAt', 'number'),
    new Column('updatedAt', 'number'),
  );

  constructor(
    id: number,
    projectId: number | null,
    /**
     * Identity that survives leaving this machine. The numeric `id` means nothing
     * on another computer, so exported files name a prompt by this instead. A
     * prompt moved from the old store keeps its old id here.
     */
    public uuid: string,
    public name: string,
    public content: string,
    /** Place in the library's own order. Smaller is higher; 1 is the top. */
    public priority: number,
    /** Creation time in epoch milliseconds. */
    public createdAt: number,
    /** Last edit time in epoch milliseconds. Equals `createdAt` until the first edit. */
    public updatedAt: number,
  ) {
    super(id, projectId);
  }

  /** A prompt that has not been inserted yet, so it has no number. */
  static draft(
    projectId: number | null,
    uuid: string,
    name: string,
    content: string,
    priority: number,
    createdAt: number,
    updatedAt: number,
  ): PromptItem {
    return new PromptItem(0, projectId, uuid, name, content, priority, createdAt, updatedAt);
  }

  static fromRow(row: RawRow): PromptItem {
    return new PromptItem(
      row.int('id'),
      row.nullableInt('projectId'),
      row.string('uuid'),
      row.string('name'),
      row.string('content'),
      row.int('priority'),
      row.number('createdAt'),
      row.number('updatedAt'),
    );
  }

  get columns(): readonly Column[] {
    return PromptItem.COLUMNS;
  }

  toJSON() {
    return {
      id: this.id,
      projectId: this.projectId,
      uuid: this.uuid,
      name: this.name,
      content: this.content,
      priority: this.priority,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
