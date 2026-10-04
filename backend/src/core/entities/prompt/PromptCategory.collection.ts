import { AbstractEntityCollection } from '../AbstractEntityCollection';
import { RawRow } from '../Column';
import { defaultTableMetadata } from '../defaultTableMetadata';
import { PromptCategory } from './PromptCategory.entity';

export class PromptCategoryCollection extends AbstractEntityCollection<PromptCategory> {
  readonly domain = 'prompt';
  readonly table = 'prompt_categories';
  protected readonly columns = PromptCategory.COLUMNS;
  protected readonly schemaVersion = 1;

  constructor() {
    super(defaultTableMetadata());
  }

  protected hydrate(row: RawRow): PromptCategory {
    return PromptCategory.fromRow(row);
  }

  /** Every category in the order of the category column. */
  async inColumnOrder(): Promise<PromptCategory[]> {
    return (await this.all()).sort((a, b) => a.priority - b.priority);
  }
}
