/**
 * Liveness for the /ws control channel.
 *
 * Every piece of teardown the backend does for a departing client hangs off the
 * socket's `close` event: the login cancel, the dictation release, the file
 * watchers, and — through `removeConnection` → `unsubscribe` → the cleanup timer
 * — the kill of the session's `claude` child. A client that disappears WITHOUT
 * closing its socket (machine rebooted, laptop's network yanked, Remote
 * Development client killed) never produces that event, so none of it runs and
 * the CLI child is left reading a pipe whose other end has no reader. It
 * survives indefinitely, while the backend keeps counting the connection and
 * reporting the session as healthy (issue #479).
 *
 * TCP alone cannot notice this: a half-open connection looks identical to an
 * idle one until something is written, and the backend writes nothing to an idle
 * panel. So the backend asks, on a timer, and terminates the socket when nothing
 * answers — `terminate()` raises the `close` event the whole teardown chain is
 * already built on, so nothing downstream needs to know this file exists.
 *
 * ── The bar this has to clear ──────────────────────────────────────────────
 *
 * Being slow to notice a dead client costs one orphaned CLI process. Declaring a
 * LIVE client dead costs the user the session they are working in. The two are
 * not comparable, so every constant here is sized for the second one:
 *
 *  - a round is only counted against a socket after [maxMisses] of them in a
 *    row, so the default is a full 90 seconds of silence before a terminate;
 *  - ANY frame from the client counts as a sign of life, not just a pong, so a
 *    proxy that swallows control frames cannot make a talking client look dead;
 *  - a tick that arrives far later than it was due is read as this machine
 *    having been suspended (a laptop lid closed and reopened), and grants every
 *    socket a fresh start instead of billing it for the frozen interval.
 */

/** How often the backend asks its clients whether they are still there. */
export const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Consecutive unanswered rounds before a socket is terminated. Three rounds at
 * the default interval means a socket has to be silent for about 90 seconds,
 * which is far longer than a slow Remote Development round trip or a tunnel hop.
 */
export const HEARTBEAT_MAX_MISSES = 3;

/**
 * A tick later than `interval * this` did not arrive late because the event loop
 * was busy; the machine was asleep. Nothing is counted against any socket on
 * such a tick.
 */
export const SUSPEND_GRACE_FACTOR = 2;

/** WebSocket.OPEN — spelled out so this module needs no `ws` import. */
const OPEN = 1;

/**
 * The part of a WebSocket this module touches. Narrow on purpose: it keeps the
 * heartbeat testable with a plain fake, and it documents that nothing here reads
 * or writes application messages.
 */
export interface HeartbeatSocket {
  readonly readyState: number;
  ping(): void;
  terminate(): void;
  on(event: 'pong' | 'message', listener: () => void): unknown;
}

export interface HeartbeatOptions {
  intervalMs?: number;
  maxMisses?: number;
  /** Injectable clock (ms epoch). Overridden in tests; also what detects suspend. */
  now?: () => number;
  /** Called just before a socket is terminated, for logging. */
  onDead?: (socket: HeartbeatSocket) => void;
  /** Called at the end of every tick, suspended ones included. */
  onTick?: () => void;
}

/**
 * Per-server socket liveness tracker. Owns one interval; [start] arms it and
 * [stop] disarms it. [tick] is public so tests can drive rounds without timers.
 */
export class ConnectionHeartbeat {
  private readonly intervalMs: number;
  private readonly maxMisses: number;
  private readonly now: () => number;
  private readonly onDead?: (socket: HeartbeatSocket) => void;
  private readonly onTick?: () => void;

  /** Tracked sockets → rounds asked since the last sign of life from that socket. */
  private readonly misses = new Map<HeartbeatSocket, number>();
  private timer: NodeJS.Timeout | null = null;
  private lastTickAt: number;

  constructor(options: HeartbeatOptions = {}) {
    this.intervalMs = options.intervalMs ?? HEARTBEAT_INTERVAL_MS;
    this.maxMisses = options.maxMisses ?? HEARTBEAT_MAX_MISSES;
    this.now = options.now ?? Date.now;
    this.onDead = options.onDead;
    this.onTick = options.onTick;
    this.lastTickAt = this.now();
  }

  /** How often this instance ticks, so clients can be told what to expect. */
  get interval(): number {
    return this.intervalMs;
  }

  /** Number of sockets currently watched. Test/diagnostic accessor. */
  get trackedCount(): number {
    return this.misses.size;
  }

  /**
   * Watch a socket, and take its pongs and its messages as signs of life.
   *
   * Messages count because the pong is a control frame, and a control frame only
   * proves the client is there if everything between us forwards it. An
   * application message proves the same thing without that assumption.
   */
  track(socket: HeartbeatSocket): void {
    this.misses.set(socket, 0);
    socket.on('pong', () => this.markAlive(socket));
    socket.on('message', () => this.markAlive(socket));
  }

  /** Stop watching a socket — called when its `close` has already fired. */
  untrack(socket: HeartbeatSocket): void {
    this.misses.delete(socket);
  }

  /** Record a sign of life, resetting the socket's unanswered-round count. */
  markAlive(socket: HeartbeatSocket): void {
    if (!this.misses.has(socket)) return;
    this.misses.set(socket, 0);
  }

  /** Unanswered rounds for a socket, or undefined when it is not tracked. */
  missesFor(socket: HeartbeatSocket): number | undefined {
    return this.misses.get(socket);
  }

  start(): void {
    if (this.timer !== null) return;
    this.lastTickAt = this.now();
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    // Never hold the process open for a heartbeat.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * One round: terminate whoever has been silent for [maxMisses] rounds, then
   * ask everyone else.
   */
  tick(): void {
    const at = this.now();
    const sinceLastTick = at - this.lastTickAt;
    this.lastTickAt = at;

    // A tick this late means the machine was asleep, not that the clients went
    // quiet. Billing them for the frozen interval is exactly the mistake that
    // costs a live session, so the round is spent forgiving instead of asking.
    if (sinceLastTick > this.intervalMs * SUSPEND_GRACE_FACTOR) {
      for (const socket of this.misses.keys()) this.misses.set(socket, 0);
      console.error(
        '[node-backend]',
        `Heartbeat tick was ${Math.round(sinceLastTick / 1000)}s late (suspend/resume); ` +
          'every connection starts over',
      );
      this.onTick?.();
      return;
    }

    for (const [socket, misses] of [...this.misses]) {
      if (misses >= this.maxMisses) {
        this.misses.delete(socket);
        this.onDead?.(socket);
        try {
          socket.terminate();
        } catch {
          // Already gone at the socket layer; its `close` is what we were after.
        }
        continue;
      }
      this.misses.set(socket, misses + 1);
      if (socket.readyState !== OPEN) continue;
      try {
        socket.ping();
      } catch {
        // A socket that cannot be pinged is on its way out; the next rounds
        // count against it like any other silence.
      }
    }

    this.onTick?.();
  }
}
