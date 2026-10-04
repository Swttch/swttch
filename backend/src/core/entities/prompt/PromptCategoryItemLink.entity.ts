import { AbstractEntity } from '../AbstractEntity';
import { Column, RawRow } from '../Column';

/**
 * One item sitting in one category (`prompt_category_item_links`).
 *
 * The many-to-many join between categories and items, carrying the item's place
 * in that category. `projectId` is copied from the item when the link is made and
 * never changed on its own, so the links of one project can be found, and
 * removed with it, without opening the items.
 */
export class PromptCategoryItemLink extends AbstractEntity {
  static readonly COLUMNS = AbstractEntity['columnsWith'](
    new Column('categoryId', 'int'),
    new Column('itemId', 'int'),
    new Column('priority', 'int'),
  );

  constructor(
    id: number,
    projectId: number | null,
    public categoryId: number,
    public itemId: number,
    /**
     * Place of the item inside the category. Smaller is higher; 1 is the top. An
     * item can sit in several categories, each with a place of its own.
     */
    public priority: number,
  ) {
    super(id, projectId);
  }

  /** A link that has not been inserted yet, so it has no number. */
  static draft(
    projectId: number | null,
    categoryId: number,
    itemId: number,
    priority: number,
  ): PromptCategoryItemLink {
    return new PromptCategoryItemLink(0, projectId, categoryId, itemId, priority);
  }

  static fromRow(row: RawRow): PromptCategoryItemLink {
    return new PromptCategoryItemLink(
      row.int('id'),
      row.nullableInt('projectId'),
      row.int('categoryId'),
      row.int('itemId'),
      row.int('priority'),
    );
  }

  get columns(): readonly Column[] {
    return PromptCategoryItemLink.COLUMNS;
  }

  toJSON() {
    return {
      id: this.id,
      projectId: this.projectId,
      categoryId: this.categoryId,
      itemId: this.itemId,
      priority: this.priority,
    };
  }
}
