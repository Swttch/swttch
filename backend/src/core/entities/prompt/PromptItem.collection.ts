import { AbstractEntityCollection } from '../AbstractEntityCollection';
import { RawRow } from '../Column';
import { defaultTableMetadata } from '../defaultTableMetadata';
import { PromptItem } from './PromptItem.entity';

export class PromptItemCollection extends AbstractEntityCollection<PromptItem> {
  readonly domain = 'prompt';
  readonly table = 'prompt_items';
  protected readonly columns = PromptItem.COLUMNS;
  protected readonly schemaVersion = 1;

  constructor() {
    super(defaultTableMetadata());
  }

  protected hydrate(row: RawRow): PromptItem {
    return PromptItem.fromRow(row);
  }

  /**
   * The prompts of the project numbered [projectId], or the shared ones when it is
   * null, in the library's own order.
   */
  async inScope(projectId: number | null): Promise<PromptItem[]> {
    return (await this.where((item) => item.belongsTo(projectId))).sort(
      (a, b) => a.priority - b.priority,
    );
  }
}
