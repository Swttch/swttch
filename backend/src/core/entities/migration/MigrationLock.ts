import { mkdir, open, readFile, stat, unlink, utimes } from 'fs/promises';
import { dirname } from 'path';
import { retryTransient } from '../../features/atomic-json';

/** Another process held the lock for longer than this one was willing to wait. */
export class MigrationLockTimeoutError extends Error {
  constructor(
    readonly lockPath: string,
    readonly waitedMs: number,
  ) {
    super(`the migration lock ${lockPath} was still held after ${waitedMs} ms`);
    this.name = 'MigrationLockTimeoutError';
  }
}

/**
 * How long to wait, how often to look, and when a lock counts as abandoned.
 * Constants and not constructor arguments of the lock, so a test can change them
 * without a lock having to carry settings around.
 */
export class MigrationLockTiming {
  constructor(
    /** How often the holder says it is still alive. */
    readonly heartbeatMs: number = 2_000,
    /** A lock whose last sign of life is older than this is taken to be abandoned. */
    readonly staleAfterMs: number = 30_000,
    /** How often a process that has to wait looks again. */
    readonly pollMs: number = 150,
    /** How long a process waits before giving up. */
    readonly waitMs: number = 5 * 60_000,
  ) {}
}

/**
 * One process at a time runs the migrations.
 *
 * Several backends share `~/.claude-code-gui` (the IDE plugin, `ccg`, a dev server)
 * and all of them find the same migrations unrecorded the first time the new
 * version starts. The lock is a file made with the exclusive flag, so exactly one
 * of them creates it; the others wait until it is gone and then find the work done.
 *
 * A process that dies holding the lock cannot remove it. The holder therefore
 * touches the file every few seconds, and a lock that has not been touched for
 * longer than {@link MigrationLockTiming.staleAfterMs}, or whose process no longer
 * exists on this machine, is taken over. Waiting is not a failure of the
 * migration: a process that cannot get the lock in time throws
 * {@link MigrationLockTimeoutError} and the next start tries again.
 */
export class MigrationLock {
  private heartbeat: NodeJS.Timeout | null = null;

  private constructor(private readonly lockPath: string) {}

  /** Take the lock, waiting for whoever holds it. */
  static async acquire(
    lockPath: string,
    timing: MigrationLockTiming = new MigrationLockTiming(),
  ): Promise<MigrationLock> {
    const startedAt = Date.now();
    await mkdir(dirname(lockPath), { recursive: true });

    for (;;) {
      if (await MigrationLock.tryCreate(lockPath)) {
        const lock = new MigrationLock(lockPath);
        lock.beat(timing.heartbeatMs);
        return lock;
      }
      if (await MigrationLock.isAbandoned(lockPath, timing.staleAfterMs)) {
        await removeLockFile(lockPath);
        continue;
      }
      const waitedMs = Date.now() - startedAt;
      if (waitedMs >= timing.waitMs) throw new MigrationLockTimeoutError(lockPath, waitedMs);
      await new Promise((resolve) => setTimeout(resolve, timing.pollMs));
    }
  }

  /** Give the lock up. Safe to call twice. */
  async release(): Promise<void> {
    if (this.heartbeat !== null) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    await removeLockFile(this.lockPath);
  }

  private beat(everyMs: number): void {
    this.heartbeat = setInterval(() => {
      const now = new Date();
      void utimes(this.lockPath, now, now).catch(() => {});
    }, everyMs);
    // The lock must never keep a finished process alive.
    this.heartbeat.unref();
  }

  private static async tryCreate(lockPath: string): Promise<boolean> {
    try {
      const handle = await open(lockPath, 'wx');
      await handle.writeFile(String(process.pid));
      await handle.close();
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw err;
    }
  }

  private static async isAbandoned(lockPath: string, staleAfterMs: number): Promise<boolean> {
    try {
      const { mtimeMs } = await stat(lockPath);
      if (Date.now() - mtimeMs > staleAfterMs) return true;
      return !isRunning(Number.parseInt(await readFile(lockPath, 'utf-8'), 10));
    } catch {
      // The lock vanished between looking and reading: not abandoned, gone.
      return false;
    }
  }
}

/**
 * Remove a lock file. Windows refuses to delete a file another process has open for
 * a moment (a waiting process reading it to see whether it is abandoned), so the
 * refusal is tried again. A file that is already gone, or that stays refused, is not
 * an error here: a lock that could not be removed ages into an abandoned one.
 */
async function removeLockFile(lockPath: string): Promise<void> {
  await retryTransient(() => unlink(lockPath)).catch(() => {});
}

/** Whether a process with this id exists on this machine. An unreadable id counts as running. */
function isRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}
