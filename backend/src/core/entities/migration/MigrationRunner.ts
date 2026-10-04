import { join } from 'path';
import { entitiesRoot } from '../entityPaths';
import { SystemMigration } from '../system/SystemMigration.entity';
import { SystemMigrationCollection } from '../system/SystemMigration.collection';
import { UnreadFolderCollection } from '../system/UnreadFolder.collection';
import { MigrationContext } from './Migration';
import { MigrationFailedError, MigrationGate } from './MigrationGate';
import { MigrationLock, MigrationLockTiming } from './MigrationLock';
import { MigrationRegistry } from './MigrationRegistry';

/** What a run of the migrations came to. */
export class MigrationRunResult {
  constructor(
    /** The migrations this run did, in order. */
    readonly ran: string[],
    /** What stopped the run, or null when every migration that was due has run. */
    readonly failure: MigrationFailedError | null,
    /** Directories whose old files could not be read for lack of permission. */
    readonly unreadable: string[],
    readonly elapsedMs: number,
  ) {}

  /** Nothing was due, so nothing was done. */
  static nothingToDo(): MigrationRunResult {
    return new MigrationRunResult([], null, [], 0);
  }

  get didWork(): boolean {
    return this.ran.length > 0;
  }
}

/**
 * Told when a run starts and when it ends, for whoever shows the user that data is
 * being updated. This one says nothing; a subclass overrides what it cares about.
 */
export class MigrationObserver {
  /** A run found [due] migrations and is about to do them. */
  started(_due: string[]): void {}

  /** The run ended, finished or not. */
  finished(_result: MigrationRunResult): void {}
}

/**
 * Runs the migrations a version of the program has and the user's data has not
 * seen yet.
 *
 * Which are due is the set difference between the migrations this version has and
 * the names in `system_migrations`, so a user who skipped several versions is
 * brought forward through all of them, in order, the same way as one who updated
 * one version. They run one after the other, each finished before the next begins,
 * and the first one that throws stops the run: the ones after it may depend on it.
 * A migration is recorded only when it is done, so a stopped run is picked up from
 * the one that failed at the next start.
 *
 * Another process may be doing the same at the same moment, which is why the run
 * holds {@link MigrationLock} and looks at the records again once it has it: what
 * the other process finished is not done a second time.
 */
export class MigrationRunner {
  constructor(
    private readonly registry: MigrationRegistry,
    /** The version of the program, recorded with each migration it runs. */
    private readonly appVersion: string,
    private readonly context: MigrationContext = new MigrationContext(),
    private readonly observer: MigrationObserver = new MigrationObserver(),
    private readonly lockTiming: MigrationLockTiming = new MigrationLockTiming(),
  ) {}

  /** The migrations that have not run, in the order they will. */
  due(): Promise<string[]> {
    return MigrationGate.runAsMigration(async () => {
      const recorded = await new SystemMigrationCollection().names();
      return this.registry.pendingAgainst(recorded).map((entry) => entry.name);
    });
  }

  /**
   * Do every migration that is due. Never throws for a migration that failed: the
   * failure is in the result, and the caller decides what the user sees.
   */
  run(): Promise<MigrationRunResult> {
    // Everything the run touches is the migration's own business: the gate that
    // holds requests back must not hold the migrations back too.
    return MigrationGate.runAsMigration(() => this.runNow());
  }

  private async runNow(): Promise<MigrationRunResult> {
    const startedAt = Date.now();
    const records = new SystemMigrationCollection();

    let due: string[];
    try {
      const recorded = await records.names();
      const unknown = this.registry.unknownIn(recorded);
      if (unknown.length > 0) {
        // Recorded by a newer version. They are left alone: this version cannot
        // know what they did, and undoing them is not its place.
        console.error('[node-backend]', `Migrations recorded by a newer version: ${unknown.join(', ')}`);
      }
      due = this.registry.pendingAgainst(recorded).map((entry) => entry.name);
    } catch (err) {
      return this.ended(new MigrationRunResult([], new MigrationFailedError('(records)', describe(err)), [], Date.now() - startedAt));
    }
    if (due.length === 0) return MigrationRunResult.nothingToDo();

    this.observer.started(due);

    let lock: MigrationLock;
    try {
      lock = await MigrationLock.acquire(join(entitiesRoot(), '.migrations.lock'), this.lockTiming);
    } catch (err) {
      return this.ended(new MigrationRunResult([], new MigrationFailedError('(lock)', describe(err)), [], Date.now() - startedAt));
    }

    const ran: string[] = [];
    const unreadable: string[] = [];
    let failure: MigrationFailedError | null = null;
    try {
      for (const entry of this.registry.pendingAgainst(await records.names())) {
        const migrationStartedAt = Date.now();
        try {
          const report = await entry.create().up(this.context);
          // Before the record: a run cut off between the two is run again and finds the same rows.
          await new UnreadFolderCollection().remember(entry.name, report.unreadable, Date.now());
          // Before the record: a run cut off between the two is run again and finds the same rows.
          await records.insert(
            SystemMigration.draft(entry.name, this.appVersion, Date.now(), Date.now() - migrationStartedAt, report.summary),
          );
          ran.push(entry.name);
          unreadable.push(...report.unreadable);
          console.error('[node-backend]', `Migration ${entry.name} done in ${Date.now() - migrationStartedAt} ms: ${report.summary}`);
        } catch (err) {
          console.error('[node-backend]', `Migration ${entry.name} failed:`, err);
          failure = new MigrationFailedError(entry.name, describe(err));
          break;
        }
      }
    } catch (err) {
      failure = new MigrationFailedError('(records)', describe(err));
    } finally {
      await lock.release();
    }

    return this.ended(new MigrationRunResult(ran, failure, unreadable, Date.now() - startedAt));
  }

  private ended(result: MigrationRunResult): MigrationRunResult {
    this.observer.finished(result);
    return result;
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
