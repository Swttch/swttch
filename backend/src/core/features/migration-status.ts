import { MigrationObserver, type MigrationRunResult } from '../entities/migration/MigrationRunner';

/** What the webview is told about the data migrations. */
export class MigrationStatusPayload {
  constructor(
    /**
     * `running`: a run is taking long enough to be worth showing. `failed`: a
     * migration failed and the entities are held back. `done`: a run ended and there
     * is something to tell the user. `idle`: nothing to show.
     */
    readonly status: 'idle' | 'running' | 'failed' | 'done',
    /** The migrations being run, for `running`. */
    readonly due: string[] = [],
    /** The migration that failed, for `failed`. */
    readonly failedMigration: string | null = null,
    /** Why it failed, for `failed`. */
    readonly reason: string | null = null,
    /** Directories whose old files could not be read for lack of permission, for `done`. */
    readonly unreadable: string[] = [],
  ) {}

  static idle(): MigrationStatusPayload {
    return new MigrationStatusPayload('idle');
  }
}

/**
 * Turns the progress of the migrations into what the user is shown.
 *
 * Nothing is shown for a run that is quick, which is nearly every start: a banner
 * that flashes past is noise. A run that is still going after
 * {@link MigrationStatus.SHOW_AFTER_MS} is announced as running, and the end of
 * that run clears it. A failure is always shown, because the entities are held back
 * and the user needs to know why. A finished run that could not read some old files
 * is shown too, because that is something they can act on.
 *
 * The latest state is kept, so a window that opens later (or reconnects) is told it
 * and not only the windows that were open when it happened.
 */
export class MigrationStatus extends MigrationObserver {
  /** How long a run may take before it is worth telling the user about. */
  static readonly SHOW_AFTER_MS = 1_000;

  private timer: NodeJS.Timeout | null = null;
  private announced = false;
  private current: MigrationStatusPayload = MigrationStatusPayload.idle();
  /** The folders still unread, which outlive a run: a later start may add to them or clear them. */
  private unread: string[] = [];
  private send: ((payload: MigrationStatusPayload) => void) | null = null;

  /** Where to push a state when it changes. */
  attach(send: (payload: MigrationStatusPayload) => void): void {
    this.send = send;
  }

  /** The state to tell a window that has just connected. */
  snapshot(): MigrationStatusPayload {
    return this.current;
  }

  started(due: string[]): void {
    this.announced = false;
    this.timer = setTimeout(() => {
      this.announced = true;
      this.publish(new MigrationStatusPayload('running', due));
    }, MigrationStatus.SHOW_AFTER_MS);
    // Telling the user must never keep a finished process alive.
    this.timer.unref();
  }

  finished(result: MigrationRunResult): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;

    if (result.failure !== null) {
      this.publish(new MigrationStatusPayload('failed', [], result.failure.migrationName, result.failure.reason));
    } else {
      this.unread = [...new Set([...this.unread, ...result.unreadable])];
      if (this.unread.length > 0) this.publish(this.unreadPayload());
      else if (this.announced || this.current.status === 'failed') this.publish(MigrationStatusPayload.idle());
    }
    this.announced = false;
  }

  /**
   * The folders that are still unread, after a run or after the program read some of
   * them again. Reading them is done by the program itself, so this only keeps the
   * notice true: it shows while folders remain and goes away by itself once they are
   * read. A failure or a run in progress is not covered over.
   */
  unreadFolders(paths: string[]): void {
    const same = paths.length === this.unread.length && paths.every((path, index) => path === this.unread[index]);
    this.unread = paths;
    if (same || this.current.status === 'failed' || this.current.status === 'running') return;
    this.publish(paths.length > 0 ? this.unreadPayload() : MigrationStatusPayload.idle());
  }

  private unreadPayload(): MigrationStatusPayload {
    return new MigrationStatusPayload('done', [], null, null, this.unread);
  }

  private publish(payload: MigrationStatusPayload): void {
    this.current = payload;
    this.send?.(payload);
  }
}

/** The one status of this process, shared by the start-up run and the handler that answers requests for it. */
export const migrationStatus = new MigrationStatus();
