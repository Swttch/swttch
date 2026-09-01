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
  /** The pid to watch; defaults to [resolveWatchedPid]. Injectable for tests. */
  getWatchedPid?: () => number;
  /**
   * Whether a host is still holding its control connection open, if anyone can say.
   *
   * An open socket outranks the pid probe, because a process that is holding a socket
   * open is observably running. Wired to the IDE's `/rpc` connection; absent for hosts
   * that have no such channel, where the pid verdict stands on its own.
   */
  isHostAttached?: () => boolean;
  /** Told when a death verdict was rejected, so the rejection is not silent. */
  onVerdictRejected?: (watchedPid: number) => void;
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
 * The pid this backend should actually watch: the host named in `CCG_HOST_PID`, falling back
 * to our own parent.
 *
 * Watching `process.ppid` is wrong whenever the host launches node through a version-manager
 * shim. Volta, nvm and fnm all put a shim process in between, so the tree is
 * `host -> shim -> node`, and this watchdog runs in `node`. When the host dies it is the
 * *shim* that is orphaned — the shim stays alive, so from node's side the parent still looks
 * healthy and the watchdog never fires. Observed with Volta: the IDE was gone, the shim sat at
 * ppid 1, and both processes were still running a minute later.
 *
 * The host knows its own pid, so it passes it in `CCG_HOST_PID` and we watch that instead.
 * Then the number of shim layers in between stops mattering. Absent or unparseable → fall back
 * to the old behaviour, which is still correct when nothing sits in the middle.
 */
export function resolveWatchedPid(
  env: NodeJS.ProcessEnv = process.env,
  getPpid: () => number = () => process.ppid,
): number {
  const declared = Number.parseInt(env.CCG_HOST_PID ?? '', 10);
  if (Number.isFinite(declared) && declared > 0) return declared;
  return getPpid();
}

/**
 * Arm the watchdog. Fires `onParentDeath` at most once, then disarms itself.
 * Returns a stop function. The interval is unref'd so it never blocks a
 * natural process exit.
 */
export function startParentWatchdog(
  onParentDeath: () => void,
  overrides: Partial<ParentWatchdogDeps> = {},
): () => void {
  const deps: ParentWatchdogDeps = { ...defaultDeps, ...overrides };
  // Resolve through deps.getPpid, not process.ppid: the fallback must agree with whatever
  // parent this watchdog was actually given, or `watchingOwnParent` below reads false and the
  // reparent check silently stops working.
  const watchedPid = deps.getWatchedPid
    ? deps.getWatchedPid()
    : resolveWatchedPid(process.env, deps.getPpid);
  // Only the ppid can be reparented out from under us; a pid handed over by the host is
  // watched by liveness probe alone.
  const watchingOwnParent = watchedPid === deps.getPpid();

  // A pid that already probes as gone at arm time has NOT died — the host spawned this
  // process moments ago, so it is alive by construction. ESRCH here means the pid is not
  // observable from where we run: WSL2 keeps the IDE in Windows' pid namespace and this
  // backend in the distro's, so probing a Windows pid from Linux always raises ESRCH.
  // Polling it would declare the host dead on the very first tick and kill a healthy
  // backend every interval, which is issue #384. Unobservable means "cannot answer this
  // question", so the poller stays disarmed rather than answering it wrongly.
  if (!isPidAlive(watchedPid, deps.probe)) {
    console.error(
      '[node-backend]',
      `Host process ${watchedPid} is not observable from this process — parent-death polling disabled`,
    );
    return () => {};
  }

  const timer = setInterval(() => {
    const dead = watchingOwnParent
      ? isParentDead(watchedPid, deps)
      : !isPidAlive(watchedPid, deps.probe);
    if (!dead) return;

    // A pid verdict of "dead" loses to a host that is still holding its socket open.
    // Reading a pid is an inference about a process we cannot see; an open connection is
    // that process doing something. When the two disagree the observation wins, and the
    // poller keeps watching instead of acting on a claim already contradicted. This is
    // what makes an unforeseen false positive survivable rather than fatal: #384 would
    // have been caught here even without knowing anything about pid namespaces.
    if (deps.isHostAttached?.()) {
      deps.onVerdictRejected?.(watchedPid);
      console.error(
        '[node-backend]',
        `Host process ${watchedPid} probed as gone, but its control connection is open — ignoring`,
      );
      return;
    }

    clearInterval(timer);
    console.error(
      '[node-backend]',
      `Host process ${watchedPid} died — shutting down`,
    );
    onParentDeath();
  }, deps.intervalMs);
  timer.unref();

  return () => clearInterval(timer);
}

/** Signal-0 liveness check. EPERM means it exists but is not ours to signal — still alive. */
export function isPidAlive(pid: number, probe: (pid: number) => void): boolean {
  try {
    probe(pid);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}
