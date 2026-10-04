import { AsyncLocalStorage } from 'async_hooks';

/**
 * A run of migrations did not finish, and the entity files are in a state nothing
 * should read or write.
 */
export class MigrationFailedError extends Error {
  constructor(
    /** The migration that failed; the ones after it did not run. */
    readonly migrationName: string,
    readonly reason: string,
  ) {
    super(`migration ${migrationName} failed: ${reason}`);
    this.name = 'MigrationFailedError';
  }
}

/**
 * Makes every read and write of an entity wait for the migrations of this process.
 *
 * The backend starts serving as soon as its port is open, and the migrations run
 * after that, so a request can arrive while old data is still being moved. Reading
 * then would show a half-moved library that looks like prompts were lost, and
 * writing would bury the old ones. The collections ask this gate before they touch
 * a file, which is why no handler has to remember to.
 *
 * - Before a run has been started (a script, a test, the first line of `main`) the
 *   gate is open: there is nothing to wait for.
 * - While it runs, entity calls wait.
 * - When it finished, entity calls go on. When it failed they fail with
 *   {@link MigrationFailedError}, because the migrations after the one that failed
 *   never ran and the data is not in the shape the program expects.
 *
 * The migrations themselves use collections, so the code a migration runs is let
 * through: it is tagged when it starts, and the tag follows its `await`s.
 */
export class MigrationGate {
  private static run: Promise<MigrationFailedError | null> | null = null;
  private static readonly insideMigration = new AsyncLocalStorage<true>();

  /**
   * Close the gate until [run] settles. [run] answers the failure, or null when
   * every migration ran. Only the first call in a process counts.
   */
  static close(run: Promise<MigrationFailedError | null>): void {
    if (MigrationGate.run === null) MigrationGate.run = run;
  }

  /**
   * Close the gate again for a second run, after the first one failed. Requests that
   * already failed stay failed; the ones that come now wait for [run].
   */
  static closeAgain(run: Promise<MigrationFailedError | null>): void {
    MigrationGate.run = run;
  }

  /** Run [task] as a migration's own code, which the gate does not hold back. */
  static runAsMigration<T>(task: () => Promise<T>): Promise<T> {
    return MigrationGate.insideMigration.run(true, task);
  }

  /** Wait until the migrations are done, and fail if they failed. Resolves at once when the gate is open. */
  static async ready(): Promise<void> {
    if (MigrationGate.run === null || MigrationGate.insideMigration.getStore() === true) return;
    const failure = await MigrationGate.run;
    if (failure !== null) throw failure;
  }

  /** Open the gate and forget any run. For tests. */
  static reset(): void {
    MigrationGate.run = null;
  }
}
