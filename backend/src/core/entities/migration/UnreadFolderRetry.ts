import { join } from 'path';
import { entitiesRoot } from '../entityPaths';
import { normalizeCwd } from '../project/normalizeCwd';
import { UnreadFolderCollection } from '../system/UnreadFolder.collection';
import { UnreadFolder } from '../system/UnreadFolder.entity';
import { MigrationContext } from './Migration';
import { MigrationLock, MigrationLockTiming } from './MigrationLock';
import { MigrationRegistry } from './MigrationRegistry';

/**
 * Reads again the folders a migration could not read, so the user never has to ask.
 *
 * A migration that cannot read some old files still finishes and is recorded, or
 * one damaged file would hold every entity back for good. What it could not read is
 * kept in `unread_folders`, and this class is what works that list down. It is
 * called at the moments the program has a reason to look: the backend starts, the
 * user opens the prompts of a project, the window becomes active again (the user
 * may have just allowed access in the system settings). A folder that reads now is
 * moved and leaves the list; one that does not stays for the next moment.
 *
 * Calls never overlap inside the process (a second one waits for the first), and
 * the work holds the same lock as the migrations, so another backend on the same
 * data directory does not move the same folder at the same time. Nothing here
 * throws: a folder that cannot be read is the normal case, and a failure to even
 * try is logged and left for the next moment.
 */
export class UnreadFolderRetry {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly registry: MigrationRegistry,
    private readonly context: MigrationContext = new MigrationContext(),
    /** Told the folders that are still unread after every pass, for whoever shows the user. */
    private readonly onChange: (stillUnread: string[]) => void = () => {},
    /** Short on purpose: a user is waiting on some of the passes, and a busy lock means another process is on it. */
    private readonly lockTiming: MigrationLockTiming = new MigrationLockTiming(2_000, 30_000, 150, 10_000),
  ) {}

  /** The folders still unread, each once. */
  async pending(): Promise<string[]> {
    return [...new Set((await new UnreadFolderCollection().all()).map((row) => row.path))];
  }

  /** Try every folder that is still unread. */
  retryAll(): Promise<void> {
    return this.enqueue(() => true);
  }

  /** Try the folder at [path], if it is one that is still unread. Quick when it is not. */
  retryFolder(path: string): Promise<void> {
    const wanted = normalizeCwd(path);
    return this.enqueue((row) => normalizeCwd(row.path) === wanted);
  }

  private enqueue(wanted: (row: UnreadFolder) => boolean): Promise<void> {
    const pass = this.queue.then(() => this.pass(wanted));
    this.queue = pass;
    return pass;
  }

  private async pass(wanted: (row: UnreadFolder) => boolean): Promise<void> {
    try {
      const rows = new UnreadFolderCollection();
      // Looked at first without the lock: nearly always there is nothing to do, and
      // that must not wait for whoever holds the lock.
      if (!(await rows.where(wanted)).length) {
        this.onChange(await this.pending());
        return;
      }

      const lock = await MigrationLock.acquire(join(entitiesRoot(), '.migrations.lock'), this.lockTiming);
      try {
        // Looked at again with the lock: another process may have moved them meanwhile.
        const due = await rows.where(wanted);
        for (const migration of new Set(due.map((row) => row.migration))) {
          await this.retryMigration(rows, migration, due.filter((row) => row.migration === migration).map((row) => row.path));
        }
      } finally {
        await lock.release();
      }
      this.onChange(await this.pending());
    } catch (err) {
      console.error('[node-backend]', 'could not read the unread folders again:', err instanceof Error ? err.message : err);
    }
  }

  private async retryMigration(rows: UnreadFolderCollection, migration: string, paths: string[]): Promise<void> {
    // A migration this version does not have was recorded by a newer one: not ours to retry.
    const entry = this.registry.entries.find((candidate) => candidate.name === migration);
    if (entry === undefined) return;

    let stillUnread: string[];
    try {
      stillUnread = await entry.create().retry(this.context, paths);
    } catch (err) {
      console.error('[node-backend]', `reading ${migration}'s unread folders again failed:`, err instanceof Error ? err.message : err);
      stillUnread = paths;
    }
    const still = new Set(stillUnread);
    await rows.forget(migration, paths.filter((path) => !still.has(path)));
  }
}
