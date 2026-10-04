import { MigrationFailedError, MigrationGate } from './MigrationGate';
import { MigrationRunResult, MigrationRunner } from './MigrationRunner';
import type { UnreadFolderRetry } from './UnreadFolderRetry';

/**
 * The migrations of a start-up: closes the gate that holds entity requests back,
 * and runs them once the server is open.
 *
 * The two are apart on purpose. The gate has to be closed BEFORE the server accepts
 * its first message, or a request could read the old data in the gap. The run has
 * to start AFTER the port is open, because whoever started the backend waits for the
 * port and gives up after a while, and a long migration must not eat that time.
 */
export class StartupMigrations {
  private settle!: (failure: MigrationFailedError | null) => void;
  private started: Promise<MigrationRunResult> | null = null;
  private running: Promise<MigrationRunResult> | null = null;
  /** Whether the first run is over. */
  private ended = false;
  /** How the latest run ended: what [retry] has to run again, or null when it ended well. */
  private lastFailure: MigrationFailedError | null = null;

  /**
   * Closes the gate as it is made. [unreadFolders], when given, is asked to read
   * again the folders an earlier start could not read, before the due migrations
   * run: a user who allowed access and restarted finds their data moved.
   */
  constructor(
    private readonly runner: MigrationRunner,
    private readonly unreadFolders: UnreadFolderRetry | null = null,
  ) {
    MigrationGate.close(
      new Promise<MigrationFailedError | null>((resolve) => {
        this.settle = resolve;
      }),
    );
  }

  /** Start the run. Only the first call does; later ones answer the same run. */
  start(): Promise<MigrationRunResult> {
    this.started ??= this.settled(this.readUnreadFolders().then(() => this.runner.run()));
    return this.started;
  }

  /**
   * Run the migrations again after a run failed, in this same process: the gate
   * closes again, and opens when the run is over. Answers null when there is nothing
   * to run again (no run failed). Calls that come while a run goes on share it.
   *
   * The migrations are safe to run again from the start, so nothing is lost by it,
   * and it is how the user's "try again" works without restarting anything.
   */
  retry(): Promise<MigrationRunResult | null> {
    if (this.started === null) return this.start();
    if (this.running !== null) return this.running;
    // The first run is still going: whether there is anything to run again is not known yet.
    if (!this.ended) return this.started.then(() => this.retry());
    if (this.lastFailure === null) return Promise.resolve(null);

    // Closed in this very turn, so a request that comes right after waits instead of failing.
    MigrationGate.closeAgain(
      new Promise<MigrationFailedError | null>((resolve) => {
        this.settle = resolve;
      }),
    );
    this.running = this.settled(this.runner.run()).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** Opens or keeps closed the gate by how [run] ended, and remembers a failure for [retry]. */
  private settled(run: Promise<MigrationRunResult>): Promise<MigrationRunResult> {
    return run.then(
      (result) => {
        this.ended = true;
        this.lastFailure = result.failure;
        this.settle(result.failure);
        return result;
      },
      (err) => {
        // The runner reports failures in its result and does not throw. A throw is
        // a bug in it, and the entities must stay held back all the same.
        const failure = new MigrationFailedError('(run)', err instanceof Error ? err.message : String(err));
        this.ended = true;
        this.lastFailure = failure;
        this.settle(failure);
        return new MigrationRunResult([], failure, [], 0);
      },
    );
  }

  /** Never throws and never holds the migrations back: an unread folder is a normal state. */
  private async readUnreadFolders(): Promise<void> {
    if (this.unreadFolders === null) return;
    try {
      await MigrationGate.runAsMigration(() => this.unreadFolders!.retryAll());
    } catch (err) {
      console.error('[node-backend]', 'reading unread folders at start failed:', err instanceof Error ? err.message : err);
    }
  }
}
