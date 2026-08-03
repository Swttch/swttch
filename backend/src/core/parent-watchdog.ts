/**
 * Parent-process watchdog (keep-alive clamp on parent death).
 *
 * While the IDE lives, the keep-alive gate may hold the backend up forever.
 * When the parent dies — clean close and crash alike — the backend must NOT
 * exit (a browser/tunnel client may still be working); it only restores the
 * idle-shutdown regime: live /ws clients keep it
 * alive, and with none it exits after the usual grace.
 *
 * Detection is polling-based, no Kotlin cooperation needed:
 *  - POSIX: on parent death the process is reparented, so `process.ppid`
 *    changes (init/subreaper).
 *  - win32: the ppid is frozen at spawn time and never changes, so we
 *    additionally probe the original parent with `kill(ppid, 0)` — ESRCH
 *    means it is gone. (Residual pid-reuse false negative accepted for MVP.)
 */

const PARENT_POLL_INTERVAL_MS = 10_000;

export interface ParentWatchdogDeps {
  /** Current parent pid — `() => process.ppid` in production. */
  getPpid: () => number;
  /** Signal-0 liveness probe — `(pid) => process.kill(pid, 0)` in production. */
  probe: (pid: number) => void;
  intervalMs: number;
}

const defaultDeps: ParentWatchdogDeps = {
  getPpid: () => process.ppid,
  probe: (pid) => process.kill(pid, 0),
  intervalMs: PARENT_POLL_INTERVAL_MS,
};

/**
 * Decide whether the parent captured as `initialPpid` is dead, given the
 * current ppid and a signal-0 probe. Exported for unit tests.
 */
export function isParentDead(initialPpid: number, deps: Pick<ParentWatchdogDeps, 'getPpid' | 'probe'>): boolean {
  if (deps.getPpid() !== initialPpid) return true;
  try {
    deps.probe(initialPpid);
    return false;
  } catch (err) {
    // ESRCH = no such process. EPERM means it exists but we may not signal
    // it — still alive, so only ESRCH counts as death.
    return (err as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

/**
 * Arm the watchdog. Fires `onParentDeath` at most once, then disarms itself.
 * Returns a stop function. The interval is unref'd so it never blocks a
 * natural process exit.
 */
export function startParentWatchdog(
  onParentDeath: () => void,
  deps: ParentWatchdogDeps = defaultDeps,
): () => void {
  const initialPpid = deps.getPpid();

  const timer = setInterval(() => {
    if (!isParentDead(initialPpid, deps)) return;
    clearInterval(timer);
    console.error(
      '[node-backend]',
      `Parent process ${initialPpid} died — restoring the idle-shutdown regime (keep-alive clamp)`,
    );
    onParentDeath();
  }, deps.intervalMs);
  timer.unref();

  return () => clearInterval(timer);
}
