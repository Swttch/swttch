/**
 * Host liveness by connection, not by pid.
 *
 * An IDE host holds a `/rpc` WebSocket open for as long as it lives, so losing that
 * socket is the host's death arriving over the one channel that crosses every host
 * boundary. A pid probe cannot do the same job: it needs the host and the backend to
 * share a pid namespace, which WSL2 does not give us (the IDE is a Windows process, the
 * backend a Linux one), and a version-manager shim can hide the host behind an extra
 * layer even when they do (#360, #384).
 *
 * A close alone is not death, because a restarting or briefly stalled IDE closes and
 * comes back on a new socket. Death is a close that no reconnect follows within the
 * grace window.
 *
 * Only a host that connected at least once is ever mourned. Standalone runs (the `ccg`
 * launcher, a browser client) never open `/rpc`, and for them this watchdog must stay
 * silent for the whole process lifetime; their host is watched by SIGHUP and the
 * parent-death poller instead.
 */

const HOST_RECONNECT_GRACE_MS = 15_000;

export interface HostLivenessWatchdog {
  /** Report the number of host RPC clients currently connected. */
  report(count: number): void;
  /** Disarm; the callback can no longer fire. */
  stop(): void;
}

export interface HostLivenessDeps {
  graceMs: number;
  setTimer: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer: (handle: ReturnType<typeof setTimeout>) => void;
}

const defaultDeps: HostLivenessDeps = {
  graceMs: HOST_RECONNECT_GRACE_MS,
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (handle) => clearTimeout(handle),
};

/**
 * Watch the host RPC client count and call [onHostGone] once the last host has been
 * away for longer than the grace window. Fires at most once, then disarms itself.
 */
export function startHostLivenessWatchdog(
  onHostGone: () => void,
  deps: HostLivenessDeps = defaultDeps,
): HostLivenessWatchdog {
  let everConnected = false;
  let pending: ReturnType<typeof setTimeout> | null = null;
  let fired = false;

  const cancelPending = () => {
    if (pending === null) return;
    deps.clearTimer(pending);
    pending = null;
  };

  return {
    report(count: number) {
      if (fired) return;

      if (count > 0) {
        everConnected = true;
        cancelPending();
        return;
      }

      // Zero clients before any host ever arrived is the standalone case, not a death.
      if (!everConnected || pending !== null) return;

      pending = deps.setTimer(() => {
        pending = null;
        fired = true;
        console.error(
          '[node-backend]',
          `Host RPC connection stayed down for ${deps.graceMs}ms — shutting down`,
        );
        onHostGone();
      }, deps.graceMs);
    },
    stop() {
      cancelPending();
      fired = true;
    },
  };
}
