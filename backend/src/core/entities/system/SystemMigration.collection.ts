import { AbstractEntityCollection } from '../AbstractEntityCollection';
import { RawRow } from '../Column';
import { defaultTableMetadata } from '../defaultTableMetadata';
import { SystemMigration } from './SystemMigration.entity';

export class SystemMigrationCollection extends AbstractEntityCollection<SystemMigration> {
  readonly domain = 'system';
  readonly table = 'system_migrations';
  protected readonly columns = SystemMigration.COLUMNS;
  protected readonly schemaVersion = 1;

  constructor() {
    super(defaultTableMetadata());
  }

  protected hydrate(row: RawRow): SystemMigration {
    return SystemMigration.fromRow(row);
  }

  /** The names of every migration that has run. */
  async names(): Promise<Set<string>> {
    return new Set((await this.all()).map((migration) => migration.name));
  }

  /** Whether the migration called [name] has run. */
  async hasRun(name: string): Promise<boolean> {
    return (await this.names()).has(name);
  }
}
