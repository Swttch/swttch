import type { StartupMigrations } from '../entities/migration/StartupMigrations';

/**
 * Where the handler that answers "try the migrations again" finds this process's
 * start-up migrations. The server makes them and attaches them here, the same way
 * it attaches the status to the connections.
 */
export class MigrationRetry {
  private startup: StartupMigrations | null = null;

  attach(startup: StartupMigrations): void {
    this.startup = startup;
  }

  /** Run the migrations again if the last run failed; does nothing otherwise. */
  async run(): Promise<void> {
    await this.startup?.retry();
  }
}

export const migrationRetry = new MigrationRetry();
